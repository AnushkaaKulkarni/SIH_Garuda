import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSessionScore,
  configureThreatsForAttackMode,
  getConfiguredThreatCount,
  generateHimalayanThreats,
  getHimalayanThreatAssessment,
  getSessionMetrics,
  getWhatIfOpportunity,
  resolveMissionConfiguration,
  type SessionEvent,
  type SessionThreat,
  type TrainingSession,
} from '../lib/training-session.ts'

function threat(id: string, expectedClassification: string, spawnTimeMs = 0): SessionThreat {
  const position: [number, number, number] = [0, 3, 0]
  return {
    id,
    type: expectedClassification,
    expectedClassification,
    signalClassification: expectedClassification,
    signalConfidence: 100,
    priority: expectedClassification === 'Hostile' ? 'High' : 'Low',
    spawnPosition: position,
    spawnTimeMs,
    path: {
      center: position,
      amplitude: [1, 1],
      frequency: [0.2, 0.2],
      phase: 0,
      waypoints: [position, [2, 3, -3], [-1, 4, -6]],
      speed: 1,
    },
  }
}

function event(
  id: string,
  eventType: SessionEvent['eventType'],
  elapsedMs: number,
  details: Partial<SessionEvent> = {},
): SessionEvent {
  return {
    id,
    eventType,
    elapsedMs,
    timestamp: new Date(elapsedMs).toISOString(),
    ...details,
  }
}

function session(threats: SessionThreat[], events: SessionEvent[]): TrainingSession {
  const scoreBreakdown = calculateSessionScore(threats, events, 'Hard', 'event-performance-v3')
  return {
    version: 4,
    id: 'session-test',
    seed: 123,
    difficulty: 'Hard',
    scenario: 'himalayan-shield',
    score: scoreBreakdown.awarded,
    completedAt: new Date(30_000).toISOString(),
    startedAt: new Date(0).toISOString(),
    missionDurationMs: 30_000,
    environment: { terrain: 'High Altitude', time: 'Dawn', visibility: 'Clear' },
    threats,
    events,
    decisions: { classification: '', classificationThreatId: '', priorityThreatId: null, response: '' },
    scoreRule: 'event-performance-v3',
    scoreBreakdown,
  }
}

test('score reflects timely and correct actions rather than a fixed default', () => {
  const target = threat('target', 'Hostile')
  const correct = [
    event('detect', 'DRONE_DETECTED', 1_000, { threatId: target.id }),
    event('classify', 'DRONE_CLASSIFIED', 2_000, {
      threatId: target.id,
      actualClassification: 'Hostile',
      expectedClassification: 'Hostile',
      result: 'correct',
    }),
    event('prioritize', 'THREAT_PRIORITIZED', 3_000, {
      threatId: target.id,
      actualPriority: 'High',
      expectedPriority: 'High',
      result: 'correct',
    }),
    event('respond', 'RESPONSE_SELECTED', 4_000, {
      threatId: target.id,
      action: 'Escalate alert',
      result: 'correct',
    }),
  ]
  const incorrect = [
    event('detect', 'DRONE_DETECTED', 20_000, { threatId: target.id }),
    event('classify', 'DRONE_CLASSIFIED', 21_000, {
      threatId: target.id,
      actualClassification: 'Friendly',
      expectedClassification: 'Hostile',
      result: 'incorrect',
    }),
    event('prioritize', 'THREAT_PRIORITIZED', 22_000, {
      threatId: target.id,
      actualPriority: 'Low',
      expectedPriority: 'High',
      result: 'incorrect',
    }),
    event('respond', 'RESPONSE_SELECTED', 23_000, {
      threatId: target.id,
      action: 'Continue monitoring',
      result: 'incorrect',
    }),
  ]

  const highScore = calculateSessionScore([target], correct, 'Hard', 'event-performance-v3').awarded
  const lowScore = calculateSessionScore([target], incorrect, 'Hard', 'event-performance-v3').awarded
  assert.ok(highScore >= 95)
  assert.ok(lowScore < highScore)
})

