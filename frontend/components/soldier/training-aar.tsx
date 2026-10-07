'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Check, Play, RotateCcw, TriangleAlert, Volume2, VolumeX } from 'lucide-react'
import Link from 'next/link'
import { PageHeader, Panel, PortalShell, ProgressBar, ReadinessGauge, StatCard } from '@/components/common/portal-shell'
import { playSimulationTone } from '@/lib/simulation-audio'
import { scenarios } from '@/lib/types'
import {
  formatDuration,
  getSessionMetrics,
  getWhatIfOpportunity,
  readTrainingHistory,
  readTrainingSession,
  type SessionEvent,
  type TrainingHistoryItem,
  type TrainingSession,
} from '@/lib/training-session'
import styles from './training-aar.module.css'

const TrainingSimulationScene = dynamic(
  () => import('./training-simulation-scene').then((module) => module.TrainingSimulationScene),
  { ssr: false, loading: () => <div className={styles.sceneLoading}>Preparing recorded terrain…</div> },
)

type ReplayMode = 'normal' | 'what-if'

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

function makeWhatIfEvents(session: TrainingSession) {
  const opportunity = getWhatIfOpportunity(session)
  if (!opportunity) return session.events
  return session.events.map((event) => event.id === opportunity.changedEvent.id
    ? {
        ...opportunity.hypotheticalEvent,
        timestamp: session.startedAt
          ? new Date(new Date(session.startedAt).getTime() + opportunity.whatIfElapsedMs).toISOString()
          : opportunity.hypotheticalEvent.timestamp,
        modified: true,
      }
    : event).sort((first, second) => first.elapsedMs - second.elapsedMs)
}

function outcomeForThreat(session: TrainingSession, threatId: string) {
  const events = session.events.filter((event) => event.threatId === threatId)
  const detection = events.find((event) => event.eventType === 'DRONE_DETECTED')
  const missed = events.find((event) => event.eventType === 'DRONE_MISSED')
  const classification = events.find((event) => event.eventType === 'DRONE_CLASSIFIED')
  const priority = events.find((event) => event.eventType === 'THREAT_PRIORITIZED')
  return { detection, missed, classification, priority }
}

function metricValue(value: number | null, unit = '%') {
  return value === null ? 'N/A' : `${value.toFixed(unit === '%' ? 0 : 1)}${unit}`
}

function replayContacts(session: TrainingSession, events: SessionEvent[], playbackMs: number, selectedEventId?: string) {
  return session.threats.filter((threat) => events.some(
    (event) => event.eventType === 'DRONE_SPAWN' && event.threatId === threat.id && event.elapsedMs <= playbackMs,
  )).map((threat) => {
    const threatEvents = events
      .filter((event) => event.threatId === threat.id && event.elapsedMs <= playbackMs)
      .sort((first, second) => first.elapsedMs - second.elapsedMs)
    const detected = threatEvents.some((event) => event.eventType === 'DRONE_DETECTED')
    const modified = events.some(
      (event) => event.threatId === threat.id && event.id === selectedEventId && event.modified,
    )
    const cueEvent = [...threatEvents].reverse().find((event) =>
      ['DRONE_DETECTED', 'DRONE_CLASSIFIED', 'THREAT_PRIORITIZED', 'RESPONSE_SELECTED', 'DRONE_MISSED', 'DRONE_NEUTRALIZED'].includes(event.eventType),
    )
    const eventCue = cueEvent
      ? cueEvent.eventType === 'DRONE_CLASSIFIED'
        ? `CLASSIFIED · ${String(cueEvent.actualClassification ?? 'UNKNOWN').toUpperCase()}`
        : cueEvent.eventType === 'THREAT_PRIORITIZED'
          ? `PRIORITY · ${String(cueEvent.actualPriority ?? 'SET').toUpperCase()}`
          : cueEvent.eventType === 'RESPONSE_SELECTED'
            ? `RESPONSE · ${String(cueEvent.action ?? 'RECORDED').toUpperCase()}`
            : cueEvent.eventType === 'DRONE_MISSED'
              ? 'MISSED CONTACT'
              : cueEvent.eventType === 'DRONE_NEUTRALIZED'
                ? 'NEUTRALIZED'
                : 'DETECTED'
      : undefined
    return {
      id: threat.id,
      type: threat.type,
      detected,
      eventCue,
      cueHypothetical: Boolean(cueEvent?.modified),
      selected: modified || events.some(
        (event) =>
          event.threatId === threat.id &&
          event.eventType === 'DRONE_DETECTED' &&
          event.elapsedMs <= playbackMs &&
          event.id === selectedEventId,
      ),
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
    }
  })
}

