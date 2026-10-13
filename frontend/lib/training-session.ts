export type ThreatPriority = 'High' | 'Medium' | 'Low'
export type TrainingDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert'
export type TrainingMode = 'desktop' | 'vr'
export type AttackMode = 'single' | 'multiple' | 'swarm' | 'mixed'
export type SessionScoreRule = 'event-performance-v1' | 'event-performance-v2' | 'event-performance-v3' | 'event-performance-v4' | 'legacy-hostile-response'
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
  attackGroupId?: string
  attackGroupType?: 'swarm'
  path: {
    trajectory?: 'approach' | 'crossing' | 'altitude' | 'retreat' | 'arc' | 'parallel'
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
  detectableAtMs?: number
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
  version: 3 | 4 | 5
  mode?: TrainingMode
  id: string
  seed: number
  difficulty: TrainingDifficulty
  attackMode?: AttackMode
  generatorVersion?: number
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

export function getDetectionWindowMs(difficulty: TrainingDifficulty) {
  return detectionWindows[difficulty]
}

export function getPriority(classification: string): ThreatPriority {
  if (classification === 'Hostile') return 'High'
  if (classification === 'Unknown') return 'Medium'
  return 'Low'
}

export function getScenarioPriority(classification: string, trajectory: string | undefined, speed: number) {
  if (classification === 'Friendly') return 'Low' as const
  if (classification === 'Hostile' && trajectory === 'approach' && speed >= 0.75) return 'High' as const
  if (classification === 'Unknown' && trajectory === 'approach' && speed >= 1.2) return 'High' as const
  return 'Medium' as const
}

export type ProtectedZone = {
  id: string
  name: string
  position: [number, number, number]
  radius: number
  priority: ThreatPriority
}

export const HIMALAYAN_PROTECTED_ZONES: ProtectedZone[] = [
  { id: 'forward-outpost', name: 'FORWARD OUTPOST', position: [-20, 1.2, 12], radius: 10, priority: 'High' },
  { id: 'communication-station', name: 'COMMUNICATION STATION', position: [3, 1.2, -12], radius: 8, priority: 'High' },
  { id: 'radar-station', name: 'RADAR / SENSOR STATION', position: [18, 1.6, 10], radius: 9, priority: 'High' },
  { id: 'supply-area', name: 'SUPPLY / LOGISTICS AREA', position: [-2, 0.8, -28], radius: 12, priority: 'Medium' },
  { id: 'ridge-road', name: 'PROTECTED ROAD / ROUTE', position: [0, 1.4, 18], radius: 15, priority: 'Medium' },
]

export function getHimalayanThreatAssessment(threat: SessionThreat): {
  zoneId: string
  zoneName: string
  status: 'Far' | 'Approaching' | 'Entering' | 'Crossing' | 'Departing'
  direction: 'Toward' | 'Away' | 'Crossing'
  priority: 'Low' | 'Medium' | 'High' | 'Unknown'
  timeToZoneMs: number
} {
  const points = threat.path.waypoints?.length ? threat.path.waypoints : [threat.spawnPosition]
  const route = points.length > 1 ? points : [points[0], points[0]]
  const routeLength = route.slice(1).reduce((length, point, index) => (
    length + Math.hypot(point[0] - route[index][0], point[2] - route[index][2])
  ), 0)
  const closestPointOnSegment = (zone: ProtectedZone, start: [number, number, number], end: [number, number, number]) => {
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const lengthSquared = dx * dx + dz * dz
    const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((zone.position[0] - start[0]) * dx + (zone.position[2] - start[2]) * dz) / lengthSquared))
    const x = start[0] + dx * progress
    const z = start[2] + dz * progress
    return {
      distance: Math.hypot(x - zone.position[0], z - zone.position[2]),
      progress,
      segmentLength: Math.sqrt(lengthSquared),
    }
  }

  const relevantZone = HIMALAYAN_PROTECTED_ZONES.map((zone) => {
    let closestDistance = Number.POSITIVE_INFINITY
    let distanceAlongRoute = 0
    let travelled = 0
    for (let index = 0; index < route.length - 1; index += 1) {
      const closest = closestPointOnSegment(zone, route[index], route[index + 1])
      if (closest.distance < closestDistance) {
        closestDistance = closest.distance
        distanceAlongRoute = travelled + closest.segmentLength * closest.progress
      }
      travelled += closest.segmentLength
    }
    return { zone, closestDistance, distanceAlongRoute }
  }).sort((first, second) => first.closestDistance - second.closestDistance)[0]
  const { zone, closestDistance, distanceAlongRoute } = relevantZone
  const startDistance = Math.hypot(threat.spawnPosition[0] - zone.position[0], threat.spawnPosition[2] - zone.position[2])
  const end = route[route.length - 1]
  const endDistance = Math.hypot(end[0] - zone.position[0], end[2] - zone.position[2])
  const direction: 'Toward' | 'Away' | 'Crossing' = endDistance < startDistance - 0.75
    ? 'Toward'
    : endDistance > startDistance + 0.75 ? 'Away' : 'Crossing'
  const speed = Math.max(threat.path.speed ?? 0, 0)
  const routeSpeed = speed / 12
  const distanceToZone = Math.max(0, distanceAlongRoute - zone.radius)
  const timeToZoneMs = direction === 'Toward' && routeSpeed > 0
    ? Math.round((distanceToZone / routeSpeed) * 1000)
    : Number.POSITIVE_INFINITY

  let status: 'Far' | 'Approaching' | 'Entering' | 'Crossing' | 'Departing' = 'Far'
  if (direction === 'Away' && startDistance < zone.radius * 2.4) status = 'Departing'
  else if (closestDistance <= zone.radius) status = direction === 'Crossing' ? 'Crossing' : 'Entering'
  else if (direction === 'Toward' && closestDistance < zone.radius * 2.6) status = 'Approaching'
  else if (direction === 'Crossing' && closestDistance < zone.radius * 2.2) status = 'Crossing'

  const basePriority: ThreatPriority = threat.expectedClassification === 'Hostile' ? 'High'
    : threat.expectedClassification === 'Unknown' ? 'Medium'
      : 'Low'

  let priority: ThreatPriority = basePriority
  if (direction === 'Away') priority = priority === 'High' ? 'Medium' : priority === 'Medium' ? 'Low' : 'Low'
  else if (direction === 'Toward' && threat.expectedClassification !== 'Friendly' && (timeToZoneMs <= 18_000 || speed >= 32)) priority = 'High'
  else if (closestDistance > zone.radius * 2.6 && direction !== 'Toward' && priority === 'High') priority = 'Medium'

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    status,
    direction,
    priority,
    timeToZoneMs,
  }
}

