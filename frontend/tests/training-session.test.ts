import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSessionScore,
  getWhatIfOpportunity,
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
