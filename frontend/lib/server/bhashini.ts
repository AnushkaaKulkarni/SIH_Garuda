import { optionalEnv } from './env.ts'
import { parseBhashiniTranslation } from './bhashini-response.ts'
import { translationLanguageCodes } from '../language-catalog.ts'

const CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline'
// These are the two pipeline IDs explicitly published by the official ULCA
// Pipeline Search documentation. Each is validated by a real config response;
// no unverified pipeline ID is accepted from browser input or environment.
const DOCUMENTED_PIPELINE_IDS = ['64392f96daac500b55c543cd', '643930aa521a4b1ba0f4c41d'] as const
const configCache = new Map<string, { value: TranslationConfig; expiresAt: number }>()

type TranslationConfig = { pipelineId: string; callbackUrl: string; serviceId: string; authName: string; authValue: string }
type JsonRecord = Record<string, unknown>
export type BhashiniFailureCategory = 'missing_environment' | 'authentication' | 'pipeline_not_found' | 'unsupported_language_or_request' | 'endpoint_not_found' | 'upstream_rejected' | 'rate_limited' | 'upstream_failure' | 'timeout' | 'network' | 'invalid_response'

export class BhashiniServiceError extends Error {
  readonly stage: 'configuration' | 'inference'
  readonly category: BhashiniFailureCategory
  readonly upstreamStatus?: number
  readonly environmentVariable?: string

  constructor(
    stage: 'configuration' | 'inference',
    category: BhashiniFailureCategory,
    upstreamStatus?: number,
    environmentVariable?: string,
  ) {
    super(`Bhashini ${stage} failed: ${category}`)
    this.stage = stage
    this.category = category
    this.upstreamStatus = upstreamStatus
    this.environmentVariable = environmentVariable
  }
}

function classifyStatus(stage: 'configuration' | 'inference', status: number): BhashiniFailureCategory {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 429) return 'rate_limited'
  if (status === 404) return stage === 'configuration' ? 'pipeline_not_found' : 'endpoint_not_found'
  if (status === 400 || status === 422) return 'unsupported_language_or_request'
  if (status >= 500) return 'upstream_failure'
  return stage === 'configuration' ? 'upstream_rejected' : 'upstream_failure'
}

function retryDelay(response: Response) {
  const retryAfter = Number(response.headers.get('retry-after'))
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 750) : 250
}

async function fetchBhashini(url: string, init: RequestInit, stage: 'configuration' | 'inference', timeoutMs: number) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
      const category: BhashiniFailureCategory = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network'
      if (attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 250)); continue }
      throw new BhashiniServiceError(stage, category)
    }
    if (response.ok) return response
    const category = classifyStatus(stage, response.status)
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response)))
      continue
    }
    throw new BhashiniServiceError(stage, category, response.status)
  }
  throw new BhashiniServiceError(stage, 'upstream_failure')
}

function invalidResponse(stage: 'configuration' | 'inference'): never {
  throw new BhashiniServiceError(stage, 'invalid_response')
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeInferenceUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !(url.hostname === 'bhashini.gov.in' || url.hostname.endsWith('.bhashini.gov.in'))) return null
    return url.toString()
  } catch {
    return null
  }
}

function getTranslationPairConfig(payload: unknown, pipelineId: string, sourceLanguage: string, targetLanguage: string): TranslationConfig | null {
  if (!isRecord(payload)) return null
  const task = Array.isArray(payload.pipelineResponseConfig)
    ? payload.pipelineResponseConfig.find((item) => isRecord(item) && item.taskType === 'translation')
    : null
  const taskConfigs = isRecord(task) && Array.isArray(task.config) ? task.config : []
  const taskConfig = taskConfigs.find((item) => isRecord(item) && typeof item.serviceId === 'string' && item.serviceId &&
    isRecord(item.language) && item.language.sourceLanguage === sourceLanguage && item.language.targetLanguage === targetLanguage)
  const endpoint = payload.pipelineInferenceAPIEndPoint
  const callbackUrl = isRecord(endpoint) ? safeInferenceUrl(endpoint.callbackUrl) : null
  const apiAuth = isRecord(endpoint) && isRecord(endpoint.inferenceApiKey) ? endpoint.inferenceApiKey : null
  if (!callbackUrl || !isRecord(taskConfig) || !apiAuth ||
    typeof apiAuth.name !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(apiAuth.name) ||
    typeof apiAuth.value !== 'string' || !apiAuth.value) return null
  return { pipelineId, callbackUrl, serviceId: taskConfig.serviceId as string, authName: apiAuth.name, authValue: apiAuth.value }
}