export function generateHimalayanThreats(seed: number, difficulty: TrainingDifficulty): SessionThreat[] {
  const random = createSeededRandom(seed)
  const countMap: Record<TrainingDifficulty, number> = {
    Easy: 5,
    Medium: 6,
    Hard: 7,
    Expert: 8,
  }
  const routeLibrary = [
    { trajectory: 'approach', from: [-42, 0, 38], to: [-18, 3, 12], hostile: true, type: 'Quadcopter UAV', speed: [18, 28] },
    { trajectory: 'crossing', from: [42, 2, -20], to: [18, 3, 8], hostile: true, type: 'Fixed-wing UAV', speed: [24, 36] },
    { trajectory: 'altitude', from: [16, 5, -42], to: [-4, 7, -10], hostile: false, type: 'Loitering UAV', speed: [20, 30] },
    { trajectory: 'retreat', from: [34, 3, 10], to: [52, 2, 34], hostile: false, type: 'Quadcopter UAV', speed: [18, 26] },
    { trajectory: 'arc', from: [52, 2, 12], to: [8, 5, -6], hostile: true, type: 'Unknown UAV', speed: [22, 34] },
    { trajectory: 'parallel', from: [-52, 2, 8], to: [6, 3, 12], hostile: true, type: 'Fixed-wing UAV', speed: [26, 38] },
    { trajectory: 'approach', from: [18, 2, 44], to: [10, 2, 20], hostile: false, type: 'Unknown UAV', speed: [18, 25] },
    { trajectory: 'crossing', from: [-12, 4, 48], to: [16, 4, 8], hostile: true, type: 'Quadcopter UAV', speed: [20, 32] },
  ] as const
  const threatCount = countMap[difficulty]
  const threats = Array.from({ length: threatCount }, (_, index): SessionThreat => {
    const route = routeLibrary[index % routeLibrary.length]
    const jitterX = (random() - 0.5) * 6
    const jitterY = 1 + random() * 2.3
    const jitterZ = (random() - 0.5) * 6
    const spawnPosition: [number, number, number] = [
      route.from[0] + jitterX,
      route.from[1] + jitterY,
      route.from[2] + jitterZ,
    ]
    const targetPosition: [number, number, number] = [
      route.to[0] + (random() - 0.5) * 4,
      route.to[1] + (random() - 0.5) * 1.5,
      route.to[2] + (random() - 0.5) * 4,
    ]
    const speed = route.speed[0] + random() * (route.speed[1] - route.speed[0])
    const classificationRoll = random()
    const expectedClassification = route.hostile
      ? classificationRoll < 0.74 ? 'Hostile' : classificationRoll < 0.9 ? 'Unknown' : 'Friendly'
      : classificationRoll < 0.68 ? 'Friendly' : classificationRoll < 0.9 ? 'Unknown' : 'Hostile'
    const evidenceProfile: Record<TrainingDifficulty, { error: number; confidenceMin: number; confidenceSpan: number }> = {
      Easy: { error: 0.08, confidenceMin: 84, confidenceSpan: 13 },
      Medium: { error: 0.15, confidenceMin: 76, confidenceSpan: 17 },
      Hard: { error: 0.24, confidenceMin: 65, confidenceSpan: 20 },
      Expert: { error: 0.34, confidenceMin: 54, confidenceSpan: 22 },
    }
    const evidence = evidenceProfile[difficulty]
    const signalClassification = random() < evidence.error
      ? expectedClassification === 'Unknown'
        ? (random() < 0.5 ? 'Friendly' : 'Hostile')
        : 'Unknown'
      : expectedClassification
    const signalConfidence = Math.round(evidence.confidenceMin + random() * evidence.confidenceSpan)
    return {
      id: `T-${String(index + 1).padStart(2, '0')}`,
      type: route.type,
      expectedClassification,
      signalClassification,
      signalConfidence,
      priority: getPriority(expectedClassification),
      spawnPosition,
      spawnTimeMs: index * (difficulty === 'Hard' ? 2_700 : difficulty === 'Expert' ? 1_900 : 3_500) + Math.round(random() * 1_200),
      path: {
        trajectory: route.trajectory,
        speed,
        waypoints: [spawnPosition, [
          (spawnPosition[0] + targetPosition[0]) / 2 + (random() - 0.5) * 8,
          Math.max(1.8, (spawnPosition[1] + targetPosition[1]) / 2 + random() * 2.4),
          (spawnPosition[2] + targetPosition[2]) / 2 + (random() - 0.5) * 8,
        ] as [number, number, number], targetPosition],
        center: spawnPosition,
        amplitude: [3.5 + random() * 2.5, 2.4 + random() * 2.2],
        frequency: [0.24 + random() * 0.18, 0.18 + random() * 0.2],
        phase: random() * Math.PI,
        verticalAmplitude: 0.8 + random() * 1.4,
        verticalFrequency: 0.9 + random() * 1.1,
        rotationAmplitude: 0.12 + random() * 0.18,
      },
    }
  })
  return threats.map((threat) => {
    const assessmentPriority = getHimalayanThreatAssessment(threat).priority
    return {
      ...threat,
      priority: assessmentPriority === 'Unknown' ? getPriority(threat.expectedClassification) : assessmentPriority,
    }
  })
}

