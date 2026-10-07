export type ThreatPriority = 'High' | 'Medium' | 'Low'
export type TrainingDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert'
export type SessionScoreRule = 'event-performance-v1' | 'event-performance-v2' | 'event-performance-v3' | 'legacy-hostile-response'
export type SimulationEventType =
  | 'MISSION_STARTED'
  | 'DRONE_SPAWN'
  | 'DRONE_DETECTED'
  | 'DRONE_CLASSIFIED'
  | 'THREAT_PRIORITIZED'
  | 'RESPONSE_SELECTED'
  | 'DRONE_ENGAGED'
  | 'DRONE_NEUTRALIZED'
  | 'DRONE_MISSED'
  | 'MISSION_COMPLETE'

export type SessionThreat = {
  id: string
  type: string
  expectedClassification: string
  signalClassification: string
  signalConfidence: number
  priority: ThreatPriority
  spawnPosition: [number, number, number]
  spawnTimeMs: number
  path: {
    trajectory?: 'approach' | 'crossing' | 'altitude' | 'retreat' | 'arc'
    speed?: number
    waypoints?: [number, number, number][]
    center: [number, number, number]
    amplitude: [number, number]
    frequency: [number, number]
    phase: number
    verticalAmplitude?: number
    verticalFrequency?: number
    rotationAmplitude?: number
  }
}

export type SessionEvent = {
  id: string
  timestamp: string
  elapsedMs: number
  eventType: SimulationEventType
  threatId?: string
  position?: [number, number, number]
  threatType?: string
  expectedClassification?: string
  actualClassification?: string
  expectedPriority?: ThreatPriority
  actualPriority?: ThreatPriority
  action?: string
  result?: 'correct' | 'incorrect' | 'successful' | 'missed' | 'recorded'
  modified?: boolean
}

export type SessionScoreBreakdown = {
  rule: string
  detectionScore: number
  classificationScore: number
  prioritizationScore: number
  responseScore: number
  penaltyScore: number
  awarded: number
}

export type TrainingSession = {
  version: 3 | 4
  id: string
  seed: number
  difficulty: TrainingDifficulty
  scenario: string
  score: number
  completedAt: string
  startedAt: string
  missionDurationMs: number
  environment: {
    terrain: string
    time: string
    visibility: string
  }
  threats: SessionThreat[]
  events: SessionEvent[]
  decisions: {
    classification: string
    classificationThreatId: string
    priorityThreatId: string | null
    response: string
  }
  scoreRule: SessionScoreRule
  scoreBreakdown: SessionScoreBreakdown
}

export type SessionMetrics = {
  threatCount: number
  detected: number
  missed: number
  detectionAccuracy: number
  averageDetectionMs: number | null
  fastestDetection: SessionEvent | null
  slowestDetection: SessionEvent | null
  lateDetections: number
  correctClassifications: number
  incorrectClassifications: number
  classificationAccuracy: number | null
  priorityAccuracy: number | null
  correctPriorityDecisions: number
  incorrectPriorityDecisions: number
  responseAccuracy: number | null
  successfulEngagements: number | null
  incorrectDecisions: number
}

export type WhatIfOpportunity = {
  title: string
  description: string
  changedEvent: SessionEvent
  hypotheticalEvent: SessionEvent
  originalElapsedMs: number
  whatIfElapsedMs: number
  actualScore: number
  whatIfScore: number
  reason: string
}

const detectionWindows: Record<TrainingDifficulty, number> = {
  Easy: 15_000,
  Medium: 10_000,
  Hard: 8_000,
  Expert: 6_000,
}

export function getPriority(classification: string): ThreatPriority {
  if (classification === 'Hostile') return 'High'
  if (classification === 'Unknown') return 'Medium'
  return 'Low'
}

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createScenarioSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 0x1_0000_0000)
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

function latestEventsByThreat(events: SessionEvent[], eventType: SimulationEventType) {
  const latest = new Map<string, SessionEvent>()
  events
    .filter((event) => event.eventType === eventType && event.threatId)
    .forEach((event) => latest.set(event.threatId!, event))
  return latest
}

function responseIsCorrect(event: SessionEvent, threats: SessionThreat[]) {
  const threat = threats.find((candidate) => candidate.id === event.threatId)
  if (!threat) return false
  const expectedAction = threat.expectedClassification === 'Hostile'
    ? 'Escalate alert'
    : threat.expectedClassification === 'Unknown'
      ? 'Track priority threat'
      : 'Continue monitoring'
  return event.action === expectedAction
}