async function getTranslationConfig(sourceLanguage: string, targetLanguage: string): Promise<TranslationConfig> {
  const userId = optionalEnv('BHASHINI_USER_ID')
  const apiKey = optionalEnv('BHASHINI_UDYAT_KEY')
  if (!userId) throw new BhashiniServiceError('configuration', 'missing_environment', undefined, 'BHASHINI_USER_ID')
  if (!apiKey) throw new BhashiniServiceError('configuration', 'missing_environment', undefined, 'BHASHINI_UDYAT_KEY')
  const cacheKey = `${sourceLanguage}:${targetLanguage}`
  const cached = configCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let lastError: BhashiniServiceError | undefined
  for (const pipelineId of DOCUMENTED_PIPELINE_IDS) {
    let response: Response
    try {
      response = await fetchBhashini(CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', userID: userId, ulcaApiKey: apiKey },
        body: JSON.stringify({
          pipelineTasks: [{ taskType: 'translation', config: { language: { sourceLanguage, targetLanguage } } }],
          pipelineRequestConfig: { pipelineId },
        }),
        cache: 'no-store',
      }, 'configuration', 10000)
    } catch (error) {
      if (!(error instanceof BhashiniServiceError)) throw error
      lastError = error
      // Authentication and transient failures apply to the account/service;
      // trying a second published ID cannot fix them. Only test another
      // documented candidate when the service rejects the requested pipeline.
      if (error.category === 'authentication' || error.category === 'network' || error.category === 'timeout' ||
        error.category === 'rate_limited' || error.category === 'upstream_failure') throw error
      continue
    }
    let payload: unknown
    try { payload = await response.json() } catch { return invalidResponse('configuration') }
    const config = getTranslationPairConfig(payload, pipelineId, sourceLanguage, targetLanguage)
    if (!config) {
      lastError = new BhashiniServiceError('configuration', 'invalid_response')
      continue
    }
    configCache.set(cacheKey, { value: config, expiresAt: Date.now() + 5 * 60 * 1000 })
    return config
  }
  throw lastError ?? new BhashiniServiceError('configuration', 'unsupported_language_or_request')
}

export async function translateTexts(texts: string[], targetLanguage: string, sourceLanguage = 'en') {
  if (!translationLanguageCodes.has(targetLanguage) || !translationLanguageCodes.has(sourceLanguage) || targetLanguage === sourceLanguage || texts.length < 1 || texts.length > 20) return null
  if (!texts.every((text) => typeof text === 'string' && text.trim().length > 0 && text.length <= 500)) return null
  const config = await getTranslationConfig(sourceLanguage, targetLanguage)
  const response = await fetchBhashini(config.callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [config.authName]: config.authValue },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'translation', config: { language: { sourceLanguage, targetLanguage }, serviceId: config.serviceId } }],
      inputData: { input: texts.map((text) => ({ source: text.trim() })) },
    }),
    cache: 'no-store',
  }, 'inference', 12000)
  let parsed: unknown
  try { parsed = await response.json() } catch { return invalidResponse('inference') }
  const translated = parseBhashiniTranslations(parsed, texts.length)
  if (!translated) return invalidResponse('inference')
  return translated
}

export async function translateHindiCommand(text: string) {
  const translated = await translateTexts([text], 'en', 'hi')
  return translated?.[0] ?? null
}

function parseBhashiniTranslations(value: unknown, expected: number): string[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as { pipelineResponse?: unknown }
  if (!Array.isArray(response.pipelineResponse)) return null
  const task = response.pipelineResponse.find((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && (item as { taskType?: unknown }).taskType === 'translation')
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null
  const output = (task as { output?: unknown }).output
  if (!Array.isArray(output) || output.length !== expected) return null
  const translated = output.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const target = (entry as { target?: unknown }).target
    return typeof target === 'string' && target.trim().length > 0 && target.length <= 3000 ? target.trim() : null
  })
  return translated.every((item): item is string => item !== null) ? translated : null
}
