import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../lib/server/passwords.ts'
import { parseBhashiniTranslation } from '../lib/server/bhashini-response.ts'
import { validateLoginInput, validateRegistrationInput, validateTrainingSession, validateTrainingSessionStart } from '../lib/server/validation.ts'
import { calculateSessionScore, type TrainingSession } from '../lib/training-session.ts'
import { languageCodes, languages, translationLanguageCodes } from '../lib/language-catalog.ts'
import { staticUiTranslations } from '../lib/ui-translations.ts'
import { BhashiniServiceError, translateTexts } from '../lib/server/bhashini.ts'

test('language catalogue has unique native labels and keeps English as the fallback', () => {
  assert.equal(languages[0].code, 'en')
  assert.equal(new Set(languages.map((language) => language.code)).size, languages.length)
  assert.ok(languages.every((language) => language.label.trim().length > 0 && languageCodes.has(language.code)))
  assert.deepEqual(new Set(languages.filter((language) => language.translation).map((language) => language.code)), new Set(translationLanguageCodes))
  assert.equal(languages.find((language) => language.code === 'awa')?.translation, false)
  assert.equal(translationLanguageCodes.has('en'), true)
  assert.equal(staticUiTranslations.hi?.Dashboard, 'डैशबोर्ड')
  assert.equal(staticUiTranslations.mr, undefined)
})

test('registration accepts soldiers and rejects browser-supplied administrator privileges', () => {
  assert.deepEqual(validateRegistrationInput({ name: '  Arjun   Singh ', email: 'ARJUN@GARUDA.IN', password: 'long-password-1', role: 'SOLDIER' }), {
    name: 'Arjun Singh', email: 'arjun@garuda.in', password: 'long-password-1',
  })
  assert.equal(validateRegistrationInput({ name: 'Admin', email: 'admin@garuda.in', password: 'long-password-1', role: 'ADMIN' }), null)
  assert.equal(validateRegistrationInput({ name: 'A', email: 'not-an-email', password: 'short' }), null)
})

test('login validation normalizes email and accepts a selected expected account type', () => {
  assert.deepEqual(validateLoginInput({ email: 'SOLDIER@GARUDA.IN', password: 'some-password', role: 'admin' }), {
    email: 'soldier@garuda.in', password: 'some-password', expectedRole: 'admin',
  })
  assert.equal(validateLoginInput({ email: 'soldier@garuda.in', password: 'x', role: 'ROOT' }), null)
})

test('in-progress session creation validates configuration before persistence', () => {
  assert.equal(validateTrainingSessionStart({
    status: 'IN_PROGRESS', id: 'session_start_1', seed: 7, scenario: 'test-scenario', difficulty: 'Medium',
    attackMode: 'swarm', mode: 'vr', startedAt: '2026-10-15T00:00:00.000Z',
  })?.status, 'IN_PROGRESS')
  assert.equal(validateTrainingSessionStart({ status: 'IN_PROGRESS', id: 'bad id', scenario: 'test', difficulty: 'Easy', seed: 1, startedAt: new Date().toISOString() }), null)
})

test('password storage uses a one-way bcrypt hash', async () => {
  const password = 'valid test password 2026'
  const passwordHash = await hashPassword(password)
  assert.notEqual(passwordHash, password)
  assert.equal(await verifyPassword(password, passwordHash), true)
  assert.equal(await verifyPassword('different password', passwordHash), false)
})

function validSession(): TrainingSession {
  const threats: TrainingSession['threats'] = [{
    id: 'T-01', type: 'Hostile', expectedClassification: 'Hostile', signalClassification: 'Hostile',
    signalConfidence: 90, priority: 'High', spawnPosition: [0, 3, 0], spawnTimeMs: 0,
    path: { center: [0, 3, 0], amplitude: [1, 1], frequency: [0.1, 0.1], phase: 0, speed: 1 },
  }]
  const events: TrainingSession['events'] = [{
    id: 'event-1', eventType: 'MISSION_COMPLETE', timestamp: '2026-10-15T00:00:01.000Z', elapsedMs: 1000,
  }]
  const scoreBreakdown = calculateSessionScore(threats, events, 'Easy', 'event-performance-v4')
  return {
    version: 5, id: 'session_test_1', seed: 42, difficulty: 'Easy', attackMode: 'single', scenario: 'test-scenario',
    score: scoreBreakdown.awarded, startedAt: '2026-10-15T00:00:00.000Z', completedAt: '2026-10-15T00:00:01.000Z',
    missionDurationMs: 1000, environment: { terrain: 'test', time: 'day', visibility: 'clear' }, threats, events,
    decisions: { classification: '', classificationThreatId: '', priorityThreatId: null, response: '' },
    scoreRule: 'event-performance-v4', scoreBreakdown,
  }
}