function RecordedReplay({
  session,
  mode,
  onModeComplete,
}: {
  session: TrainingSession
  mode: ReplayMode
  onModeComplete?: () => void
}) {
  const opportunity = getWhatIfOpportunity(session)
  const events = useMemo(
    () => [...(mode === 'what-if' && opportunity
      ? makeWhatIfEvents(session)
      : session.events)].sort((first, second) => first.elapsedMs - second.elapsedMs),
    [mode, opportunity, session],
  )
  const [playing, setPlaying] = useState(false)
  const [playbackMs, setPlaybackMs] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [soundOn, setSoundOn] = useState(false)
  const lastSoundTime = useRef(0)
  const lastTickTime = useRef<number | null>(null)
  const duration = Math.max(session.missionDurationMs, 1)
  const modifiedEvent = events.find((event) => event.modified)
  const activeEvent = [...events]
    .filter((event) => event.elapsedMs <= playbackMs && event.eventType !== 'MISSION_STARTED')
    .sort((first, second) => second.elapsedMs - first.elapsedMs)[0]

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const now = performance.now()
      const previous = lastTickTime.current ?? now
      lastTickTime.current = now
      setPlaybackMs((current) => Math.min(duration, current + (now - previous) * playbackSpeed))
    }, 50)
    return () => {
      window.clearInterval(timer)
      lastTickTime.current = null
    }
  }, [duration, playbackSpeed, playing])

  useEffect(() => {
    if (!playing || playbackMs < duration) return
    setPlaying(false)
    onModeComplete?.()
  }, [duration, onModeComplete, playbackMs, playing])

  useEffect(() => {
    const previousTime = lastSoundTime.current
    lastSoundTime.current = playbackMs
    if (!soundOn || playbackMs === 0) return
    events
      .filter((event) => event.elapsedMs > previousTime && event.elapsedMs <= playbackMs)
      .forEach((event) => {
        if (event.eventType === 'DRONE_DETECTED') playSimulationTone('detection')
        else if (event.eventType === 'DRONE_CLASSIFIED' || event.eventType === 'THREAT_PRIORITIZED') {
          playSimulationTone(event.result === 'incorrect' ? 'alert' : 'confirm')
        } else if (event.eventType === 'RESPONSE_SELECTED') playSimulationTone('confirm')
        else if (event.eventType === 'DRONE_NEUTRALIZED') playSimulationTone('completion')
      })
  }, [duration, events, playbackMs, soundOn])

  const start = () => {
    lastSoundTime.current = 0
    lastTickTime.current = performance.now()
    setPlaybackMs(0)
    setPlaying(true)
  }

  return (
    <div className={styles.replay}>
      {mode === 'what-if' && opportunity && (
        <div className={styles.replayHud} role="status">
          <strong>WHAT-IF SIMULATION</strong>
          <span>{opportunity.title}</span>
          {modifiedEvent && <em>Modified event · {formatTime(modifiedEvent.elapsedMs)}</em>}
        </div>
      )}
      <div className={styles.replayScene}>
        <TrainingSimulationScene
          contacts={replayContacts(session, events, playbackMs, modifiedEvent?.id)}
          terrain={session.environment.terrain}
          time={session.environment.time}
          visibility={session.environment.visibility}
          playbackSeconds={playbackMs / 1000}
        />
        {activeEvent && (
          <div className={`${styles.replayCue} ${activeEvent.modified ? styles.replayCueHypothetical : ''}`} role="status" aria-live="polite">
            <strong>{activeEvent.modified ? 'WHAT-IF EVENT' : 'RECORDED EVENT'}</strong>
            <span>{activeEvent.eventType.replaceAll('_', ' ')}{activeEvent.threatId ? ` · ${activeEvent.threatId}` : ''}</span>
            <em>{formatTime(activeEvent.elapsedMs)}</em>
          </div>
        )}
      </div>
      <div className={styles.replayToolbar}>
        <button className="table-action" onClick={start}><Play size={13} /> Play</button>
        <button className="table-action" onClick={() => setPlaying(false)}>Pause</button>
        <button className="table-action" onClick={() => { setPlaying(false); lastSoundTime.current = 0; setPlaybackMs(0) }}>
          <RotateCcw size={13} /> Restart
        </button>
        {[0.5, 1, 2].map((speed) => (
          <button
            key={speed}
            className="table-action"
            onClick={() => setPlaybackSpeed(speed)}
            aria-pressed={playbackSpeed === speed}
          >
            {speed}x
          </button>
        ))}
        <button
          className="table-action"
          onClick={() => {
            setSoundOn((enabled) => !enabled)
            playSimulationTone('confirm')
          }}
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />} Sound {soundOn ? 'on' : 'off'}
        </button>
        <span>{formatTime(playbackMs)} / {formatTime(duration)}</span>
      </div>
      <div className="timeline"><span style={{ width: `${Math.min(100, (playbackMs / duration) * 100)}%` }} /></div>
      <ol className={styles.eventTimeline}>
        {events.map((event) => (
          <li
            key={event.id}
            className={`${event.elapsedMs <= playbackMs ? styles.eventActive : ''} ${event.modified ? styles.eventModified : ''}`}
          >
            <span>{formatTime(event.elapsedMs)}</span>
            <strong>{event.eventType.replaceAll('_', ' ')}</strong>
            {event.threatId && <em>{event.threatId}</em>}
            {event.modified && <small>WHAT-IF</small>}
          </li>
        ))}
      </ol>
      {mode === 'what-if' && opportunity && !playing && playbackMs >= duration && (
        <div className={styles.outcome}>
          <div><span>ORIGINAL SCORE</span><strong>{opportunity.actualScore}/100</strong></div>
          <div><span>WHAT-IF SCORE</span><strong>{opportunity.whatIfScore}/100</strong></div>
          <div><span>SCORE CHANGE</span><strong>{opportunity.whatIfScore - opportunity.actualScore >= 0 ? '+' : ''}{opportunity.whatIfScore - opportunity.actualScore}</strong></div>
          <p>{opportunity.reason}</p>
        </div>
      )}
    </div>
  )
}