export function calculateSessionScore(
  threats: SessionThreat[],
  events: SessionEvent[],
  difficulty: TrainingDifficulty,
  scoreRule: Exclude<SessionScoreRule, 'legacy-hostile-response'> = 'event-performance-v2',
): SessionScoreBreakdown {
  const safeThreatCount = Math.max(threats.length, 1)
  const detections = latestEventsByThreat(events, 'DRONE_DETECTED')
  const classifications = latestEventsByThreat(events, 'DRONE_CLASSIFIED')
  const priorities = latestEventsByThreat(events, 'THREAT_PRIORITIZED')
  const detectionWindow = detectionWindows[difficulty]

  const detectionScore = threats.reduce((total, threat) => {
    const detection = detections.get(threat.id)
    if (!detection) return total
    const speedFactor = Math.max(0, 1 - (detection.elapsedMs / detectionWindow) * 0.35)
    return total + (30 / safeThreatCount) * speedFactor
  }, 0)
  const classificationScore = threats.reduce(
    (total, threat) => total + (classifications.get(threat.id)?.result === 'correct' ? 30 / safeThreatCount : 0),
    0,
  )
  const prioritizationScore = threats.reduce(
    (total, threat) => total + (priorities.get(threat.id)?.result === 'correct' ? 20 / safeThreatCount : 0),
    0,
  )
  const responseEvents = events.filter((event) => event.eventType === 'RESPONSE_SELECTED')
  const latestResponseEvent = responseEvents.at(-1)
  const responseScore = scoreRule === 'event-performance-v3'
    ? responseEvents.length
      ? (20 * responseEvents.filter((event) => responseIsCorrect(event, threats)).length) / responseEvents.length
      : 0
    : latestResponseEvent && responseIsCorrect(latestResponseEvent, threats) ? 20 : 0
  const incorrectClassificationCount = [...classifications.values()].filter((event) => event.result === 'incorrect').length
  const incorrectPriorityCount = [...priorities.values()].filter((event) => event.result === 'incorrect').length
  const penaltyScore = scoreRule === 'event-performance-v1'
    ? -Math.min(
        20,
        incorrectClassificationCount * 2 +
          incorrectPriorityCount * 2 +
          (responseEvent && !responseIsCorrect(responseEvent, threats) ? 4 : 0),
      )
    : 0
  const awarded = Math.max(
    0,
    Math.min(100, Math.round(detectionScore + classificationScore + prioritizationScore + responseScore + penaltyScore)),
  )

  return {
    rule: scoreRule === 'event-performance-v1'
      ? 'Detection (30), classification (30), prioritization (20), and response (20), with deductions for incorrect decisions.'
      : scoreRule === 'event-performance-v3'
        ? 'Detection (30), classification (30), prioritization (20), and response (20); each recorded response contributes to response accuracy.'
        : 'Detection (30), classification (30), prioritization (20), and response (20); incorrect or missed outcomes earn no points in that category.',
    detectionScore: Math.round(detectionScore),
    classificationScore: Math.round(classificationScore),
    prioritizationScore: Math.round(prioritizationScore),
    responseScore,
    penaltyScore,
    awarded,
  }
}

export function getSessionMetrics(session: TrainingSession): SessionMetrics {
  const detectionEvents = session.events.filter((event) => event.eventType === 'DRONE_DETECTED')
  const detectedThreatIds = new Set(detectionEvents.map((event) => event.threatId))
  const missed = new Set(
    session.events
      .filter((event) => event.eventType === 'DRONE_MISSED')
      .map((event) => event.threatId)
      .filter((threatId): threatId is string => Boolean(threatId)),
  ).size
  const classificationEvents = [...latestEventsByThreat(session.events, 'DRONE_CLASSIFIED').values()]
  const correctClassifications = classificationEvents.filter((event) => event.result === 'correct').length
  const incorrectClassifications = classificationEvents.filter((event) => event.result === 'incorrect').length
  const priorityEvents = [...latestEventsByThreat(session.events, 'THREAT_PRIORITIZED').values()]
  const correctPriorityDecisions = priorityEvents.filter((event) => event.result === 'correct').length
  const incorrectPriorityDecisions = priorityEvents.filter((event) => event.result === 'incorrect').length
  const detectionsSorted = [...detectionEvents].sort((first, second) => first.elapsedMs - second.elapsedMs)
  const responseEvents = session.events.filter((event) => event.eventType === 'RESPONSE_SELECTED')
  const correctResponses = responseEvents.filter((event) => responseIsCorrect(event, session.threats)).length
  const scoredClassifications = correctClassifications + incorrectClassifications
  const scoredPriorities = correctPriorityDecisions + incorrectPriorityDecisions
  return {
    threatCount: session.threats.length,
    detected: detectedThreatIds.size,
    missed,
    detectionAccuracy: session.threats.length ? (detectedThreatIds.size / session.threats.length) * 100 : 0,
    averageDetectionMs: detectionEvents.length
      ? detectionEvents.reduce((total, event) => total + event.elapsedMs, 0) / detectionEvents.length
      : null,
    fastestDetection: detectionsSorted[0] ?? null,
    slowestDetection: detectionsSorted.at(-1) ?? null,
    lateDetections: detectionEvents.filter((event) => event.elapsedMs > detectionWindows[session.difficulty]).length,
    correctClassifications,
    incorrectClassifications,
    classificationAccuracy: scoredClassifications
      ? (correctClassifications / scoredClassifications) * 100
      : null,
    priorityAccuracy: scoredPriorities ? (correctPriorityDecisions / scoredPriorities) * 100 : null,
    correctPriorityDecisions,
    incorrectPriorityDecisions,
    responseAccuracy: responseEvents.length ? (correctResponses / responseEvents.length) * 100 : null,
    successfulEngagements: session.events.some(
      (event) => event.eventType === 'DRONE_ENGAGED' || event.eventType === 'DRONE_NEUTRALIZED',
    )
      ? session.events.filter(
          (event) =>
            (event.eventType === 'DRONE_ENGAGED' || event.eventType === 'DRONE_NEUTRALIZED') &&
            event.result === 'successful',
        ).length
      : null,
    incorrectDecisions: incorrectClassifications + incorrectPriorityDecisions +
      responseEvents.filter((event) => !responseIsCorrect(event, session.threats)).length,
  }
}