function offsetThreat(threat: SessionThreat, id: string, dx: number, dz: number): SessionThreat {
  const offsetPoint = ([x, y, z]: [number, number, number]): [number, number, number] => [x + dx, y, z + dz]
  return {
    ...threat,
    id,
    spawnPosition: offsetPoint(threat.spawnPosition),
    path: {
      ...threat.path,
      center: offsetPoint(threat.path.center),
      waypoints: threat.path.waypoints?.map(offsetPoint),
    },
  }
}

export function configureThreatsForAttackMode(
  source: SessionThreat[],
  mode: AttackMode,
  difficulty: TrainingDifficulty,
  seed: number,
): SessionThreat[] {
  const interval: Record<TrainingDifficulty, number> = { Easy: 4200, Medium: 3000, Hard: 2000, Expert: 1200 }
  const random = createSeededRandom(seed ^ 0x41a7)
  const base = [...source]
  while (base.length < (mode === 'mixed' ? 5 : mode === 'swarm' ? 3 : mode === 'multiple' ? 2 : 1)) {
    const original = source[base.length % Math.max(source.length, 1)]
    if (!original) break
    const copy = offsetThreat(original, `${original.id}-R${base.length + 1}`, (base.length + 1) * 2.4, (random() - 0.5) * 5)
    copy.spawnTimeMs = interval[difficulty] * base.length
    base.push(copy)
  }
  if (mode === 'single') return base.slice(0, 1).map(({ attackGroupId: _group, attackGroupType: _type, ...threat }) => threat)

  const clearGroup = (threat: SessionThreat): SessionThreat => {
    const { attackGroupId: _group, attackGroupType: _type, ...independent } = threat
    return independent
  }
  if (mode === 'multiple') return base.map(clearGroup)

  const groupSize = mode === 'swarm' ? base.length : Math.min(3, base.length)
  const leader = base[0]
  const leaderPoints = leader.path.waypoints?.length ? leader.path.waypoints : [leader.spawnPosition]
  const group = base.slice(0, groupSize).map((threat, index) => {
    const dx = (index % 3 - 1) * 2.2
    const dz = Math.floor(index / 3) * 2
    const waypoints = leaderPoints.map((point) => [point[0] + dx, point[1], point[2] + dz] as [number, number, number])
    return {
      ...threat,
      spawnPosition: waypoints[0],
      spawnTimeMs: leader.spawnTimeMs + Math.floor(index / 3) * interval[difficulty] + (index % 3) * 180,
      attackGroupId: 'SWARM-01',
      attackGroupType: 'swarm' as const,
      path: { ...threat.path, center: waypoints[0], waypoints, phase: leader.path.phase + (index % 3) * 0.04 },
    }
  })
  if (mode === 'swarm') return group

  const independent = base.slice(groupSize).map((threat, index) => ({
    ...clearGroup(threat),
    spawnTimeMs: leader.spawnTimeMs + 2 * interval[difficulty] + index * interval[difficulty],
  }))
  return [...group, ...independent]
}