test('v3 response points reflect every recorded response, not only the last one', () => {
  const targets = [threat('hostile', 'Hostile'), threat('friendly', 'Friendly')]
  const responses = [
    event('wrong-response', 'RESPONSE_SELECTED', 1_000, {
      threatId: 'hostile',
      action: 'Continue monitoring',
    }),
    event('correct-response', 'RESPONSE_SELECTED', 2_000, {
      threatId: 'friendly',
      action: 'Continue monitoring',
    }),
  ]

  assert.equal(calculateSessionScore(targets, responses, 'Hard', 'event-performance-v2').responseScore, 20)
  assert.equal(calculateSessionScore(targets, responses, 'Hard', 'event-performance-v3').responseScore, 10)
})

test('What-If corrects one recorded response without mutating the actual session', () => {
  const targets = [threat('hostile', 'Hostile'), threat('friendly', 'Friendly')]
  const events = [
    event('wrong-response', 'RESPONSE_SELECTED', 1_000, {
      threatId: 'hostile',
      action: 'Continue monitoring',
      result: 'incorrect',
    }),
    event('correct-response', 'RESPONSE_SELECTED', 2_000, {
      threatId: 'friendly',
      action: 'Continue monitoring',
      result: 'correct',
    }),
  ]
  const recorded = session(targets, events)
  const opportunity = getWhatIfOpportunity(recorded)

  assert.ok(opportunity)
  assert.equal(opportunity.changedEvent.id, 'wrong-response')
  assert.equal(opportunity.hypotheticalEvent.action, 'Escalate alert')
  assert.equal(opportunity.actualScore, recorded.score)
  assert.ok(opportunity.whatIfScore > opportunity.actualScore)
  assert.equal(recorded.events[0].action, 'Continue monitoring')
  assert.equal(recorded.score, calculateSessionScore(targets, events, 'Hard', 'event-performance-v3').awarded)
})

test('missed-contact What-If does not place detection before its spawn', () => {
  const target = threat('late-spawn', 'Hostile', 5_000)
  const recorded = session(
    [target],
    [event('missed', 'DRONE_MISSED', 20_000, { threatId: target.id, result: 'missed' })],
  )
  const opportunity = getWhatIfOpportunity(recorded)

  assert.ok(opportunity)
  assert.equal(opportunity.hypotheticalEvent.eventType, 'DRONE_DETECTED')
  assert.ok(opportunity.whatIfElapsedMs >= target.spawnTimeMs)
  assert.ok(opportunity.whatIfElapsedMs < recorded.missionDurationMs)
})

test('Himalayan hard scenario generates a deterministic multi-threat set with varied speeds and protected-zone movement', () => {
  const first = generateHimalayanThreats(12_345, 'Hard')
  const second = generateHimalayanThreats(12_345, 'Hard')
  const third = generateHimalayanThreats(98_765, 'Hard')

  assert.equal(first.length, 7)
  assert.deepEqual(first.map((threat) => threat.id), second.map((threat) => threat.id))
  assert.deepEqual(first.map((threat) => threat.path.speed), second.map((threat) => threat.path.speed))
  assert.ok(new Set(first.map((threat) => threat.id)).size === first.length)
  assert.ok(first.some((threat) => threat.path.speed && threat.path.speed >= 18 && threat.path.speed <= 45))
  assert.ok(first.some((threat) => threat.path.trajectory === 'approach'))
  assert.ok(first.some((threat) => getHimalayanThreatAssessment(threat).direction === 'Away'))
  assert.notDeepEqual(first.map((threat) => threat.spawnTimeMs), third.map((threat) => threat.spawnTimeMs))
})

test('Himalayan assessment raises fast approaches and de-escalates retreating contacts', () => {
  const approaching = threat('approach', 'Hostile')
  approaching.spawnPosition = [-50, 5, 12]
  approaching.path.waypoints = [approaching.spawnPosition, [-15, 5, 12]]
  approaching.path.speed = 36

  const retreating = threat('retreat', 'Hostile')
  retreating.spawnPosition = [-15, 5, 12]
  retreating.path.waypoints = [retreating.spawnPosition, [-50, 5, 12]]
  retreating.path.speed = 18

  const approachAssessment = getHimalayanThreatAssessment(approaching)
  const retreatAssessment = getHimalayanThreatAssessment(retreating)

  assert.equal(approachAssessment.zoneId, 'forward-outpost')
  assert.equal(approachAssessment.direction, 'Toward')
  assert.equal(approachAssessment.priority, 'High')
  assert.ok(Number.isFinite(approachAssessment.timeToZoneMs))
  assert.equal(retreatAssessment.direction, 'Away')
  assert.equal(retreatAssessment.status, 'Departing')
  assert.equal(retreatAssessment.priority, 'Medium')
})

