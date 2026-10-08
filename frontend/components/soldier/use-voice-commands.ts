'use client'

import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0?: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionErrorLike = { error: string }

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function errorMessage(code: string) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone permission was denied or blocked.'
  if (code === 'audio-capture') return 'No microphone is available.'
  if (code === 'network') return 'Browser speech recognition is unavailable on this network.'
  if (code === 'no-speech') return 'No speech detected. Listening will retry briefly.'
  return 'Voice recognition stopped. Press Enable Voice to try again.'
}

export type VoiceLanguage = 'English' | 'Hindi' | 'Hinglish'

const resolveSpeechLanguage = (language: VoiceLanguage) => {
  if (language === 'Hindi') return 'hi-IN'
  if (language === 'Hinglish') return 'en-IN'
  return 'en-IN'
}

export function useVoiceCommands(onFinalTranscript: (transcript: string) => void, language: VoiceLanguage = 'English') {
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const callback = useRef(onFinalTranscript)
  const listeningRequested = useRef(false)
  const consecutiveRestarts = useRef(0)
  const restartTimer = useRef<number | null>(null)

  callback.current = onFinalTranscript

  useEffect(() => {
    const browser = window as SpeechWindow
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Recognition) {
      setIsSupported(false)
      return
    }

    const instance = new Recognition()
    recognition.current = instance
    instance.continuous = true
    instance.interimResults = false
    instance.lang = resolveSpeechLanguage(language)
    setIsSupported(true)

    instance.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const finalTranscript = result?.isFinal ? result[0]?.transcript.trim() : ''
        if (!finalTranscript) continue
        consecutiveRestarts.current = 0
        setTranscript(finalTranscript)
        callback.current(finalTranscript)
      }
    }

    instance.onerror = (event) => {
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)
      setError(errorMessage(event.error))
      if (fatal) {
        listeningRequested.current = false
        setIsListening(false)
      }
    }

    instance.onend = () => {
      setIsListening(false)
      if (!listeningRequested.current) return
      consecutiveRestarts.current += 1
      if (consecutiveRestarts.current > 3) {
        listeningRequested.current = false
        setError('Voice recognition stopped. Press Enable Voice to retry.')
        return
      }
      restartTimer.current = window.setTimeout(() => {
        if (!listeningRequested.current) return
        try {
          instance.start()
          setIsListening(true)
        } catch {
          listeningRequested.current = false
          setError('Voice recognition could not restart. Press Enable Voice to try again.')
        }
      }, 350)
    }

    return () => {
      listeningRequested.current = false
      if (restartTimer.current !== null) window.clearTimeout(restartTimer.current)
      instance.onresult = null
      instance.onerror = null
      instance.onend = null
      try { instance.abort() } catch { /* Recognition may already be stopped. */ }
      recognition.current = null
    }
  }, [language])

  useEffect(() => {
    if (!recognition.current) return
    recognition.current.lang = resolveSpeechLanguage(language)
  }, [language])

  const startListening = () => {
    if (!recognition.current || !isSupported) return
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current)
    setError('')
    listeningRequested.current = true
    consecutiveRestarts.current = 0
    try {
      recognition.current.start()
      setIsListening(true)
    } catch {
      listeningRequested.current = false
      setIsListening(false)
      setError('Voice recognition could not start. Check microphone permission and try again.')
    }
  }

  const stopListening = () => {
    listeningRequested.current = false
    if (restartTimer.current !== null) window.clearTimeout(restartTimer.current)
    try { recognition.current?.stop() } catch { /* Recognition may already be stopped. */ }
    setIsListening(false)
    setError('')
  }

  return { isSupported, isListening, transcript, error, startListening, stopListening }
}