export function isTrainingDifficulty(value: unknown): value is TrainingDifficulty {
  return value === 'Easy' || value === 'Medium' || value === 'Hard' || value === 'Expert'
}

export function isAttackMode(value: unknown): value is AttackMode {
  return value === 'single' || value === 'multiple' || value === 'swarm' || value === 'mixed'
}

export function resolveMissionConfiguration(
  scenario: { difficulty: TrainingDifficulty; type: string },
  values: { difficulty?: unknown; attackMode?: unknown },
) {
  return {
    difficulty: isTrainingDifficulty(values.difficulty) ? values.difficulty : scenario.difficulty,
    attackMode: isAttackMode(values.attackMode) ? values.attackMode : scenario.type === 'Swarm' ? 'swarm' as const : 'multiple' as const,
  }
}

export function getConfiguredThreatCount(
  scenarioId: string,
  scenarioThreatCount: number,
  difficulty: TrainingDifficulty,
  mode: AttackMode,
) {
  const baseCount = scenarioId === 'himalayan-shield'
    ? ({ Easy: 5, Medium: 6, Hard: 7, Expert: 8 } satisfies Record<TrainingDifficulty, number>)[difficulty]
    : Math.max(1, Math.round(scenarioThreatCount * ({ Easy: 0.75, Medium: 1, Hard: 1.2, Expert: 1.4 } satisfies Record<TrainingDifficulty, number>)[difficulty]))
  if (mode === 'single') return 1
  if (mode === 'swarm') return Math.max(3, baseCount)
  if (mode === 'mixed') return Math.max(5, baseCount)
  return Math.max(2, baseCount)
}

