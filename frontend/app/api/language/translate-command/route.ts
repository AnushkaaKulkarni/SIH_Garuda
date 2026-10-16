import { translationLanguageCodes } from '@/lib/language-catalog'
import { BhashiniServiceError, translateHindiCommand, translateTexts } from '@/lib/server/bhashini'
import { jsonError, readJson, requestBodyError } from '@/lib/server/http'
import { allowAttempt, checkSameOrigin, getAuthenticatedUser } from '@/lib/server/security'

export const runtime = 'nodejs'

function logBhashiniFailure(flow: 'ui' | 'voice', error: unknown) {
  if (error instanceof BhashiniServiceError) {
    console.warn('Bhashini translation failed.', {
      flow,
      stage: error.stage,
      category: error.category,
      ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
      ...(error.environmentVariable ? { missingEnvironmentVariable: error.environmentVariable } : {}),
    })
    return
  }
  console.warn('Bhashini translation failed.', { flow, category: 'unexpected' })
}

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return jsonError('Request origin is not allowed.', 403)
  let body: unknown
  try { body = await readJson(request, 8192) } catch (error) { return requestBodyError(error) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('Provide text to translate.', 400)
  const input = body as { text?: unknown; texts?: unknown; targetLanguage?: unknown }
  if (Array.isArray(input.texts)) {
    if (!await allowAttempt(request, 'bhashini-ui-translation', 120)) return jsonError('Too many translation requests. Try again later.', 429)
    if (typeof input.targetLanguage !== 'string' || !translationLanguageCodes.has(input.targetLanguage) || input.targetLanguage === 'en' ||
      input.texts.length < 1 || input.texts.length > 20 ||
      !input.texts.every((value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500) ||
      input.texts.reduce((size, value) => size + (typeof value === 'string' ? value.length : 0), 0) > 8000) {
      return jsonError('Provide 1–20 short strings and a supported target language.', 400)
    }
    try {
      const translations = await translateTexts(input.texts as string[], input.targetLanguage)
      if (!translations) return jsonError('The selected language is not configured for translation.', 503)
      return Response.json({ translations }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
    } catch (error) {
      logBhashiniFailure('ui', error)
      return jsonError('Bhashini translation is temporarily unavailable. English text remains available.', 503)
    }
  }
  const user = await getAuthenticatedUser()
  if (!user) return jsonError('Sign in to use multilingual voice commands.', 401)
  if (!await allowAttempt(request, `bhashini:${user._id.toHexString()}`, 120)) return jsonError('Too many translation requests. Try again in 15 minutes.', 429)
  if (typeof input.text !== 'string') return jsonError('Provide the recognized command text.', 400)
  const text = input.text.trim()
  if (!text || text.length > 500) return jsonError('Command text must be between 1 and 500 characters.', 400)
  try {
    const translatedText = await translateHindiCommand(text)
    if (!translatedText) return jsonError('Hindi command translation is not configured.', 503)
    return Response.json({ text: translatedText }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logBhashiniFailure('voice', error)
    return jsonError('Hindi command translation is temporarily unavailable.', 503)
  }
}
