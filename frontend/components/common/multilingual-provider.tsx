'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { translationLanguageCodes, type LanguageCode } from '@/lib/language-catalog'
import { staticUiTranslations } from '@/lib/ui-translations'

const STORAGE_KEY = 'garuda-language'
const CACHE_KEY = 'garuda-translation-cache-v1'
const Context = createContext<{ language: string; setLanguage: (value: string) => void; unavailable: boolean }>({
  language: 'en', setLanguage: () => undefined, unavailable: false,
})
type Cache = Record<string, string>
type OriginalNode = { original: string; rendered: string }

function readCache(): Cache {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch { return {} }
}

export function useLanguage() { return useContext(Context) }

export function MultilingualProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>('en')
  const [unavailable, setUnavailable] = useState(false)
  const originals = useRef(new WeakMap<Text, OriginalNode>())
  const unavailableFor = useRef<string | null>(null)
  const revision = useRef(0)

  const setLanguage = useCallback((value: string) => {
    if (!translationLanguageCodes.has(value)) return
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* Storage can be disabled. */ }
    setLanguageState(value)
    window.dispatchEvent(new CustomEvent('garuda-language-change', { detail: value }))
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && translationLanguageCodes.has(saved)) setLanguageState(saved)
    } catch { /* English remains the default without local storage. */ }
    const onPreference = (event: Event) => {
      const value = (event as CustomEvent<string>).detail
      if (translationLanguageCodes.has(value)) setLanguageState(value)
    }
    window.addEventListener('garuda-language-change', onPreference)
    return () => window.removeEventListener('garuda-language-change', onPreference)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    setUnavailable(false)
    unavailableFor.current = null
    const thisRevision = ++revision.current
    const cache = readCache()
    let timer: number | undefined
    let translating = false
    let rescanRequested = false

    const scan = async () => {
      if (thisRevision !== revision.current) return
      if (translating) { rescanRequested = true; return }
      translating = true
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const work = new Map<string, Text[]>()
        let node: Node | null
        while ((node = walker.nextNode())) {
          const textNode = node as Text
          const parent = textNode.parentElement
          if (!parent || parent.closest('script,style,noscript,svg,code,pre,option,[contenteditable="true"],[data-no-translate]')) continue
          const prior = originals.current.get(textNode)
          let current = textNode.nodeValue || ''
          const isTranslated = Boolean(prior && current.trim() === prior.rendered.trim())
          const originalText = isTranslated && prior ? prior.original : current
          if (prior && !isTranslated && current !== prior.original) originals.current.set(textNode, { original: current, rendered: current })
          const source = originalText.trim()
          if (!source || source.length > 500 || !/[\p{L}]/u.test(source)) continue
          if (language === 'en') {
            if (isTranslated && current !== originalText) {
              textNode.nodeValue = originalText
              originals.current.set(textNode, { original: originalText, rendered: originalText })
            }
            continue
          }
          if (isTranslated) {
            textNode.nodeValue = originalText
            current = originalText
          }
          if (!parent.closest('table,.avatar,.profile-card,.session-row,.notification-item,[data-sensitive]')) {
          const key = `${language}\u0000${source}`
          const translated = cache[key] || staticUiTranslations[language as LanguageCode]?.[source]
          if (translated) {
            if (current.trim() !== translated.trim()) textNode.nodeValue = current.replace(source, translated)
            originals.current.set(textNode, { original: originalText, rendered: textNode.nodeValue || '' })
          } else {
            const nodes = work.get(source) || []
            nodes.push(textNode)
            work.set(source, nodes)
            if (!prior || !isTranslated) originals.current.set(textNode, { original: originalText, rendered: originalText })
          }
          }
        }
        if (!work.size || unavailableFor.current === language) return
        const entries = [...work.entries()]
        for (let start = 0; start < entries.length; start += 10) {
          if (thisRevision !== revision.current) return
          const batch = entries.slice(start, start + 10)
          const response = await fetch('/api/language/translate-command', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLanguage: language, texts: batch.map(([text]) => text) }),
          })
          if (!response.ok) {
            unavailableFor.current = language
            setUnavailable(true)
            return
          }
          const result = await response.json() as { translations?: unknown }
          if (!Array.isArray(result.translations) || result.translations.length !== batch.length) {
            unavailableFor.current = language
            setUnavailable(true)
            return
          }
          for (let index = 0; index < batch.length; index += 1) {
            const [source, textNodes] = batch[index]
            const translated = result.translations[index]
            if (typeof translated !== 'string' || !translated.trim()) continue
            const target = translated.trim()
            cache[`${language}\u0000${source}`] = target
            for (const textNode of textNodes) {
              if (!textNode.isConnected || (textNode.nodeValue || '').trim() !== source) continue
              textNode.nodeValue = (textNode.nodeValue || '').replace(source, target)
              originals.current.set(textNode, { original: originals.current.get(textNode)?.original || source, rendered: textNode.nodeValue || '' })
            }
          }
        }
        const keys = Object.keys(cache)
        if (keys.length > 1200) for (const key of keys.slice(0, keys.length - 1000)) delete cache[key]
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* In-memory translations still work. */ }
      } catch {
        if (thisRevision === revision.current) {
          unavailableFor.current = language
          setUnavailable(true)
        }
      } finally {
        translating = false
        if (rescanRequested && thisRevision === revision.current) {
          rescanRequested = false
          window.setTimeout(() => { void scan() }, 0)
        }
      }
    }

    void scan()
    const observer = new MutationObserver(() => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void scan() }, 100)
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    return () => { revision.current += 1; observer.disconnect(); if (timer !== undefined) window.clearTimeout(timer) }
  }, [language])

  const value = useMemo(() => ({ language, setLanguage, unavailable }), [language, setLanguage, unavailable])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