export function AARExperience({ session: sessionId }: { session: string }) {
  const [tab, setTab] = useState('overview')
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [replayMode, setReplayMode] = useState<ReplayMode | null>(null)
  const [whatIfComplete, setWhatIfComplete] = useState(false)
  const [storedHistory, setStoredHistory] = useState<TrainingHistoryItem[]>([])

  useEffect(() => {
    setSessionLoading(true)
    const storedSession = readTrainingSession(sessionId)
    setStoredHistory(readTrainingHistory())
    setSession(storedSession)
    setReplayMode(null)
    setWhatIfComplete(false)
    setSessionLoading(false)
  }, [sessionId])

  const metrics = useMemo(() => session ? getSessionMetrics(session) : null, [session])
  const opportunity = useMemo(() => session ? getWhatIfOpportunity(session) : null, [session])
  const scenario = session ? scenarios.find((item) => item.id === session.scenario) : undefined
  const classificationEventCount = (metrics?.correctClassifications ?? 0) + (metrics?.incorrectClassifications ?? 0)
  const prioritizedCount = (metrics?.correctPriorityDecisions ?? 0) + (metrics?.incorrectPriorityDecisions ?? 0)

  const strengths = [
    ...(metrics && metrics.detected > 0 && metrics.lateDetections === 0 ? ['All recorded detections met the time window for this difficulty.'] : []),
    ...(classificationEventCount > 0 && metrics?.incorrectClassifications === 0 ? ['Every recorded classification matched the scenario signature.'] : []),
    ...(prioritizedCount > 0 && metrics?.incorrectPriorityDecisions === 0 ? ['Every recorded priority decision selected a highest-priority contact.'] : []),
    ...(metrics?.responseAccuracy === 100 ? ['The recorded response matched the selected contact.'] : []),
  ]
  const weaknesses = [
    ...(metrics && metrics.missed > 0 ? [`${metrics.missed} contact${metrics.missed === 1 ? '' : 's'} missed.`] : []),
    ...(metrics && metrics.lateDetections > 0 ? [`${metrics.lateDetections} detection${metrics.lateDetections === 1 ? '' : 's'} exceeded the ${session?.difficulty} time window.`] : []),
    ...(metrics && metrics.incorrectClassifications > 0 ? [`${metrics.incorrectClassifications} classification${metrics.incorrectClassifications === 1 ? '' : 's'} did not match the scenario signature.`] : []),
    ...(metrics && metrics.incorrectPriorityDecisions > 0 ? [`${metrics.incorrectPriorityDecisions} priority decision${metrics.incorrectPriorityDecisions === 1 ? '' : 's'} selected a lower-priority contact.`] : []),
    ...(metrics?.responseAccuracy !== null && metrics?.responseAccuracy !== undefined && metrics.responseAccuracy < 100
      ? ['The recorded response did not match the selected contact.']
      : []),
  ]
  const recommendations = [
    ...(metrics && metrics.missed > 0 ? ['Use the contact list to review incoming tracks before the mission ends.'] : []),
    ...(metrics && metrics.lateDetections > 0 ? ['Prioritize earlier scans; this difficulty uses a shorter detection window.'] : []),
    ...(metrics && metrics.incorrectClassifications > 0 ? ['Compare each detected contact with its recorded scenario signature before classifying.'] : []),
    ...(metrics && metrics.incorrectPriorityDecisions > 0 ? ['Select a detected contact with the highest recorded threat priority first.'] : []),
    ...(metrics?.responseAccuracy !== null && metrics?.responseAccuracy !== undefined && metrics.responseAccuracy < 100
      ? ['Match the response to the selected contact’s recorded classification.']
      : []),
  ]

  const trend = storedHistory
    .filter((item) => item.scenario === session?.scenario)
    .sort((first, second) => first.completedAt.localeCompare(second.completedAt))
  const difficultyHistory = (['Easy', 'Medium', 'Hard', 'Expert'] as const).map((difficulty) => {
    const sessions = storedHistory.filter((item) => item.difficulty === difficulty)
    return {
      difficulty,
      sessions: sessions.length,
      averageScore: sessions.length
        ? Math.round(sessions.reduce((total, item) => total + item.score, 0) / sessions.length)
        : null,
    }
  })

  const startWhatIf = () => {
    setWhatIfComplete(false)
    setReplayMode('what-if')
  }

  if (!session || !metrics) {
    return (
      <PortalShell role="soldier">
        <main className="page-content">
          <PageHeader
            eyebrow="AFTER ACTION REVIEW"
            title={sessionLoading ? 'Loading recorded session' : 'Session unavailable'}
            subtitle={sessionLoading ? 'Retrieving the requested session.' : 'No saved session matches this session ID.'}
          />
          {!sessionLoading && (
            <Panel><p className="muted">This review cannot display another session as a fallback. Return to training and complete a simulation to create a new AAR.</p></Panel>
          )}
        </main>
      </PortalShell>
    )
  }

  const actualScore = session.score
  const hasRecordedSession = true
  const detectionPercent = metrics.detectionAccuracy

  return (
    <PortalShell role="soldier">
      <main className="page-content">
        <PageHeader
          eyebrow={`AFTER ACTION REVIEW / ${session.id.toUpperCase()}`}
          title="After Action Review"
          subtitle={scenario
            ? `${scenario.name} · ${hasRecordedSession ? 'Recorded session analysis' : 'Historical session summary'}`
            : 'Review recorded decisions and outcomes from this training session.'}
        />
        <div className="tabs">
          {[
            ['overview', 'Performance Overview'],
            ['replay', 'Decision Replay'],
            ['whatif', 'What-If Analysis'],
            ['learnings', 'Key Learnings'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className={styles.overview}>
            <div className="aar-grid">
              <Panel className="score-panel">
                <p className="panel-label">OVERALL SCORE</p>
                {actualScore === null ? (
                  <p className="muted">No recorded score is available for this session.</p>
                ) : (
                  <>
                    <ReadinessGauge value={actualScore} />
                    <strong className={styles.scoreText}>{actualScore}<small> / 100 · simulation score</small></strong>
                  </>
                )}
              </Panel>
              <Panel>
                <p className="panel-label">SESSION CONTEXT</p>
                <div className={styles.contextGrid}>
                  <span>Scenario<b>{scenario?.name ?? session.scenario}</b></span>
                  <span>Terrain<b>{hasRecordedSession ? session.environment.terrain : 'N/A'}</b></span>
                  <span>Time / visibility<b>{hasRecordedSession ? `${session.environment.time} / ${session.environment.visibility}` : 'N/A'}</b></span>
                  <span>Mission time<b>{hasRecordedSession ? formatDuration(session.missionDurationMs) : 'N/A'}</b></span>
                  <span>Completed<b>{session.completedAt ? new Date(session.completedAt).toLocaleString() : 'N/A'}</b></span>
                  <span>Difficulty<b>{session.difficulty}</b></span>
                </div>
              </Panel>
            </div>

            <section className={styles.metricsGrid} aria-label="Mission performance metrics">
              <StatCard label="Detection accuracy" value={hasRecordedSession ? metricValue(detectionPercent) : 'N/A'} />
              <StatCard label="Average detection time" value={hasRecordedSession && metrics.averageDetectionMs !== null ? formatDuration(metrics.averageDetectionMs) : 'N/A'} />
              <StatCard label="Classification accuracy" value={hasRecordedSession ? metricValue(metrics.classificationAccuracy) : 'N/A'} />
              <StatCard label="Priority accuracy" value={hasRecordedSession ? metricValue(metrics.priorityAccuracy) : 'N/A'} />
              <StatCard label="Response accuracy" value={metricValue(metrics.responseAccuracy)} />
              <StatCard label="Threats detected / missed" value={hasRecordedSession ? `${metrics.detected} / ${metrics.missed}` : 'N/A'} />
              <StatCard label="Successful engagements" value={hasRecordedSession && metrics.successfulEngagements !== null ? String(metrics.successfulEngagements) : 'N/A'} />
              <StatCard label="Incorrect decisions" value={hasRecordedSession ? String(metrics.incorrectDecisions) : 'N/A'} />
            </section>

            <Panel>
              <p className="panel-label">SCORE BREAKDOWN</p>
              <div className={styles.scoreRule}>
                <span>{hasRecordedSession ? session.scoreBreakdown.rule : 'No scoring event breakdown is available for this session.'}</span>
                <strong>{actualScore === null ? 'N/A' : `${actualScore}/100`}</strong>
              </div>
              {hasRecordedSession && (
                <div className={styles.scoreBreakdown}>
                  <span>Detection <b>{session.scoreBreakdown.detectionScore}</b></span>
                  <span>Classification <b>{session.scoreBreakdown.classificationScore}</b></span>
                  <span>Prioritization <b>{session.scoreBreakdown.prioritizationScore}</b></span>
                  <span>Response <b>{session.scoreBreakdown.responseScore}</b></span>
                  <span>Penalties <b>{session.scoreBreakdown.penaltyScore}</b></span>
                </div>
              )}
            </Panel>

            <Panel>
              <p className="panel-label">THREAT-BY-THREAT ANALYSIS</p>
              {session.threats.length ? (
                <div className={styles.threatAnalysis}>
                  {session.threats.map((threat) => {
                    const result = outcomeForThreat(session, threat.id)
                    return (
                      <article key={threat.id}>
                        <header><strong>{threat.id}</strong><span>{threat.priority} priority · {threat.expectedClassification}</span></header>
                        <p>{result.detection ? `Detected at ${formatDuration(result.detection.elapsedMs)}` : result.missed ? 'Missed before mission completion' : 'No detection outcome recorded'}</p>
                        {result.classification && <p>Classification: {result.classification.actualClassification} · {result.classification.result}</p>}
                        {result.priority && <p>Priority decision: {result.priority.result}</p>}
                      </article>
                    )
                  })}
                </div>
              ) : <p className="muted">Per-threat events are unavailable for this older session.</p>}
            </Panel>

            <div className="aar-grid">
              <Panel>
                <p className="panel-label">STRENGTHS FROM RECORDED EVENTS</p>
                {strengths.length
                  ? strengths.map((strength) => <p className={styles.positive} key={strength}><Check size={14} />{strength}</p>)
                  : <p className="muted">No strengths can be confirmed from the recorded events.</p>}
              </Panel>
              <Panel>
                <p className="panel-label">AREAS FOR IMPROVEMENT</p>
                {weaknesses.length
                  ? weaknesses.map((weakness) => <p className={styles.warning} key={weakness}><TriangleAlert size={14} />{weakness}</p>)
                  : <p className="muted">No measured errors were recorded.</p>}
              </Panel>
            </div>

            <Panel>
              <p className="panel-label">RECOMMENDATIONS FROM RECORDED EVENTS</p>
              {recommendations.length
                ? recommendations.map((recommendation) => <p className={styles.warning} key={recommendation}><TriangleAlert size={14} />{recommendation}</p>)
                : <p className="muted">No targeted recommendation can be derived from this session’s recorded events.</p>}
            </Panel>

            <Panel>
              <p className="panel-label">PERFORMANCE BY DIFFICULTY · SAVED SESSIONS</p>
              <div className={styles.contextGrid}>
                {difficultyHistory.map((item) => (
                  <span key={item.difficulty}>{item.difficulty}<b>{item.sessions ? `${item.averageScore}/100 average · ${item.sessions} session${item.sessions === 1 ? '' : 's'}` : 'No saved sessions'}</b></span>
                ))}
              </div>
            </Panel>

            {trend.length > 1 && (
              <Panel>
                <p className="panel-label">RECORDED SCENARIO SCORE TREND</p>
                <div className={styles.trend}>
                  {trend.map((item, index) => (
                    <Link href={`/soldier/aar/${item.id}`} key={item.id}>
                      <span>Session {index + 1} · {new Date(item.completedAt).toLocaleDateString()}</span>
                      <ProgressBar value={item.score} />
                      <b>{item.score} · {item.difficulty}</b>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}

        {tab === 'replay' && (
          <Panel className="replay-card">
            <p className="panel-label">DECISION REPLAY / ORIGINAL RECORDED SESSION</p>
            {hasRecordedSession && session.threats.length
              ? <><p className="muted">Recorded score: {session.score}/100 · {session.difficulty} · scenario {scenario?.name ?? session.scenario}</p><RecordedReplay session={session} mode="normal" /></>
              : <p className="muted">Deterministic replay data is unavailable for this older session.</p>}
          </Panel>
        )}

        {tab === 'whatif' && (
          <Panel className={styles.whatIf}>
            <p className="panel-label">WHAT-IF ANALYSIS</p>
            {hasRecordedSession && opportunity ? (
              <>
                <div className={styles.opportunity}>
                  <span>IMPROVEMENT OPPORTUNITY</span>
                  <h2>{opportunity.title}</h2>
                  <p>{opportunity.description}</p>
                </div>
                <div className={styles.comparison}>
                  <div><span>ACTUAL SCORE</span><strong>{opportunity.actualScore}</strong></div>
                  <div><span>WHAT-IF SCORE</span><strong>{opportunity.whatIfScore}</strong></div>
                  <div><span>SCORE CHANGE</span><strong>{opportunity.whatIfScore - opportunity.actualScore >= 0 ? '+' : ''}{opportunity.whatIfScore - opportunity.actualScore}</strong></div>
                </div>
                <p className="muted">{opportunity.reason}</p>
                {opportunity.changedEvent.eventType === 'DRONE_DETECTED' || opportunity.changedEvent.eventType === 'DRONE_MISSED' ? (
                  <div className={styles.eventChange}>
                    <span>CHANGED EVENT · {opportunity.changedEvent.threatId}</span>
                    <b>Original: {formatDuration(opportunity.originalElapsedMs)} · What-if: {formatDuration(opportunity.whatIfElapsedMs)}</b>
                  </div>
                ) : <div className={styles.eventChange}><span>CHANGED EVENT · {opportunity.changedEvent.threatId ?? opportunity.changedEvent.eventType}</span><b>Only this recorded decision changes in the replay.</b></div>}
                <button className="button" onClick={startWhatIf}>
                  <Play size={15} /> Simulate What-If
                </button>
                {replayMode === 'what-if' && (
                  <RecordedReplay
                    key={`${session.completedAt}-what-if`}
                    session={session}
                    mode="what-if"
                    onModeComplete={() => setWhatIfComplete(true)}
                  />
                )}
                {whatIfComplete && (
                  <p className={styles.outcomeNote}>
                    Original {opportunity.actualScore}/100 · What-if {opportunity.whatIfScore}/100 ·
                    {' '}{opportunity.whatIfScore - opportunity.actualScore >= 0 ? '+' : ''}{opportunity.whatIfScore - opportunity.actualScore} points.
                    {' '}{opportunity.reason}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                {hasRecordedSession
                  ? 'No recorded event presents a measurable what-if opportunity under the existing scoring rule.'
                  : 'Recorded events are unavailable for this older session, so a counterfactual replay cannot be constructed.'}
              </p>
            )}
          </Panel>
        )}

        {tab === 'learnings' && (
          <Panel>
            <p className="panel-label">KEY LEARNINGS FROM THIS SESSION</p>
            {weaknesses.length ? (
              <ol className={styles.learnings}>
                {weaknesses.slice(0, 3).map((weakness) => <li key={weakness}>{weakness}</li>)}
                {opportunity && <li>{opportunity.reason}</li>}
              </ol>
            ) : (
              <p className="muted">There are not enough recorded mistakes to derive a session-specific learning.</p>
            )}
            {scenario && <Link href={`/soldier/training/${scenario.id}/briefing`} className="button">Review {scenario.name} briefing</Link>}
          </Panel>
        )}
      </main>
    </PortalShell>
  )
}