test('session validation checks persisted data and recomputes the existing score rule', () => {
  const session = validSession()
  const accepted = validateTrainingSession({ ...session, score: 99 })
  assert.ok(accepted)
  assert.equal(accepted.score, session.scoreBreakdown.awarded)
  assert.equal(validateTrainingSession({ ...session, events: [{ ...session.events[0], eventType: 'RUN_ARBITRARY_ACTION' }] }), null)
  assert.equal(validateTrainingSession({ ...session, events: [{ ...session.events[0], threatId: 'T-UNKNOWN' }] }), null)
})

test('Bhashini response parser rejects malformed and oversized translated text', () => {
  assert.equal(parseBhashiniTranslation({ pipelineResponse: [] }), null)
  assert.equal(parseBhashiniTranslation({ pipelineResponse: [{ taskType: 'translation', output: [{ target: '  ' }] }] }), null)
  assert.equal(parseBhashiniTranslation({ pipelineResponse: [{ taskType: 'translation', output: [{ target: 'move forward' }] }] }), 'move forward')
  assert.equal(parseBhashiniTranslation({ pipelineResponse: [{ taskType: 'translation', output: [{ target: 'x'.repeat(1001) }] }] }), null)
})

test('Bhashini discovers a documented pipeline from the account config flow and caches its pair config', async () => {
  const saved = Object.fromEntries(['BHASHINI_USER_ID', 'BHASHINI_UDYAT_KEY', 'BHASHINI_INTERFERANCE_KEY'].map((name) => [name, process.env[name]]))
  const previousFetch = globalThis.fetch
  process.env.BHASHINI_USER_ID = 'test-user'
  process.env.BHASHINI_UDYAT_KEY = 'test-ulca-key'
  delete process.env.BHASHINI_INTERFERANCE_KEY
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    if (String(input) === 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline') return new Response(JSON.stringify({
      pipelineResponseConfig: [{ taskType: 'translation', config: [{ serviceId: 'test-translation-service', language: { sourceLanguage: 'hi', targetLanguage: 'en' } }] }],
      pipelineInferenceAPIEndPoint: {
        callbackUrl: 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline',
        inferenceApiKey: { name: 'Authorization', value: 'test-compute-token' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ pipelineResponse: [{ taskType: 'translation', output: [{ target: 'hello' }] }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    assert.deepEqual(await translateTexts(['नमस्ते'], 'en', 'hi'), ['hello'])
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline')
    assert.equal(new Headers(calls[0].init.headers).get('userID'), 'test-user')
    assert.equal(new Headers(calls[0].init.headers).get('ulcaApiKey'), 'test-ulca-key')
    const configBody = JSON.parse(String(calls[0].init.body)) as { pipelineRequestConfig: { pipelineId: string }; pipelineTasks: Array<{ config: { language: { sourceLanguage: string; targetLanguage: string } } }> }
    assert.equal(configBody.pipelineRequestConfig.pipelineId, '64392f96daac500b55c543cd')
    assert.deepEqual(configBody.pipelineTasks[0].config.language, { sourceLanguage: 'hi', targetLanguage: 'en' })
    assert.equal(new Headers(calls[1].init.headers).get('Authorization'), 'test-compute-token')
    assert.equal(new Headers(calls[0].init.headers).has('ulcaApiKey'), true)
    assert.equal(new Headers(calls[1].init.headers).get('ulcaApiKey'), null)
    const computeBody = JSON.parse(String(calls[1].init.body)) as { pipelineTasks: Array<{ config: { serviceId: string } }>; inputData: { input: Array<{ source: string }> } }
    assert.equal(computeBody.pipelineTasks[0].config.serviceId, 'test-translation-service')
    assert.deepEqual(computeBody.inputData.input, [{ source: 'नमस्ते' }])
    assert.deepEqual(await translateTexts(['नमस्ते'], 'en', 'hi'), ['hello'])
    assert.equal(calls.length, 3)
  } finally {
    globalThis.fetch = previousFetch
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('missing Bhashini ULCA authentication fails before making an upstream request', async () => {
  const previous = process.env.BHASHINI_USER_ID
  const previousFetch = globalThis.fetch
  delete process.env.BHASHINI_USER_ID
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return new Response('{}') }
  try {
    await assert.rejects(translateTexts(['safe diagnostic'], 'hi'), (error: unknown) =>
      error instanceof BhashiniServiceError && error.category === 'missing_environment' && error.environmentVariable === 'BHASHINI_USER_ID')
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = previousFetch
    if (previous === undefined) delete process.env.BHASHINI_USER_ID
    else process.env.BHASHINI_USER_ID = previous
  }
})