export function expectedResponseForPriority(priority: ThreatPriority) {
  if (priority === 'High') return 'Escalate alert'
  if (priority === 'Medium') return 'Track priority threat'
  return 'Continue monitoring'
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

function responseIsCorrect(event: SessionEvent, threats: SessionThreat[], scoreRule: SessionScoreRule = 'event-performance-v3') {
  const threat = threats.find((candidate) => candidate.id === event.threatId)
  if (!threat) return false
  if (scoreRule === 'event-performance-v4') return event.action === expectedResponseForPriority(threat.priority)
  const expectedAction = threat.expectedClassification === 'Hostile'
    ? 'Escalate alert'
    : threat.expectedClassification === 'Unknown' ? 'Track priority threat' : 'Continue monitoring'
  return event.action === expectedAction
}

function detectionElapsed(event: SessionEvent, threat: SessionThreat, useAvailabilityClock: boolean) {
  const detectableAtMs = event.detectableAtMs ?? threat.spawnTimeMs
  if (useAvailabilityClock && event.elapsedMs < detectableAtMs) return null
  return Math.max(0, event.elapsedMs - (useAvailabilityClock ? detectableAtMs : 0))
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
    const elapsedMs = detectionElapsed(detection, threat, scoreRule === 'event-performance-v4')
    if (elapsedMs === null) return total
    const speedFactor = Math.max(0, 1 - (elapsedMs / detectionWindow) * 0.35)
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
  const responseScore = scoreRule === 'event-performance-v4'
    ? Math.min(20, (20 / safeThreatCount) * [...latestEventsByThreat(responseEvents, 'RESPONSE_SELECTED').values()].filter((event) => responseIsCorrect(event, threats, scoreRule)).length)
    : scoreRule === 'event-performance-v3'
    ? responseEvents.length
      ? (20 * responseEvents.filter((event) => responseIsCorrect(event, threats, scoreRule)).length) / responseEvents.length
      : 0
    : latestResponseEvent && responseIsCorrect(latestResponseEvent, threats, scoreRule) ? 20 : 0
  const incorrectClassificationCount = [...classifications.values()].filter((event) => event.result === 'incorrect').length
  const incorrectPriorityCount = [...priorities.values()].filter((event) => event.result === 'incorrect').length
  const penaltyScore = scoreRule === 'event-performance-v1'
    ? -Math.min(
        20,
        incorrectClassificationCount * 2 +
          incorrectPriorityCount * 2 +
          (latestResponseEvent && !responseIsCorrect(latestResponseEvent, threats, scoreRule) ? 4 : 0),
      )
    : 0
  const awarded = Math.max(
    0,
    Math.min(100, Math.round(detectionScore + classificationScore + prioritizationScore + responseScore + penaltyScore)),
  )

  return {
    rule: scoreRule === 'event-performance-v1'
      ? 'Detection (30), classification (30), prioritization (20), and response (20), with deductions for incorrect decisions.'
      : scoreRule === 'event-performance-v4'
        ? 'Detectable-time detection (30), classification (30), prioritization (20), and per-contact rubric response (20), weighted by contact count.'
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
  const responseEvents = session.events.filter((event) => event.eventType === 'RESPONSE_SELECTED')
  const useAvailabilityClock = session.scoreRule === 'event-performance-v4'
  const validDetectionEvents = detectionEvents.filter((event) => {
    const threat = session.threats.find((item) => item.id === event.threatId)
    return Boolean(threat && detectionElapsed(event, threat, useAvailabilityClock) !== null)
  })
  const scoredDetectionTimes = validDetectionEvents.map((event) => {
    const threat = session.threats.find((item) => item.id === event.threatId)!
    return { event, elapsedMs: detectionElapsed(event, threat, useAvailabilityClock)! }
  })
  const detectedThreatIds = new Set(validDetectionEvents.map((event) => event.threatId))
  const evaluatedResponses = session.scoreRule === 'event-performance-v4'
    ? [...latestEventsByThreat(responseEvents, 'RESPONSE_SELECTED').values()]
    : responseEvents
  const correctResponses = evaluatedResponses.filter((event) => responseIsCorrect(event, session.threats, session.scoreRule)).length
  const scoredClassifications = correctClassifications + incorrectClassifications
  const scoredPriorities = correctPriorityDecisions + incorrectPriorityDecisions
  return {
    threatCount: session.threats.length,
    detected: detectedThreatIds.size,
    missed,
    detectionAccuracy: session.threats.length ? (detectedThreatIds.size / session.threats.length) * 100 : 0,
    averageDetectionMs: scoredDetectionTimes.length
      ? scoredDetectionTimes.reduce((total, item) => total + item.elapsedMs, 0) / scoredDetectionTimes.length
      : null,
    fastestDetection: [...scoredDetectionTimes].sort((first, second) => first.elapsedMs - second.elapsedMs)[0]?.event ?? null,
    slowestDetection: [...scoredDetectionTimes].sort((first, second) => second.elapsedMs - first.elapsedMs)[0]?.event ?? null,
    lateDetections: scoredDetectionTimes.filter((item) => item.elapsedMs > detectionWindows[session.difficulty]).length,
    correctClassifications,
    incorrectClassifications,
    classificationAccuracy: scoredClassifications
      ? (correctClassifications / scoredClassifications) * 100
      : null,
    priorityAccuracy: scoredPriorities ? (correctPriorityDecisions / scoredPriorities) * 100 : null,
    correctPriorityDecisions,
    incorrectPriorityDecisions,
    responseAccuracy: evaluatedResponses.length ? (correctResponses / evaluatedResponses.length) * 100 : null,
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
      responseEvents.filter((event) => !responseIsCorrect(event, session.threats, session.scoreRule)).length,
  }
}

function withChangedEvent(events: SessionEvent[], original: SessionEvent, replacement: SessionEvent) {
  return events.map((event) => event.id === original.id ? replacement : event)
}

export function getWhatIfOpportunity(session: TrainingSession): WhatIfOpportunity | null {
  const candidates: WhatIfOpportunity[] = []
  const scoreRule = session.scoreRule === 'event-performance-v1' || session.scoreRule === 'event-performance-v3' || session.scoreRule === 'event-performance-v4'
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
      const detectableAtMs = event.detectableAtMs ?? threat?.spawnTimeMs ?? 0
      const improvedElapsedMs = scoreRule === 'event-performance-v4'
        ? detectableAtMs + Math.floor(detectionWindows[session.difficulty] / 2)
        : Math.max(detectableAtMs, Math.floor(detectionWindows[session.difficulty] / 2))
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
    const improvedElapsedMs = scoreRule === 'event-performance-v4'
      ? threat.spawnTimeMs + Math.floor(detectionWindows[session.difficulty] / 2)
      : Math.max(threat.spawnTimeMs, Math.floor(detectionWindows[session.difficulty] / 2))
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
    if (event.eventType !== 'RESPONSE_SELECTED' || responseIsCorrect(event, session.threats, scoreRule)) continue
    const threat = session.threats.find((item) => item.id === event.threatId)
    if (!threat) continue
    const expectedAction = scoreRule === 'event-performance-v4'
      ? expectedResponseForPriority(threat.priority)
      : threat.expectedClassification === 'Hostile'
        ? 'Escalate alert'
        : threat.expectedClassification === 'Unknown' ? 'Track priority threat' : 'Continue monitoring'
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
    (candidate.version !== 3 && candidate.version !== 4 && candidate.version !== 5) ||
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