test('configuration validates all difficulties and attack modes with compatible defaults', () => {
  const scenario = { difficulty: 'Hard' as const, type: 'Air' }
  assert.deepEqual(resolveMissionConfiguration(scenario, {}), { difficulty: 'Hard', attackMode: 'multiple' })
  assert.deepEqual(resolveMissionConfiguration({ ...scenario, type: 'Swarm' }, { difficulty: 'invalid', attackMode: 'invalid' }), { difficulty: 'Hard', attackMode: 'swarm' })
  for (const difficulty of ['Easy', 'Medium', 'Hard', 'Expert'] as const) {
    for (const attackMode of ['single', 'multiple', 'swarm', 'mixed'] as const) {
      assert.deepEqual(resolveMissionConfiguration(scenario, { difficulty, attackMode }), { difficulty, attackMode })
    }
  }
})

test('attack modes produce reproducible single, independent, grouped and mixed threat sets at every difficulty', () => {
  for (const difficulty of ['Easy', 'Medium', 'Hard', 'Expert'] as const) {
    const source = generateHimalayanThreats(54321, difficulty)
    const single = configureThreatsForAttackMode(source, 'single', difficulty, 54321)
    const multiple = configureThreatsForAttackMode(source, 'multiple', difficulty, 54321)
    const swarm = configureThreatsForAttackMode(source, 'swarm', difficulty, 54321)
    const mixed = configureThreatsForAttackMode(source, 'mixed', difficulty, 54321)
    assert.equal(single.length, getConfiguredThreatCount('himalayan-shield', 7, difficulty, 'single'))
    assert.equal(single.length, 1)
    assert.ok(multiple.length >= 2)
    assert.ok(multiple.every((threat) => !threat.attackGroupId))
    assert.ok(swarm.length >= 3 && swarm.every((threat) => threat.attackGroupId === 'SWARM-01' && threat.path.waypoints?.length))
    assert.equal(new Set(swarm.map((threat) => threat.attackGroupId)).size, 1)
    assert.ok(mixed.length >= 5)
    assert.equal(mixed.filter((threat) => threat.attackGroupId === 'SWARM-01').length, 3)
    assert.ok(mixed.filter((threat) => !threat.attackGroupId).length >= 2)
    assert.deepEqual(mixed, configureThreatsForAttackMode(source, 'mixed', difficulty, 54321))
  }
})

test('v4 detection scoring measures only time after availability and rejects pre-arrival credit', () => {
  const lateContact = threat('late', 'Hostile', 20_000)
  const valid = event('valid', 'DRONE_DETECTED', 21_000, { threatId: lateContact.id, detectableAtMs: 20_000 })
  const early = event('early', 'DRONE_DETECTED', 19_000, { threatId: lateContact.id, detectableAtMs: 20_000 })
  const validScore = calculateSessionScore([lateContact], [valid], 'Hard', 'event-performance-v4')
  const earlyScore = calculateSessionScore([lateContact], [early], 'Hard', 'event-performance-v4')
  assert.ok(validScore.detectionScore > 28)
  assert.equal(earlyScore.detectionScore, 0)
  const recorded = session([lateContact], [early])
  recorded.scoreRule = 'event-performance-v4'
  recorded.events = [early]
  assert.equal(getSessionMetrics(recorded).detected, 0)
  assert.equal(getSessionMetrics(recorded).averageDetectionMs, null)
})

test('v4 response rubric follows assessed priority while historical response rules remain versioned', () => {
  const target = threat('target', 'Hostile')
  target.priority = 'Medium'
  const response = event('respond', 'RESPONSE_SELECTED', 1_000, { threatId: target.id, action: 'Track priority threat' })
  assert.equal(calculateSessionScore([target], [response], 'Hard', 'event-performance-v4').responseScore, 20)
  assert.equal(calculateSessionScore([target], [response], 'Hard', 'event-performance-v3').responseScore, 0)
})
