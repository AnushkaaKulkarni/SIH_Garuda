import { calculateSessionScore, isAttackMode, isTrainingDifficulty, type TrainingSession } from '../training-session.ts'

export type RegistrationInput = { name: string; email: string; password: string }

export function validateRegistrationInput(value: unknown): RegistrationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.name !== 'string' || typeof input.email !== 'string' || typeof input.password !== 'string') return null
  const name = input.name.trim().replace(/\s+/g, ' ')
  const email = input.email.trim().toLowerCase()
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f]/.test(name)) return null
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  if (input.password.length < 10 || input.password.length > 128) return null
  if (input.role !== undefined && input.role !== 'SOLDIER' && input.role !== 'trainee') return null
  return { name, email, password: input.password }
}

export function validateLoginInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.email !== 'string' || typeof input.password !== 'string') return null
  const email = input.email.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.password.length > 128) return null
  if (input.role !== undefined && input.role !== 'SOLDIER' && input.role !== 'ADMIN' && input.role !== 'trainee' && input.role !== 'admin') return null
  return { email, password: input.password, expectedRole: input.role }
}

export function validateTrainingSessionStart(value: unknown) {
  if (!isRecord(value)) return null
  if (value.status !== 'IN_PROGRESS' || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{4,128}$/.test(value.id) ||
    typeof value.scenario !== 'string' || value.scenario.length < 1 || value.scenario.length > 100 ||
    !isTrainingDifficulty(value.difficulty) || (value.attackMode !== undefined && !isAttackMode(value.attackMode)) ||
    !Number.isSafeInteger(value.seed) || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt)) ||
    (value.mode !== undefined && value.mode !== 'desktop' && value.mode !== 'vr')) return null
  return {
    status: 'IN_PROGRESS' as const,
    id: value.id,
    scenario: value.scenario,
    difficulty: value.difficulty,
    attackMode: value.attackMode,
    seed: value.seed as number,
    startedAt: value.startedAt,
    mode: value.mode,
  }
}

const eventTypes = new Set([
  'MISSION_STARTED', 'DRONE_SPAWN', 'DRONE_DETECTED', 'DRONE_CLASSIFIED', 'THREAT_PRIORITIZED',
  'RESPONSE_SELECTED', 'DRONE_ENGAGED', 'DRONE_NEUTRALIZED', 'DRONE_MISSED', 'MISSION_COMPLETE',
])
const scoreRules = new Set([
  'event-performance-v1', 'event-performance-v2', 'event-performance-v3', 'event-performance-v4', 'legacy-hostile-response',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateTrainingSession(value: unknown): TrainingSession | null {
  if (!isRecord(value)) return null
  const session = value
  const environment = isRecord(session.environment) ? session.environment : null
  const decisions = isRecord(session.decisions) ? session.decisions : null
  if (![3, 4, 5].includes(session.version as number) || typeof session.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{4,128}$/.test(session.id) || typeof session.scenario !== 'string' ||
    session.scenario.length < 1 || session.scenario.length > 100 || !isTrainingDifficulty(session.difficulty) ||
    (session.attackMode !== undefined && !isAttackMode(session.attackMode)) ||
    !Number.isSafeInteger(session.seed) || typeof session.score !== 'number' || session.score < 0 || session.score > 100 ||
    typeof session.startedAt !== 'string' || !Number.isFinite(Date.parse(session.startedAt)) ||
    typeof session.completedAt !== 'string' || !Number.isFinite(Date.parse(session.completedAt)) ||
    typeof session.missionDurationMs !== 'number' || !Number.isFinite(session.missionDurationMs) || session.missionDurationMs < 0 ||
    !environment || !['terrain', 'time', 'visibility'].every((key) => typeof environment[key] === 'string' && (environment[key] as string).length <= 100) ||
    !Array.isArray(session.threats) || session.threats.length < 1 || session.threats.length > 300 ||
    !Array.isArray(session.events) || session.events.length > 10000 ||
    !decisions || !['classification', 'classificationThreatId', 'response'].every((key) => typeof decisions[key] === 'string') ||
    !(typeof decisions.priorityThreatId === 'string' || decisions.priorityThreatId === null) ||
    typeof session.scoreRule !== 'string' || !scoreRules.has(session.scoreRule)) return null

  const threatIds = new Set<string>()
  for (const threat of session.threats) {
    if (!isRecord(threat) || typeof threat.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(threat.id) || threatIds.has(threat.id) ||
      typeof threat.type !== 'string' || !Array.isArray(threat.spawnPosition) || threat.spawnPosition.length !== 3 ||
      !threat.spawnPosition.every((part) => typeof part === 'number' && Number.isFinite(part)) ||
      typeof threat.spawnTimeMs !== 'number' || !Number.isFinite(threat.spawnTimeMs) || !isRecord(threat.path)) return null
    threatIds.add(threat.id)
  }
  for (const event of session.events) {
    if (!isRecord(event) || typeof event.id !== 'string' || event.id.length > 160 ||
      typeof event.eventType !== 'string' || !eventTypes.has(event.eventType) ||
      typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp)) ||
      typeof event.elapsedMs !== 'number' || !Number.isFinite(event.elapsedMs) ||
      (event.threatId !== undefined && (typeof event.threatId !== 'string' || !threatIds.has(event.threatId)))) return null
  }

  const typed = session as unknown as TrainingSession
  if (typed.scoreRule !== 'legacy-hostile-response') {
    const scoreBreakdown = calculateSessionScore(typed.threats, typed.events, typed.difficulty, typed.scoreRule)
    return { ...typed, score: scoreBreakdown.awarded, scoreBreakdown }
  }
  return typed
}
