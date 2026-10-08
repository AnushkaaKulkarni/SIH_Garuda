'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Check, Maximize2, TimerReset } from 'lucide-react'
import { PageHeader, Panel, PortalShell } from '@/components/common/portal-shell'
import { playSimulationTone } from '@/lib/simulation-audio'
import { scenarios } from '@/lib/types'
import { parseVRCommand, type ParsedVRCommand } from '@/lib/vr-commands'
import { TrainingVRControls } from './training-vr-controls'
import type { XRStore } from '@react-three/xr'
import {
  calculateSessionScore,
  createScenarioSeed,
  createSeededRandom,
  createSessionId,
  generateHimalayanThreats,
  getHimalayanThreatAssessment,
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

function UavReference({ type }: { type: string }) {
  const fixedWing = /fixed-wing|loitering/i.test(type)
  const unknown = /unknown/i.test(type)

  return (
    <div className={`${styles.uavReference} ${fixedWing ? styles.fixedWing : unknown ? styles.unknownUav : styles.quadcopter}`} role="img" aria-label={`${type} silhouette reference`}>
      <svg viewBox="0 0 220 100" aria-hidden="true">
        {fixedWing ? (
          <path d="M108 8 119 39 205 59 205 69 121 61 116 87 137 94 137 99 110 93 83 99 83 94 104 87 99 61 15 69 15 59 101 39Z" />
        ) : unknown ? (
          <g>
            <path d="M110 29 127 43 184 30 188 37 137 55 127 63 184 75 180 82 122 70 110 82 98 70 40 82 36 75 93 63 83 55 32 37 36 30 93 43Z" />
            <circle cx="110" cy="54" r="13" />
            <circle cx="29" cy="32" r="7" /><circle cx="191" cy="32" r="7" />
            <circle cx="29" cy="80" r="7" /><circle cx="191" cy="80" r="7" />
          </g>
        ) : (
          <g>
            <path d="M99 46 58 25 54 31 86 51 54 69 58 75 99 55 121 55 162 75 166 69 134 51 166 31 162 25 121 46Z" />
            <rect x="99" y="42" width="22" height="18" rx="5" />
            <ellipse cx="47" cy="28" rx="18" ry="4" /><ellipse cx="173" cy="28" rx="18" ry="4" />
            <ellipse cx="47" cy="72" rx="18" ry="4" /><ellipse cx="173" cy="72" rx="18" ry="4" />
          </g>
        )}
      </svg>
      <div><strong>{type}</strong><small>TRAINING IDENTIFICATION REFERENCE</small></div>
    </div>
  )
}

export function LiveSimulation({ scenarioId, mode = 'desktop' }: { scenarioId: string; mode?: 'desktop' | 'vr' }) {
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]
  const isHimalayan = scenario.id === 'himalayan-shield'
  const vrMode = mode === 'vr' && isHimalayan
  const [difficulty, setDifficulty] = useState<TrainingDifficulty>(scenario.difficulty)
  const [run, setRun] = useState({ id: 'starting', seed: 0 })
  const threats = useMemo<SessionThreat[]>(() => {
    if (scenario.id === 'himalayan-shield') {
      return generateHimalayanThreats(run.seed || 1, difficulty)
    }

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
  }, [difficulty, run.id, run.seed, scenario.id, scenario.threatCount, scenario.type])
  const [missionStarted, setMissionStarted] = useState(!isHimalayan || vrMode)
  const [showHowToPlay, setShowHowToPlay] = useState(isHimalayan && !vrMode)
  const [binocularMode, setBinocularMode] = useState(false)
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
  const [webXrSupported, setWebXrSupported] = useState<boolean | null>(null)
  const [xrStore, setXRStore] = useState<XRStore | null>(null)
  const [immersiveActive, setImmersiveActive] = useState(false)
  const [xrError, setXrError] = useState('')
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

  const setBinoculars = (enabled: boolean) => {
    setBinocularMode(enabled)
    window.dispatchEvent(new CustomEvent('vr-binocular-intent', { detail: { enabled } }))
  }

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
      setMissionStarted(scenario.id !== 'himalayan-shield' || mode === 'vr')
      setShowHowToPlay(scenario.id === 'himalayan-shield' && mode !== 'vr')
    }
  }, [mode, scenario.id, scenario.difficulty])

  useEffect(() => {
    if (!missionStarted || run.id === 'starting') return
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
  }, [missionStarted, run.id, threats])

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === document.documentElement)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    if (!missionStarted || submitted || run.id === 'starting') return
    const timer = window.setInterval(() => setSeconds((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [missionStarted, run.id, submitted])

  useEffect(() => {
    if (!missionStarted || submitted || run.id === 'starting' || seconds >= 180) return
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
  }, [missionStarted, run.id, seconds, submitted, threats])

  useEffect(() => {
    if (soundOn) playSimulationTone('ambient', 0.04)
  }, [scenario.id, soundOn])

  useEffect(() => {
    if (!vrMode) return
    let mounted = true
    let store: XRStore | null = null
    let unsubscribeSessionEnd = () => {}
    setWebXrSupported(null)
    setXrError('')

    const xr = (navigator as Navigator & {
      xr?: { isSessionSupported: (mode: 'immersive-vr') => Promise<boolean> }
    }).xr
    if (!xr) {
      setWebXrSupported(false)
      return () => { mounted = false }
    }

    void xr.isSessionSupported('immersive-vr').then(async (supported) => {
      if (!mounted) return
      setWebXrSupported(supported)
      if (!supported) return
      const { createXRStore } = await import('@react-three/xr')
      if (!mounted) return
      store = createXRStore({ emulate: false, offerSession: false, enterGrantedSession: false })
      unsubscribeSessionEnd = store.onSessionEnd(() => setImmersiveActive(false))
      setXRStore(store)
    }).catch((error: unknown) => {
      console.warn('WebXR capability detection failed.', error)
      if (!mounted) return
      setWebXrSupported(false)
      setXrError('Immersive VR could not be initialized. VR Preview Mode remains available.')
    })

    return () => {
      mounted = false
      unsubscribeSessionEnd()
      setImmersiveActive(false)
      if (!store) return
      const session = store.getState().session
      if (session) void session.end().catch(() => undefined).finally(() => store?.destroy())
      else store.destroy()
    }
  }, [vrMode])

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

  const classifyThreat = (threatId: string, classification: 'Friendly' | 'Unknown' | 'Hostile') => {
    const threat = threats.find((item) => item.id === threatId)
    if (!threat || !eventLog.current.some((event) => event.eventType === 'DRONE_DETECTED' && event.threatId === threatId)) return false
    const result = classification === threat.expectedClassification ? 'correct' : 'incorrect'
    appendEvent('DRONE_CLASSIFIED', threatId, { actualClassification: classification, result })
    if (result === 'incorrect' && soundOn) playSimulationTone('alert')
    setStep(3)
    return true
  }

  const prioritizeThreat = (threatId: string, priority: 'High' | 'Medium' | 'Low') => {
    const threat = threats.find((item) => item.id === threatId)
    const classification = [...eventLog.current].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threatId)?.actualClassification
    if (!threat || typeof classification !== 'string') return false
    const assessmentThreat = isHimalayan ? { ...threat, expectedClassification: classification } : threat
    const expectedPriority = isHimalayan ? getHimalayanThreatAssessment(assessmentThreat).priority : threat.priority
    const result = priority === expectedPriority ? 'correct' : 'incorrect'
    appendEvent('THREAT_PRIORITIZED', threatId, { actualPriority: priority, result })
    if (result === 'incorrect' && soundOn) playSimulationTone('alert')
    setStep(4)
    return true
  }

  const responseActionFor = (classification: string) => classification === 'Hostile'
    ? 'Escalate alert'
    : classification === 'Unknown' ? 'Track priority threat' : 'Continue monitoring'

  const respondToThreat = (threatId: string, action: 'Continue monitoring' | 'Track priority threat' | 'Escalate alert') => {
    const threat = threats.find((item) => item.id === threatId)
    const classification = [...eventLog.current].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threatId)?.actualClassification
    if (!threat || typeof classification !== 'string' || !eventLog.current.some((event) => event.eventType === 'THREAT_PRIORITIZED' && event.threatId === threatId)) return false
    const result = action === responseActionFor(threat.expectedClassification) ? 'correct' : 'incorrect'
    appendEvent('RESPONSE_SELECTED', threatId, { action, result })
    return true
  }

  const finishMission = () => {
    if (!missionStarted || completionGuard.current || submitted) return
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
      mode: vrMode ? 'vr' : 'desktop',
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
        classification: (([...sessionEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED') as (SessionEvent & { actualClassification?: string }) | undefined)?.actualClassification ?? ''),
        classificationThreatId: (([...sessionEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED') as (SessionEvent & { threatId?: string }) | undefined)?.threatId ?? ''),
        priorityThreatId: (([...sessionEvents].reverse().find((event) => event.eventType === 'THREAT_PRIORITIZED') as (SessionEvent & { threatId?: string }) | undefined)?.threatId ?? null),
        response: (([...sessionEvents].reverse().find((event) => event.eventType === 'RESPONSE_SELECTED') as (SessionEvent & { action?: string }) | undefined)?.action ?? ''),
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
    if (missionStarted && seconds === 0 && !submitted) finishMission()
  }, [missionStarted, seconds, submitted])

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

  const handleVRVoiceCommand = (transcript: string) => {
    const parsed = parseVRCommand(transcript, threats.map((threat) => threat.id))
    if (parsed.status === 'target-not-found') return `${parsed.targetReference} is not an active target.`
    if (parsed.status === 'unrecognized') return 'Voice command not recognized.'

    const command = parsed.command
    if (
      command.intent === 'MOVE_FORWARD' ||
      command.intent === 'MOVE_BACKWARD' ||
      command.intent === 'MOVE_LEFT' ||
      command.intent === 'MOVE_RIGHT' ||
      command.intent === 'MOVE_UP' ||
      command.intent === 'MOVE_DOWN' ||
      command.intent === 'MOVE_STOP'
    ) {
      if (command.intent === 'MOVE_STOP') {
        window.dispatchEvent(new CustomEvent('vr-move-intent', { detail: { intent: 'MOVE_STOP' } }))
        return 'Movement stopped.'
      }

      window.dispatchEvent(new CustomEvent('vr-move-intent', { detail: { intent: command.intent } }))
      return `Camera moving ${command.intent.replace('MOVE_', '').toLowerCase()}.`
    }

    if (command.intent === 'TOGGLE_BINOCULARS') {
      setBinoculars(command.enabled)
      return command.enabled ? 'Binoculars enabled.' : 'Binoculars disabled.'
    }

    if (!('threatId' in command)) return 'Voice command not recognized.'
    const threatId = command.threatId
    const detected = () => eventLog.current.some((event) => event.eventType === 'DRONE_DETECTED' && event.threatId === threatId)
    const classified = () => eventLog.current.some((event) => event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threatId)
    const prioritized = () => eventLog.current.some((event) => event.eventType === 'THREAT_PRIORITIZED' && event.threatId === threatId)

    if (command.intent === 'SELECT_TARGET' || command.intent === 'DETECT_TARGET') {
      selectThreat(threatId)
      return detected() ? `${threatId} selected and detection recorded.` : `${threatId} selected; waiting for the contact to spawn.`
    }

    if (command.intent === 'CLASSIFY_TARGET') {
      if (!command.classification.trim()) {
        selectThreat(threatId)
        if (!detected()) return `Detect ${threatId} before classifying it.`
        setStep(2)
        return `${threatId} selected. Say classify ${threatId.replace('-', '')} as Friendly, Unknown, or Hostile.`
      }
      const classifications = { friendly: 'Friendly', unknown: 'Unknown', hostile: 'Hostile' } as const
      const classification = classifications[command.classification.toLowerCase() as keyof typeof classifications]
      if (!classification) return 'Unknown classification. Use Friendly, Unknown, or Hostile.'
      selectThreat(threatId)
      if (!detected()) return `Detect ${threatId} before classifying it.`
      return classifyThreat(threatId, classification) ? `${threatId} classified as ${classification}.` : `Could not classify ${threatId}.`
    }

    if (command.intent === 'PRIORITIZE_TARGET') {
      selectThreat(threatId)
      if (!detected()) return `${threatId} has not spawned yet.`
      if (!classified()) return `Classify ${threatId} before prioritizing it.`
      const classification = [...eventLog.current].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threatId)?.actualClassification
      const targetThreat = threats.find((threat) => threat.id === threatId)
      if (!targetThreat) return `${threatId} is not an active target.`
      const assessmentThreat = isHimalayan ? { ...targetThreat, expectedClassification: classification ?? 'Unknown' } : targetThreat
      const assessmentPriority = getHimalayanThreatAssessment(assessmentThreat).priority
      const priority = assessmentPriority === 'Unknown' ? getPriority(classification ?? 'Unknown') : assessmentPriority
      return prioritizeThreat(threatId, priority) ? `${threatId} prioritized ${priority}.` : `Could not prioritize ${threatId}.`
    }

    if (command.intent !== 'RESPOND_TO_TARGET') return 'Voice command not recognized.'
    selectThreat(threatId)
    if (!detected()) return `${threatId} has not spawned yet.`
    if (!classified() || !prioritized()) return `Classify and prioritize ${threatId} before responding.`
    const classification = [...eventLog.current].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threatId)?.actualClassification ?? 'Unknown'
    const action = command.response === 'engage' ? 'Escalate alert' : responseActionFor(classification)
    return respondToThreat(threatId, action) ? `${threatId}: ${action} recorded as a simulated training response.` : `Could not respond to ${threatId}.`
  }

  const enterImmersiveVR = async () => {
    if (!xrStore || webXrSupported !== true) return
    setXrError('')
    try {
      const session = await xrStore.enterVR()
      if (!session) throw new Error('WebXR did not return an immersive session.')
      setImmersiveActive(true)
    } catch (error) {
      console.warn('Unable to start an immersive WebXR session.', error)
      setImmersiveActive(false)
      setXrError('Immersive VR could not be started on this device. VR Preview Mode remains available.')
    }
  }

  const exitImmersiveVR = async () => {
    setXrError('')
    try {
      await xrStore?.getState().session?.end()
      setImmersiveActive(false)
    } catch (error) {
      console.warn('Unable to end the immersive WebXR session.', error)
      setXrError('The headset session could not be ended from the browser controls.')
    }
  }

  const beginSimulation = () => {
    if (missionStarted) {
      setShowHowToPlay(false)
      return
    }
    setRun({ id: createSessionId(), seed: createScenarioSeed() })
    setMissionStarted(true)
    setShowHowToPlay(false)
  }

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  const selectedEvents = events.filter((event) => event.threatId === selectedThreat.id)
  const selectedClassification = [...selectedEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED')
  const selectedPriority = [...selectedEvents].reverse().find((event) => event.eventType === 'THREAT_PRIORITIZED')
  const selectedResponse = [...selectedEvents].reverse().find((event) => event.eventType === 'RESPONSE_SELECTED')
  const traineeClassification = selectedClassification?.actualClassification
  const selectedAssessment = getHimalayanThreatAssessment(isHimalayan
    ? { ...selectedThreat, expectedClassification: traineeClassification ?? 'Unknown' }
    : selectedThreat)
  const generatedStatus = detectedSet.has(selectedThreat.id) ? 'DETECTED' : 'UNDETECTED'
  const selectedDistanceMeters = Math.max(120, Math.round(Math.hypot(selectedThreat.spawnPosition[0], selectedThreat.spawnPosition[2]) * 12))
  const selectedHeading = (() => {
    const waypoints = selectedThreat.path.waypoints ?? [selectedThreat.spawnPosition, selectedThreat.spawnPosition]
    const start = waypoints[0]
    const end = waypoints[Math.min(1, waypoints.length - 1)]
    const angle = Math.atan2(end[0] - start[0], end[2] - start[2])
    return Math.round((angle * 180) / Math.PI + 360) % 360
  })()
  const contacts = threats.map((threat) => {
    const latestClassification = [...events].reverse().find((event) => (
      event.eventType === 'DRONE_CLASSIFIED' && event.threatId === threat.id
    ))?.actualClassification
    const classification: 'Friendly' | 'Unknown' | 'Hostile' | undefined = latestClassification === 'Friendly' || latestClassification === 'Unknown' || latestClassification === 'Hostile'
      ? latestClassification
      : undefined
    return {
      id: threat.id,
      type: threat.type,
      detected: detectedSet.has(threat.id),
      selected: threat.id === selectedId,
      position: threat.spawnPosition,
      ...(classification ? { classification } : {}),
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
    }
  }).filter((contact) => spawnedSet.has(contact.id))

  const howToContent = (
    <main className={styles.howToScreen} role="dialog" aria-modal="true" aria-labelledby="how-to-title">
      <div className={styles.howToInner}>
        <header className={styles.howToHeader}>
          <p className="eyebrow">GARUDA / PLAYER GUIDE</p>
          <h1 id="how-to-title">HOW TO PLAY</h1>
          <p>HIMALAYAN SHIELD — LIVE TRAINING SIMULATION</p>
        </header>

        <section className={styles.instructionMap} aria-label="Annotated simulation map preview">
          <div className={styles.mapPreviewHeader}>
            <div><b>01</b><span><strong>SCENARIO INFO</strong><small>{scenario.time} · {scenario.terrain} · {scenario.visibility}</small></span></div>
            <span className={styles.previewTag}>HIGH-ALTITUDE TRAINING RANGE</span>
          </div>
          <div className={styles.mapPreviewGrid}>
            <aside className={styles.previewThreatList}>
              <p><b>02</b> THREAT LIST</p>
              <span><i /> T-01 <small>CONTACT</small></span>
              <span><i /> T-02 <small>CONTACT</small></span>
              <span><i /> T-03 <small>CONTACT</small></span>
              <small>Shows active contacts</small>
            </aside>
            <div className={styles.previewScene}>
              <TrainingSimulationScene
                contacts={[]}
                terrain={scenario.terrain}
                time={scenario.time}
                visibility={scenario.visibility}
                himalayanVisuals={isHimalayan}
              />
              <span className={styles.sceneCallout}><b>03</b> 3D SIMULATION</span>
              <span className={styles.assetCallout}><b>06</b> PROTECTED ASSETS</span>
            </div>
            <aside className={styles.previewTarget}>
              <p><b>04</b> SELECTED TARGET</p>
              <UavReference type="Quadcopter UAV" />
              <span>Details about the selected contact</span>
            </aside>
          </div>
          <div className={styles.previewWorkflow}>
            <p><b>05</b> WORKFLOW</p>
            <span>DETECT <i>›</i> CLASSIFY <i>›</i> PRIORITIZE <i>›</i> RESPOND</span>
          </div>
          <p className={styles.assetNote}>These marked locations are critical assets. Monitor threats approaching them.</p>
        </section>

        <section className={styles.howToSteps} aria-label="Mission steps">
          <div className={styles.instructionSectionTitle}><span>MISSION FLOW</span><small>Eight simple steps</small></div>
          <div className={styles.stepGrid}>
            {[
              ['SCAN', 'Look across the Himalayan valley and search for moving drone contacts.'],
              ['SELECT', 'Click a drone in the scene or select a contact from the Threat List.'],
              ['DETECT', 'Select the contact to record that you detected it.'],
              ['CLASSIFY', 'Identify what type of threat/contact it is.'],
              ['PRIORITIZE', 'Decide which threat needs attention first.'],
              ['RESPOND', 'Choose the appropriate training response.'],
              ['KEEP WATCHING', 'Other drones keep moving while you work on one target.'],
              ['COMPLETE', 'Finish the mission and review your performance in AAR.'],
            ].map(([title, description], index) => (
              <article className={styles.stepItem} key={title}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div><strong>{title}</strong><p>{description}</p></div>
              </article>
            ))}
          </div>
          <div className={styles.coreRule}>
            <strong>IMPORTANT</strong>
            <p>Selecting one drone does <b>NOT</b> stop the other drones.</p>
            <span>Keep scanning the whole map.</span>
          </div>
        </section>

        <section className={styles.missionGuide}>
          <article>
            <div className={styles.instructionSectionTitle}><span>MISSION GOAL</span></div>
            <p>Find incoming drone threats, understand their behavior, protect critical areas and make the best response decision.</p>
            <strong className={styles.goodPerformanceTitle}>GOOD PERFORMANCE</strong>
            <ul className={styles.performanceList}>
              {['Detect threats quickly', 'Classify accurately', 'Prioritize important threats', 'Respond appropriately', 'Protect critical assets'].map((item) => (
                <li key={item}><Check size={14} />{item}</li>
              ))}
            </ul>
          </article>
          <article className={styles.controlsGuide}>
            <div className={styles.instructionSectionTitle}><span>CONTROLS</span></div>
            <div><b>MOUSE</b><span>Drag to orbit · Scroll to zoom · Click a drone to select</span></div>
            <div><b>KEYBOARD</b><span>WASD or arrow keys to move around the range</span></div>
          </article>
        </section>

        <footer className={styles.howToActions}>
          {!missionStarted && <Link href={`/soldier/training/${scenario.id}/briefing`} className="button button-outline">Back to briefing</Link>}
          <button className="button" onClick={beginSimulation}>
            {missionStarted ? 'BACK TO SIMULATION' : 'START SIMULATION'} <ArrowRight size={16} />
          </button>
        </footer>
      </div>
    </main>
  )

  const content = (
    <main className="page-content simulation-page">
      <PageHeader
        eyebrow={`LIVE ${vrMode ? 'VR-READY ' : ''}TRAINING / ${scenario.name.toUpperCase()}`}
        title="Live Training Simulation"
        subtitle={vrMode
          ? `VR-ready browser mode · ${scenario.terrain} terrain`
          : `Training only · ${scenario.terrain} terrain · ${spawnedSet.size} active / ${threats.length} total contacts`}
        action={
          <div className="simulation-top-controls">
            {missionStarted && <span className={`live-pill ${seconds < 30 ? 'critical' : ''}`}>
              <TimerReset size={14} /> {minutes}:{remainingSeconds}
            </span>}
            {isHimalayan && missionStarted && <button className="table-action" onClick={() => setShowHowToPlay(true)}>How to play</button>}
            {vrMode && missionStarted && (
              <TrainingVRControls
                threatIds={threats.map((threat) => threat.id)}
                webXrSupported={webXrSupported}
                xrReady={webXrSupported === true && xrStore !== null}
                immersiveActive={immersiveActive}
                xrError={xrError}
                binocularsEnabled={binocularMode}
                onCommand={handleVRVoiceCommand}
                onBinocularsChange={setBinoculars}
                onEnterVR={enterImmersiveVR}
                onExitVR={exitImmersiveVR}
              />
            )}
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
          {threats.map((threat) => {
            const threatEvents = events.filter((event) => event.threatId === threat.id)
            const classified = threatEvents.some((event) => event.eventType === 'DRONE_CLASSIFIED')
            const prioritized = threatEvents.some((event) => event.eventType === 'THREAT_PRIORITIZED')
            const responded = threatEvents.some((event) => event.eventType === 'RESPONSE_SELECTED')
            const visibleClassification = [...threatEvents].reverse().find((event) => event.eventType === 'DRONE_CLASSIFIED')?.actualClassification
            const assessment = getHimalayanThreatAssessment(isHimalayan
              ? { ...threat, expectedClassification: typeof visibleClassification === 'string' ? visibleClassification : 'Unknown' }
              : threat)
            const state = isHimalayan
              ? !detectedSet.has(threat.id) ? 'CONTACT'
                : !classified ? 'CLASSIFICATION PENDING'
                  : !prioritized ? 'CLASSIFIED'
                    : !responded ? 'PRIORITY' : 'RESPONDING'
              : !spawnedSet.has(threat.id) ? 'CONTACT'
                : detectedSet.has(threat.id)
                  ? threat.expectedClassification === 'Hostile' && assessment.status !== 'Far' ? 'PRIORITY' : 'DETECTED'
                  : 'CLASSIFICATION PENDING'
            const visiblePriority = isHimalayan
              ? !detectedSet.has(threat.id) ? 'UNCONFIRMED' : !classified ? 'AWAITING CLASSIFICATION' : assessment.priority.toUpperCase()
              : assessment.priority
            return (
              <button
                key={threat.id}
                className={threat.id === selectedId ? 'selected' : ''}
                onClick={() => selectThreat(threat.id)}
              >
                <span className={detectedSet.has(threat.id) ? 'green' : 'amber'}>▲</span>
                <div>
                  <strong>{threat.id}</strong>
                  <small>{Math.max(120, Math.round(Math.hypot(threat.spawnPosition[0], threat.spawnPosition[2]) * 12))} m · {state}</small>
                </div>
                <small className="threat-status-label">{visiblePriority}</small>
              </button>
            )
          })}
        </Panel>
        <Panel className={`tactical-map ${styles.scenePanel}`}>
          <TrainingSimulationScene
            contacts={contacts}
            terrain={scenario.terrain}
            time={scenario.time}
            visibility={scenario.visibility}
            himalayanVisuals={isHimalayan}
            xrStore={vrMode ? xrStore ?? undefined : undefined}
            xrActive={vrMode && immersiveActive}
            missionStartedAt={missionStarted ? startedAt.current : undefined}
            onThreatDetected={selectThreat}
          />
          {binocularMode && (
            <div className={styles.binocularOverlay} role="img" aria-label="Binocular view enabled">
              <span className={styles.binocularLens} />
              <span className={styles.binocularLens} />
              <span className={styles.binocularReticle} />
              <strong>OPTICS / ACTIVE</strong>
            </div>
          )}
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
          <div className="target-status">
            {isHimalayan
              ? generatedStatus
              : detectedSet.has(selectedThreat.id)
              ? selectedClassification?.actualClassification ?? 'CLASSIFICATION PENDING'
              : 'UNDETECTED'}
          </div>
          <UavReference type={selectedThreat.type} />
          {[
            ['Threat ID', selectedThreat.id],
            ['Contact status', generatedStatus],
            ['Drone category', selectedThreat.type],
            ['Distance', `${selectedDistanceMeters} m`],
            ['Altitude', `${Math.round(selectedThreat.spawnPosition[1] * 100)} m`],
            ['Speed', `${Math.round(selectedThreat.path.speed ?? 0)} m/s`],
            ['Heading', isHimalayan && !detectedSet.has(selectedThreat.id) ? 'Awaiting detection' : `${selectedHeading}°`],
            ['Trajectory', isHimalayan && !detectedSet.has(selectedThreat.id) ? 'Unconfirmed' : `${selectedAssessment.status} · ${selectedAssessment.zoneName}`],
            ['Threat assessment', isHimalayan
              ? !detectedSet.has(selectedThreat.id) ? 'Unconfirmed' : !traineeClassification ? 'Awaiting classification' : selectedAssessment.priority
              : selectedAssessment.priority],
            ['Sensor confidence', `${selectedThreat.signalConfidence}%`],
            ['Detection time', selectedEvents.find((event) => event.eventType === 'DRONE_DETECTED')?.timestamp ? new Date(selectedEvents.find((event) => event.eventType === 'DRONE_DETECTED')!.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not yet detected'],
            ['Classification', selectedClassification?.actualClassification ?? (detectedSet.has(selectedThreat.id) ? 'Pending' : 'Not detected')],
          ].map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{String(value)}</b></div>
          ))}
        </Panel>
      </div>
      <div className="workflow">
        {['DETECT', 'CLASSIFY', 'PRIORITIZE', 'RESPOND'].map((label, index) => (
          <button
            key={label}
            className={`${styles.workflowStep} ${step === index + 1 ? 'active' : ''} ${index + 1 > step ? 'locked' : ''}`}
            disabled={index + 1 > step}
            onClick={() => setStep(index + 1)}
          >
            <b>{String(index + 1).padStart(2, '0')}</b><span>{label}</span>
            <small>{index + 1 > step ? 'LOCKED' : index + 1 < step ? 'COMPLETED' : 'ACTIVE'}</small>
          </button>
        ))}
        <Panel className="decision-panel">
          <p className="panel-label">
            {step === 1 ? 'DETECTION' : step === 2 ? `CLASSIFY ${selectedThreat.id}` : step === 3 ? 'PRIORITIZE TARGET' : 'RESPOND'}
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
                  onClick={() => classifyThreat(selectedThreat.id, choice as 'Friendly' | 'Unknown' | 'Hostile')}
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
                  onClick={() => prioritizeThreat(selectedThreat.id, priority)}
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
                    onClick={() => respondToThreat(selectedThreat.id, choice as 'Continue monitoring' | 'Track priority threat' | 'Escalate alert')}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
        </Panel>
        <button
          className="button submit-response"
          disabled={submitted || !selectedResponse || (!isHimalayan && detectedSet.size !== threats.length)}
          onClick={finishMission}
        >
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
      {missionStarted && <div className={`${fullscreen ? 'simulation-fullscreen' : ''} ${fullscreen ? styles.immersive : ''}`}>{content}</div>}
      {isHimalayan && showHowToPlay && howToContent}
    </PortalShell>
  )
}
