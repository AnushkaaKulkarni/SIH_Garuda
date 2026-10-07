'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Check, Maximize2, TimerReset } from 'lucide-react'
import { PageHeader, Panel, PortalShell } from '@/components/common/portal-shell'
import { playSimulationTone } from '@/lib/simulation-audio'
import { scenarios } from '@/lib/types'
import {
  calculateSessionScore,
  createScenarioSeed,
  createSeededRandom,
  createSessionId,
  getPriority,
  saveTrainingSession,
  type SessionEvent,
  type SessionThreat,
  type SimulationEventType,
  type TrainingDifficulty,
  type TrainingSession,
} from '@/lib/training-session'
import styles from './training-simulation-scene.module.css'

const TrainingSimulationScene = dynamic(
  () => import('./training-simulation-scene').then((module) => module.TrainingSimulationScene),
  { ssr: false, loading: () => <div className={styles.loading}>Preparing training terrain…</div> },
)

export function LiveSimulation({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]
  const [difficulty, setDifficulty] = useState<TrainingDifficulty>(scenario.difficulty)
  const [run, setRun] = useState({ id: 'starting', seed: 0 })
  const threats = useMemo<SessionThreat[]>(
    () => {
      const countScale: Record<TrainingDifficulty, number> = {
        Easy: 0.75,
        Medium: 1,
        Hard: 1.2,
        Expert: 1.4,
      }
      const speedScale: Record<TrainingDifficulty, number> = {
        Easy: 0.65,
        Medium: 0.85,
        Hard: 1.1,
        Expert: 1.35,
      }
      const spawnInterval: Record<TrainingDifficulty, number> = {
        Easy: 4200,
        Medium: 3000,
        Hard: 2000,
        Expert: 1000,
      }
      const random = createSeededRandom(run.seed)
      const count = Math.max(1, Math.round(scenario.threatCount * countScale[difficulty]))
      const swarm = scenario.type === 'Swarm'
      const unknownChance: Record<TrainingDifficulty, number> = {
        Easy: 0.16,
        Medium: 0.27,
        Hard: 0.36,
        Expert: 0.44,
      }
      const hostileChance: Record<TrainingDifficulty, number> = {
        Easy: 0.35,
        Medium: 0.36,
        Hard: 0.38,
        Expert: 0.4,
      }
      const signalErrorRate: Record<TrainingDifficulty, number> = {
        Easy: 0,
        Medium: 0.12,
        Hard: 0.24,
        Expert: 0.4,
      }
      const classifications = Array.from({ length: count }, () => {
        const value = random()
        return value < hostileChance[difficulty]
          ? 'Hostile'
          : value < hostileChance[difficulty] + unknownChance[difficulty]
            ? 'Unknown'
            : 'Friendly'
      })
      if (!classifications.includes('Hostile')) classifications[0] = 'Hostile'
      const signalClassifications = classifications.map((classification) => {
        if (random() >= signalErrorRate[difficulty]) return classification
        const alternatives = ['Friendly', 'Unknown', 'Hostile'].filter((item) => item !== classification)
        return alternatives[Math.floor(random() * alternatives.length)]
      })
      return Array.from({ length: count }, (_, index) => {
        const group = Math.floor(index / 3)
        const groupCount = Math.ceil(count / 3)
        const angle = (swarm ? group / groupCount : index / count) * Math.PI * 2
        const radius = 10 + (swarm ? group * 2.3 : index % 2 * 3)
        const type = classifications[index]
        const spawnPosition: [number, number, number] = [
          Math.sin(angle) * radius + (swarm ? (index % 3 - 1) * 1.3 : 0),
          2.2 + random() * 2,
          Math.cos(angle) * radius - 2 + (swarm ? (index % 3 - 1) * 1.3 : 0),
        ]
        const trajectories = ['approach', 'crossing', 'altitude', 'retreat', 'arc'] as const
        const trajectory = trajectories[(index + Math.floor(random() * trajectories.length)) % trajectories.length]
        const routeOffsets: Record<typeof trajectory, [number, number, number][]> = {
          approach: [[0, 0, 0], [7, 1.2, -9], [2, 0.4, -21], [-8, -0.6, -13]],
          crossing: [[0, 0, 0], [10, 0.8, -3], [20, 0.2, -9], [10, -0.4, -13]],
          altitude: [[0, 0, 0], [3, 3.5, -7], [-2, 4.2, -15], [-5, 1.1, -8]],
          retreat: [[0, 0, 0], [-6, 0.8, 6], [2, 0.4, 16], [8, -0.7, 8]],
          arc: [[0, 0, 0], [8, 1.5, -6], [1, 2.3, -16], [-9, 0.7, -9]],
        }
        const waypoints = routeOffsets[trajectory].map(([x, y, z], pointIndex) => [
          spawnPosition[0] + x + (pointIndex === 0 ? 0 : (random() - 0.5) * 2.4),
          spawnPosition[1] + y + (pointIndex === 0 ? 0 : (random() - 0.5) * 0.8),
          spawnPosition[2] + z + (pointIndex === 0 ? 0 : (random() - 0.5) * 2.4),
        ] as [number, number, number])
        return {
          id: `${run.id}-T-${String(index + 1).padStart(2, '0')}`,
          type,
          expectedClassification: type,
          signalClassification: signalClassifications[index],
          signalConfidence: Math.round((1 - signalErrorRate[difficulty]) * 100),
          priority: getPriority(type),
          spawnPosition,
          spawnTimeMs: swarm ? group * spawnInterval[difficulty] : index * Math.floor(spawnInterval[difficulty] / 2),
          path: {
            trajectory,
            speed: (0.65 + random() * 0.35) * speedScale[difficulty],
            waypoints,
            center: spawnPosition,
            amplitude: swarm ? [2.2, 1.8] : [1.25, 1.1],
            frequency: [0.24 * speedScale[difficulty], 0.21 * speedScale[difficulty]],
            phase: swarm ? group * 0.08 + (index % 3) * 0.04 : index * 0.9 + random() * 0.35,
            verticalAmplitude: 0.16 * speedScale[difficulty],
            verticalFrequency: 1.7,
            rotationAmplitude: 0.16,
          },
        }
      })
    },
    [difficulty, run.id, run.seed, scenario.threatCount, scenario.type],
  )
  const [seconds, setSeconds] = useState(180)
  const [selectedId, setSelectedId] = useState(threats[1]?.id ?? threats[0].id)
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [detectionFeedback, setDetectionFeedback] = useState('Select a drone in the terrain to record a detection.')
  const [events, setEvents] = useState<SessionEvent[]>([])
  const startedAt = useRef(Date.now())
  const currentScenarioId = useRef(scenario.id)
  const eventLog = useRef<SessionEvent[]>([])
  const completionGuard = useRef(false)
  const hasInitialized = useRef(false)
  const selectedThreat = threats.find((threat) => threat.id === selectedId) ?? threats[0]
  const detectedIds = events
    .filter((event) => event.eventType === 'DRONE_DETECTED')
    .map((event) => event.threatId)
  const detectedSet = new Set(detectedIds)
  const spawnedSet = new Set(events.filter((event) => event.eventType === 'DRONE_SPAWN').map((event) => event.threatId))

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      setRun({ id: createSessionId(), seed: createScenarioSeed() })
      return
    }
    if (currentScenarioId.current !== scenario.id) {
      currentScenarioId.current = scenario.id
      setRun({ id: createSessionId(), seed: createScenarioSeed() })
      setDifficulty(scenario.difficulty)
    }
  }, [scenario.id, scenario.difficulty])

  useEffect(() => {
    if (run.id === 'starting') return
    const startedAtMs = Date.now()
    startedAt.current = startedAtMs
    const startEvents: SessionEvent[] = [
      {
        id: `${startedAtMs}-mission`,
        timestamp: new Date(startedAtMs).toISOString(),
        elapsedMs: 0,
        eventType: 'MISSION_STARTED',
      },
      ...threats.filter((threat) => threat.spawnTimeMs === 0).map((threat) => ({
        id: `${run.id}-spawn-${threat.id}`,
        timestamp: new Date(startedAtMs).toISOString(),
        elapsedMs: threat.spawnTimeMs,
        eventType: 'DRONE_SPAWN' as const,
        threatId: threat.id,
        position: threat.spawnPosition,
        threatType: threat.type,
        expectedClassification: threat.expectedClassification,
        expectedPriority: threat.priority,
      })),
    ]
    eventLog.current = startEvents
    setEvents(startEvents)
    completionGuard.current = false
    setSeconds(180)
    setSelectedId(threats[0].id)
    setStep(1)
    setSubmitted(false)
    setDetectionFeedback('Select a drone in the terrain to record a detection.')
  }, [run.id, threats])

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === document.documentElement)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    if (submitted || run.id === 'starting') return
    const timer = window.setInterval(() => setSeconds((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [run.id, submitted])

  useEffect(() => {
    if (submitted || run.id === 'starting' || seconds >= 180) return
    const elapsedMs = Date.now() - startedAt.current
    const knownSpawnIds = new Set(
      eventLog.current.filter((event) => event.eventType === 'DRONE_SPAWN').map((event) => event.threatId),
    )
    const newSpawnEvents = threats
      .filter((threat) => threat.spawnTimeMs <= elapsedMs && !knownSpawnIds.has(threat.id))
      .map((threat) => ({
        id: `${run.id}-spawn-${threat.id}`,
        timestamp: new Date(startedAt.current + threat.spawnTimeMs).toISOString(),
        elapsedMs: threat.spawnTimeMs,
        eventType: 'DRONE_SPAWN' as const,
        threatId: threat.id,
        position: threat.spawnPosition,
        threatType: threat.type,
        expectedClassification: threat.expectedClassification,
        expectedPriority: threat.priority,
      }))
    if (newSpawnEvents.length) {
      eventLog.current = [...eventLog.current, ...newSpawnEvents]
      setEvents(eventLog.current)
    }
  }, [run.id, seconds, submitted, threats])

  useEffect(() => {
    if (soundOn) playSimulationTone('ambient', 0.04)
  }, [scenario.id, soundOn])

  const appendEvent = (
    eventType: SimulationEventType,
    threatId?: string,
    details: Partial<SessionEvent> = {},
    timestampMs = Date.now(),
  ) => {
    const threat = threats.find((item) => item.id === threatId)
    const event: SessionEvent = {
      id: `${run.id}-${timestampMs}-${eventLog.current.length}`,
      timestamp: new Date(timestampMs).toISOString(),
      elapsedMs: timestampMs - startedAt.current,
      eventType,
      ...(threat
        ? {
            threatId: threat.id,
            position: threat.spawnPosition,
            threatType: threat.type,
            expectedClassification: threat.expectedClassification,
            expectedPriority: threat.priority,
          }
        : {}),
      ...details,
    }
    eventLog.current = [...eventLog.current, event]
    setEvents(eventLog.current)
    return event
  }

  const ensureThreatSpawned = (threatId: string) => {
    const threat = threats.find((item) => item.id === threatId)
    if (!threat || Date.now() - startedAt.current < threat.spawnTimeMs) return false
    if (!eventLog.current.some((event) => event.eventType === 'DRONE_SPAWN' && event.threatId === threatId)) {
      appendEvent('DRONE_SPAWN', threatId, {}, startedAt.current + threat.spawnTimeMs)
    }
    return true
  }

  const detectThreat = (threatId: string) => {
    const threat = threats.find((item) => item.id === threatId)
    if (
      !threat ||
      !ensureThreatSpawned(threatId) ||
      eventLog.current.some((event) => event.eventType === 'DRONE_DETECTED' && event.threatId === threatId)
    ) return
    const detectedAt = Math.max(Date.now(), startedAt.current + threat.spawnTimeMs)
    appendEvent('DRONE_DETECTED', threatId, { result: 'recorded' }, detectedAt)
    const elapsed = Math.floor((detectedAt - startedAt.current) / 1000)
    setDetectionFeedback(
      `${threatId} detected at ${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}.`,
    )
    if (soundOn) playSimulationTone('detection')
  }

  const getThreatStep = (threatId: string) => {
    const threatEvents = eventLog.current.filter((event) => event.threatId === threatId)
    if (!threatEvents.some((event) => event.eventType === 'DRONE_DETECTED')) return 1
    if (!threatEvents.some((event) => event.eventType === 'DRONE_CLASSIFIED')) return 2
    if (!threatEvents.some((event) => event.eventType === 'THREAT_PRIORITIZED')) return 3
    return 4
  }

  const selectThreat = (threatId: string) => {
    setSelectedId(threatId)
    if (ensureThreatSpawned(threatId)) detectThreat(threatId)
    setStep(getThreatStep(threatId))
  }

  const finishMission = () => {
    if (completionGuard.current || submitted) return
    completionGuard.current = true
    const completedAt = Date.now()
    const missionDurationMs = completedAt - startedAt.current
    const missedEvents = threats
      .filter((threat) => !eventLog.current.some(
        (event) => event.eventType === 'DRONE_DETECTED' && event.threatId === threat.id,
      ))
      .map((threat, index) => ({
        id: `${run.id}-${completedAt}-missed-${threat.id}`,
        timestamp: new Date(completedAt + index).toISOString(),
        elapsedMs: missionDurationMs,
        eventType: 'DRONE_MISSED' as const,
        threatId: threat.id,
        position: threat.spawnPosition,
        threatType: threat.type,
        expectedClassification: threat.expectedClassification,
        expectedPriority: threat.priority,
        result: 'missed' as const,
      }))
    const completion: SessionEvent = {
      id: `${run.id}-${completedAt}-complete`,
      timestamp: new Date(completedAt + missedEvents.length).toISOString(),
      elapsedMs: missionDurationMs,
      eventType: 'MISSION_COMPLETE',
    }
    const sessionEvents = [...eventLog.current, ...missedEvents, completion]
      .sort((first, second) => first.elapsedMs - second.elapsedMs)
    const scoreBreakdown = calculateSessionScore(threats, sessionEvents, difficulty, 'event-performance-v3')
    const session: TrainingSession = {
      version: 4,
      id: run.id,
      seed: run.seed,
      difficulty,
      scenario: scenario.id,
      score: scoreBreakdown.awarded,
      startedAt: new Date(startedAt.current).toISOString(),
      completedAt: completion.timestamp,
      missionDurationMs,
      environment: { terrain: scenario.terrain, time: scenario.time, visibility: scenario.visibility },
      threats,
      events: sessionEvents,
      decisions: {
        classification: [...sessionEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED')?.actualClassification ?? '',
        classificationThreatId: [...sessionEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED')?.threatId ?? '',
        priorityThreatId: [...sessionEvents].reverse().find((event) => event.eventType === 'THREAT_PRIORITIZED')?.threatId ?? null,
        response: [...sessionEvents].reverse().find((event) => event.eventType === 'RESPONSE_SELECTED')?.action ?? '',
      },
      scoreRule: 'event-performance-v3',
      scoreBreakdown,
    }
    eventLog.current = session.events
    setEvents(session.events)
    const storageMessage = saveTrainingSession(session)
    setStorageError(storageMessage ?? '')
    setSubmitted(true)
    setFullscreen(false)
    if (soundOn) playSimulationTone('completion')
    if (document.fullscreenElement) void document.exitFullscreen()
  }

  useEffect(() => {
    if (seconds === 0 && !submitted) finishMission()
  }, [seconds, submitted])

  const toggleFullscreen = async () => {
    setFullscreenError('')
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (error) {
      console.error('Unable to toggle immersive simulation mode.', error)
      setFullscreenError('Browser fullscreen could not be enabled. Check browser permissions and try again.')
    }
  }

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  const selectedEvents = events.filter((event) => event.threatId === selectedThreat.id)
  const selectedClassification = [...selectedEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED')
  const selectedPriority = [...selectedEvents].reverse().find((event) => event.eventType === 'THREAT_PRIORITIZED')
  const selectedResponse = [...selectedEvents].reverse().find((event) => event.eventType === 'RESPONSE_SELECTED')
  const contacts = threats.map((threat) => ({
    id: threat.id,
    type: threat.type,
    detected: detectedSet.has(threat.id),
    selected: threat.id === selectedId,
    position: threat.spawnPosition,
    motion: {
      amplitude: threat.path.amplitude,
      frequency: threat.path.frequency,
      phase: threat.path.phase,
      speed: threat.path.speed,
      spawnTimeSeconds: threat.spawnTimeMs / 1000,
      waypoints: threat.path.waypoints,
      verticalAmplitude: threat.path.verticalAmplitude,
      verticalFrequency: threat.path.verticalFrequency,
      rotationAmplitude: threat.path.rotationAmplitude,
    },
  })).filter((contact) => spawnedSet.has(contact.id))

  const content = (
    <main className="page-content simulation-page">
      <PageHeader
        eyebrow={`LIVE TRAINING / ${scenario.name.toUpperCase()}`}
        title="Live Training Simulation"
        subtitle={`Training only · ${scenario.terrain} terrain · ${spawnedSet.size} active / ${threats.length} total contacts`}
        action={
          <div className="simulation-top-controls">
            <span className={`live-pill ${seconds < 30 ? 'critical' : ''}`}>
              <TimerReset size={14} /> {minutes}:{remainingSeconds}
            </span>
            <label className="terrain-chip">
              Difficulty
              <select
                aria-label="Simulation difficulty"
                value={difficulty}
                onChange={(event) => {
                  const nextDifficulty = event.target.value as TrainingDifficulty
                  setDifficulty(nextDifficulty)
                  setRun({ id: createSessionId(), seed: createScenarioSeed() })
                }}
                disabled={submitted}
              >
                {(['Easy', 'Medium', 'Hard', 'Expert'] as const).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <button
              className="simulation-sound"
              onClick={() => {
                setSoundOn((enabled) => !enabled)
                playSimulationTone('confirm')
              }}
              aria-pressed={soundOn}
            >
              {soundOn ? 'SOUND ON' : 'SOUND OFF'}
            </button>
            <span className="terrain-chip">{scenario.terrain} · {scenario.time}</span>
            <button className="table-action" onClick={toggleFullscreen}>
              <Maximize2 size={14} /> {fullscreen ? 'Exit immersive' : 'Immersive'}
            </button>
          </div>
        }
      />
      <div className="simulation-layout">
        <Panel className="threat-list">
          <p className="panel-label">THREAT LIST ({threats.length})</p>
          {threats.map((threat) => (
            <button
              key={threat.id}
              className={threat.id === selectedId ? 'selected' : ''}
              onClick={() => selectThreat(threat.id)}
            >
              <span className={detectedSet.has(threat.id) ? 'green' : 'amber'}>▲</span>
              {threat.id}
              <small>
            {!spawnedSet.has(threat.id) ? 'INCOMING' : detectedSet.has(threat.id) ? 'DETECTED' : 'TRACK PENDING'}
              </small>
            </button>
          ))}
        </Panel>
        <Panel className={`tactical-map ${styles.scenePanel}`}>
          <TrainingSimulationScene
            contacts={contacts}
            terrain={scenario.terrain}
            time={scenario.time}
            visibility={scenario.visibility}
            missionStartedAt={startedAt.current}
            onThreatDetected={detectThreat}
          />
          <div className={styles.sceneHud}>
            <span>GARUDA / 3D TRAINING RANGE</span>
            <span>{scenario.time.toUpperCase()} / {scenario.visibility.toUpperCase()}</span>
          </div>
          <div className={styles.sceneDetection} role="status" aria-live="polite">
            {detectionFeedback} · {detectedIds.length}/{threats.length} contacts detected
          </div>
          <span className={styles.sceneHint}>DRAG / ORBIT · SCROLL / ZOOM</span>
        </Panel>
        <Panel className="target-details">
          <p className="panel-label">SELECTED TARGET</p>
          <strong className="target-id">⌖ {selectedThreat.id}</strong>
        <div className="target-status">{selectedClassification?.actualClassification ?? 'Unclassified contact'}</div>
          {[
            ['Type', 'Quadcopter / UAV'],
          ['Classification', selectedClassification
            ? selectedClassification.actualClassification ?? 'Unknown'
              : detectedSet.has(selectedThreat.id)
                ? 'Awaiting assessment'
                : 'Pending detection'],
            ['Sensor estimate', detectedSet.has(selectedThreat.id)
              ? `${selectedThreat.signalClassification} · ${selectedThreat.signalConfidence}% confidence`
              : 'No track yet'],
            ['Distance', `${320 + threats.indexOf(selectedThreat) * 110} m`],
            ['Speed', `${Math.round(selectedThreat.path.speed * 45)} m/s`],
            ['Altitude', `${Math.round(selectedThreat.spawnPosition[1] * 100)} m`],
            ['Heading', `${(Math.round((Math.atan2(selectedThreat.path.waypoints[1][0] - selectedThreat.path.waypoints[0][0], selectedThreat.path.waypoints[1][2] - selectedThreat.path.waypoints[0][2]) * 180 / Math.PI) + 360) % 360)}°`],
            ['Threat Level', selectedClassification
              ? getPriority(selectedClassification.actualClassification ?? 'Unknown')
              : 'Unconfirmed'],
          ].map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{value}</b></div>
          ))}
        </Panel>
      </div>
      <div className="workflow">
        {['DETECT', 'CLASSIFY', 'PRIORITIZE', 'DECISION'].map((label, index) => (
          <button
            key={label}
            className={`${step === index + 1 ? 'active' : ''} ${index + 1 > step ? 'locked' : ''}`}
            disabled={index + 1 > step}
            onClick={() => setStep(index + 1)}
          >
            <b>{index + 1}</b>{label}
            <small>{index + 1 > step ? 'LOCKED' : index + 1 < step ? 'COMPLETED' : 'ACTIVE'}</small>
          </button>
        ))}
        <Panel className="decision-panel">
          <p className="panel-label">
            {step === 1 ? 'DETECTION' : step === 2 ? `CLASSIFY ${selectedThreat.id}` : step === 3 ? 'PRIORITIZE TARGET' : 'DECISION'}
          </p>
          {step === 1 && (
            <p className="muted">
              {!spawnedSet.has(selectedThreat.id)
                ? 'Awaiting contact. The global mission clock continues.'
                : detectedSet.has(selectedThreat.id)
                  ? 'Contact selected. Continue monitoring the live scene or select another contact.'
                  : 'Select this contact in the list or live scene to record detection.'}
            </p>
          )}
          {step === 2 && (
            <div className="choice-row">
              {['Friendly', 'Unknown', 'Hostile'].map((choice) => (
                <button
                  key={choice}
                  className={selectedClassification?.actualClassification === choice ? 'active' : ''}
                  disabled={!detectedSet.has(selectedThreat.id)}
                  onClick={() => {
                    const result = choice === selectedThreat.expectedClassification ? 'correct' : 'incorrect'
                    appendEvent('DRONE_CLASSIFIED', selectedThreat.id, {
                      actualClassification: choice,
                      result,
                    })
                    if (result === 'incorrect' && soundOn) playSimulationTone('alert')
                    setStep(1)
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          {step === 3 && (
            <div className="choice-row">
              {(['High', 'Medium', 'Low'] as const).map((priority) => (
                <button
                  key={priority}
                  className={selectedPriority?.actualPriority === priority ? 'active' : ''}
                  onClick={() => {
                    appendEvent('THREAT_PRIORITIZED', selectedThreat.id, {
                      actualPriority: priority,
                      result: priority === selectedThreat.priority ? 'correct' : 'incorrect',
                    })
                    if (priority !== selectedThreat.priority && soundOn) playSimulationTone('alert')
                    setStep(4)
                  }}
                >
                  {priority}
                </button>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="choice-row">
              {['Continue monitoring', 'Track priority threat', 'Escalate alert'].map((choice) => (
                <button
                  key={choice}
                  className={selectedResponse?.action === choice ? 'active' : ''}
                  onClick={() => {
                    appendEvent('RESPONSE_SELECTED', selectedThreat.id, {
                      action: choice,
                      result: choice === (
                        selectedThreat.expectedClassification === 'Hostile'
                          ? 'Escalate alert'
                          : selectedThreat.expectedClassification === 'Unknown'
                            ? 'Track priority threat'
                            : 'Continue monitoring'
                      ) ? 'correct' : 'incorrect',
                    })
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
        </Panel>
        <button className="button submit-response" disabled={step < 4 || !selectedResponse || submitted} onClick={finishMission}>
          {submitted ? 'Response submitted' : 'Submit response'} <ArrowRight size={15} />
        </button>
      </div>
      {fullscreenError && <p role="alert" className="muted">{fullscreenError}</p>}
      {storageError && <p role="alert" className="muted">{storageError}</p>}
      {submitted && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <Check className="modal-icon" size={34} />
            <p className="eyebrow">SESSION COMPLETE</p>
            <h2>Response recorded</h2>
            <p>
              Session score: {eventLog.current.find((event) => event.eventType === 'MISSION_COMPLETE') ? calculateSessionScore(threats, eventLog.current, difficulty, 'event-performance-v3').awarded : 0}/100. Your recorded detections, decisions, and timeline are ready for review.
            </p>
            <Link href={`/soldier/aar/${run.id}`} className="button">
              Open AAR <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </main>
  )

  return (
    <PortalShell role="soldier">
      <div className={`${fullscreen ? 'simulation-fullscreen' : ''} ${fullscreen ? styles.immersive : ''}`}>
        {content}
      </div>
    </PortalShell>
  )
}