function withChangedEvent(events: SessionEvent[], original: SessionEvent, replacement: SessionEvent) {
  return events.map((event) => event.id === original.id ? replacement : event)
}

export function getWhatIfOpportunity(session: TrainingSession): WhatIfOpportunity | null {
  const candidates: WhatIfOpportunity[] = []
  const scoreRule = session.scoreRule === 'event-performance-v1' || session.scoreRule === 'event-performance-v3'
    ? session.scoreRule
    : 'event-performance-v2'
  const baselineScore = calculateSessionScore(session.threats, session.events, session.difficulty, scoreRule).awarded
  const consider = (
    event: SessionEvent,
    hypotheticalEvent: SessionEvent,
    title: string,
    description: string,
    reason: string,
  ) => {
    const hypotheticalEvents = withChangedEvent(session.events, event, hypotheticalEvent)
    const whatIfScore = calculateSessionScore(session.threats, hypotheticalEvents, session.difficulty, scoreRule).awarded
    if (whatIfScore <= baselineScore) return
    candidates.push({
      title,
      description,
      changedEvent: event,
      hypotheticalEvent,
      originalElapsedMs: event.elapsedMs,
      whatIfElapsedMs: hypotheticalEvent.elapsedMs,
      actualScore: session.score,
      whatIfScore,
      reason,
    })
  }

  for (const event of session.events) {
    if (event.eventType === 'DRONE_CLASSIFIED' && event.result === 'incorrect' && event.expectedClassification) {
      consider(
        event,
        { ...event, actualClassification: event.expectedClassification, result: 'correct' },
        `Classification decision on ${event.threatId}`,
        `The recorded classification was ${event.actualClassification}; the scenario signature was ${event.expectedClassification}.`,
        'The hypothetical replay corrects this classification only and recalculates the event-based score.',
      )
    }

    if (event.eventType === 'THREAT_PRIORITIZED' && event.result === 'incorrect') {
      const topThreat = session.threats
        .filter((threat) => threat.priority === 'High')
        .sort((first, second) => first.id.localeCompare(second.id))[0]
      if (topThreat) {
        consider(
          event,
          {
            ...event,
            threatId: topThreat.id,
            position: topThreat.spawnPosition,
            threatType: topThreat.type,
            expectedClassification: topThreat.expectedClassification,
            expectedPriority: topThreat.priority,
            actualPriority: topThreat.priority,
            result: 'correct',
          },
          `Prioritization decision corrected`,
          `The chosen contact was lower priority than ${topThreat.id}.`,
          'The hypothetical replay corrects this prioritization event only and recalculates the event-based score.',
        )
      }
    }

    if (event.eventType === 'DRONE_DETECTED') {
      const threat = session.threats.find((item) => item.id === event.threatId)
      const improvedElapsedMs = Math.max(
        threat?.spawnTimeMs ?? 0,
        Math.floor(detectionWindows[session.difficulty] / 2),
      )
      if (event.elapsedMs <= improvedElapsedMs) continue
      consider(
        event,
        { ...event, elapsedMs: improvedElapsedMs, modified: true },
        `Earlier detection of ${event.threatId}`,
        `${event.threatId} was detected at ${formatDuration(event.elapsedMs)}.`,
        'The hypothetical replay moves this detection earlier while preserving the scenario, threats, and all other events.',
      )
    }
  }

  const missedEvents = session.events.filter((event) => event.eventType === 'DRONE_MISSED')
  for (const event of missedEvents) {
    const threat = session.threats.find((item) => item.id === event.threatId)
    if (!threat || threat.spawnTimeMs >= session.missionDurationMs) continue
    const improvedElapsedMs = Math.max(
      threat.spawnTimeMs,
      Math.floor(detectionWindows[session.difficulty] / 2),
    )
    if (improvedElapsedMs >= session.missionDurationMs) continue
    consider(
      event,
      {
        ...event,
        eventType: 'DRONE_DETECTED',
        elapsedMs: improvedElapsedMs,
        result: 'recorded',
        modified: true,
      },
      `Detection of missed contact ${threat.id}`,
      `${threat.id} was not detected before the session ended.`,
      'The hypothetical replay replaces this missed outcome with a detection and recalculates the event-based score.',
    )
  }

  for (const event of session.events) {
    if (event.eventType !== 'RESPONSE_SELECTED' || responseIsCorrect(event, session.threats)) continue
    const threat = session.threats.find((item) => item.id === event.threatId)
    if (!threat) continue
    const expectedAction = threat.expectedClassification === 'Hostile'
      ? 'Escalate alert'
      : threat.expectedClassification === 'Unknown'
        ? 'Track priority threat'
        : 'Continue monitoring'
    consider(
      event,
      { ...event, action: expectedAction, result: 'correct' },
      `Response decision for ${threat.id}`,
      `The recorded response was ${event.action}; the recorded threat signature supports ${expectedAction}.`,
      'The hypothetical replay corrects this response only and recalculates the event-based score.',
    )
  }

  return candidates.sort((first, second) => second.whatIfScore - first.whatIfScore)[0] ?? null
}

export function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`
}

const sessionKey = (id: string) => `garuda-training-session:${id}`

function parseSession(value: string | null): TrainingSession | null {
  if (!value) return null
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') return null
  const candidate = parsed as Partial<TrainingSession>
  if (
    (candidate.version !== 3 && candidate.version !== 4) ||
    typeof candidate.id !== 'string' ||
    typeof candidate.scenario !== 'string' ||
    typeof candidate.score !== 'number' ||
    !Array.isArray(candidate.threats) ||
    !Array.isArray(candidate.events) ||
    !candidate.environment ||
    !candidate.decisions ||
    typeof candidate.startedAt !== 'string' ||
    typeof candidate.completedAt !== 'string' ||
    typeof candidate.missionDurationMs !== 'number'
  ) return null
  return candidate as TrainingSession
}

export function readTrainingSession(id: string): TrainingSession | null {
  try {
    return parseSession(window.localStorage.getItem(sessionKey(id)))
  } catch (error) {
    console.error(`Unable to read training session "${id}".`, error)
    return null
  }
}

export type TrainingHistoryItem = {
  id: string
  scenario: string
  score: number
  completedAt: string
  difficulty: TrainingDifficulty
}

export function saveTrainingSession(session: TrainingSession): string | null {
  try {
    window.localStorage.setItem(sessionKey(session.id), JSON.stringify(session))
    window.sessionStorage.setItem('garuda-last-session', JSON.stringify(session))
    const stored = window.localStorage.getItem('garuda-training-sessions')
    const history: unknown = stored ? JSON.parse(stored) : []
    const records = Array.isArray(history)
      ? history.filter(
          (item): item is TrainingHistoryItem =>
            item &&
            typeof item.id === 'string' &&
            typeof item.scenario === 'string' &&
            typeof item.score === 'number' &&
            typeof item.completedAt === 'string' &&
            typeof item.difficulty === 'string',
        )
      : []
    window.localStorage.setItem(
      'garuda-training-sessions',
      JSON.stringify([
        ...records.filter((item) => item.id !== session.id),
        {
          id: session.id,
          scenario: session.scenario,
          score: session.score,
          completedAt: session.completedAt,
          difficulty: session.difficulty,
        },
      ]),
    )
    return null
  } catch (error) {
    console.error('Unable to persist the completed training session.', error)
    return 'Session completed, but browser storage could not save its replay data.'
  }
}

export function readTrainingHistory(): TrainingHistoryItem[] {
  try {
    const stored = window.localStorage.getItem('garuda-training-sessions')
    const parsed: unknown = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is TrainingHistoryItem =>
        item &&
        typeof item.id === 'string' &&
        typeof item.scenario === 'string' &&
        typeof item.score === 'number' &&
        typeof item.completedAt === 'string' &&
        typeof item.difficulty === 'string',
    )
  } catch (error) {
    console.error('Unable to read training history.', error)
    return []
  }
}
