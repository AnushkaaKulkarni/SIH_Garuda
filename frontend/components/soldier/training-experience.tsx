'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BrainCircuit, Clock3, Sparkles, Target, TriangleAlert } from 'lucide-react'
import { scenarios, type Scenario } from '@/lib/types'
import { PageHeader, Panel, PortalShell } from '@/components/common/portal-shell'
import { SoldierPage } from '@/components/soldier/soldier-page'
import { getConfiguredThreatCount, isAttackMode, isTrainingDifficulty, resolveMissionConfiguration, type AttackMode, type TrainingDifficulty } from '@/lib/training-session'
import { getTrainingNavigation } from '@/lib/training-navigation'
import { SoldierTrainingManual } from './soldier-training-manual'

export { AARExperience } from './training-aar'
export { LiveSimulation } from './training-live-simulation'

const recommended = ['night-watch', 'swarm-intercept', 'urban-vigilance']
const scheduled = ['himalayan-shield', 'desert-sentinel', 'coastal-watch']
const adminCreated = ['urban-vigilance', 'mountain-edge', 'border-horizon']

function ScenarioCard({ scenario, label }: { scenario: Scenario; label?: string }) {
  return <article className="scenario-card" style={{ backgroundImage: `url(${scenario.image})` }}><div className="scenario-card-content"><span>{label || `${scenario.type} / ${scenario.terrain}`}</span><h2>{scenario.name}</h2><p>{scenario.description}</p><div><small>{scenario.threatCount} THREATS</small><b className={scenario.difficulty === 'Hard' ? 'red' : ''}>{scenario.difficulty}</b></div><Link href={`/soldier/training/${scenario.id}/briefing`} className="table-action">View briefing <ArrowRight size={14}/></Link></div></article>
}

export function TrainingExperience() {
  const [filter, setFilter] = useState('All')
  const [difficulty, setDifficulty] = useState('All')
  const filtered = scenarios.filter(s => (filter === 'All' || s.type === filter || s.terrain === filter || s.time === filter) && (difficulty === 'All' || s.difficulty === difficulty))
  const byIds = (ids: string[]) => ids.map(id => scenarios.find(s => s.id === id)).filter(Boolean) as Scenario[]
  return <PortalShell role="soldier"><main className="page-content"><PageHeader eyebrow="TRAINING LIBRARY / ADAPTIVE READINESS" title="Select Training Scenario" subtitle="GARUDA schedules practice around your skill gaps so training never becomes rote."/><Panel className="improvement-panel"><div className="eyebrow"><Sparkles size={13}/> ADAPTIVE TRAINING ENGINE</div><h2>Top 3 areas to improve</h2><p className="muted">Recommended from your last six sessions and current skill profile.</p><div className="improvement-grid">{byIds(recommended).map((s, i) => <div className="improvement-card" key={s.id}><b className="improvement-rank">0{i+1}</b><div><strong>{s.name} <em>{[52,58,64][i]}%</em></strong><p>Focus on {['night operations','swarm handling','urban surveillance'][i]}.</p><Link href={`/soldier/training/${s.id}/briefing`}>View adaptive brief <ArrowRight size={13}/></Link></div></div>)}</div></Panel><div className="filter-bar">{['All','Land','Air','Coastal','Urban','Night','Swarm','High Altitude'].map(f => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div><div className="filter-bar difficulty-filter">{['All','Easy','Medium','Hard'].map(f => <button key={f} className={difficulty === f ? 'active' : ''} onClick={() => setDifficulty(f)}>{f}</button>)}</div><section className="scenario-section"><div className="section-heading"><div><p className="eyebrow">SYSTEM SCHEDULED</p><h2>Built for your readiness plan</h2></div><span className="section-count">{byIds(scheduled).length} scenarios</span></div><div className="scenario-grid">{byIds(scheduled).map(s => <ScenarioCard scenario={s} key={s.id} label="SYSTEM SCHEDULED" />)}</div></section><section className="scenario-section"><div className="section-heading"><div><p className="eyebrow">ADMINISTRATOR CREATED</p><h2>Assigned by your training command</h2></div><span className="section-count">{byIds(adminCreated).length} scenarios</span></div><div className="scenario-grid">{byIds(adminCreated).map(s => <ScenarioCard scenario={s} key={s.id} label="ADMIN CREATED" />)}</div></section><section className="scenario-section"><div className="section-heading"><div><p className="eyebrow">ALL TRAINING SCENARIOS</p><h2>Explore the full library</h2></div><span className="section-count">{filtered.length} scenarios</span></div><div className="scenario-grid">{filtered.map(s => <ScenarioCard scenario={s} key={s.id} />)}</div></section></main></PortalShell>
}

export function ScenarioBriefing({ scenarioId, initialDifficulty, initialAttackMode }: { scenarioId: string; initialDifficulty?: string; initialAttackMode?: string }) {
  const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[0]
  const initialConfiguration = resolveMissionConfiguration(scenario, { difficulty: initialDifficulty, attackMode: initialAttackMode })
  const [difficulty, setDifficulty] = useState<TrainingDifficulty>(initialConfiguration.difficulty)
  const [attackMode, setAttackMode] = useState<AttackMode>(initialConfiguration.attackMode)
  useEffect(() => {
    setDifficulty(isTrainingDifficulty(initialDifficulty) ? initialDifficulty : scenario.difficulty)
    setAttackMode(isAttackMode(initialAttackMode) ? initialAttackMode : scenario.type === 'Swarm' ? 'swarm' : 'multiple')
  }, [scenario.id, scenario.difficulty, scenario.type, initialDifficulty, initialAttackMode])
  const updateConfiguration = (nextDifficulty: TrainingDifficulty, nextAttackMode: AttackMode) => {
    setDifficulty(nextDifficulty)
    setAttackMode(nextAttackMode)
    window.history.replaceState(null, '', getTrainingNavigation(scenario.id, nextDifficulty, nextAttackMode).briefingHref)
  }
  const navigation = getTrainingNavigation(scenario.id, difficulty, attackMode)
  const modeDescription: Record<AttackMode, string> = {
    single: 'One independently tracked contact for a complete assessment cycle.',
    multiple: 'Independent contacts with separate identities, movement and arrival times.',
    swarm: 'Several individually assessed contacts sharing a group route and related arrival timing.',
    mixed: 'A three-contact related group plus independent contacts arriving in a later wave.',
  }
  const difficultyDescription: Record<TrainingDifficulty, string> = {
    Easy: 'Longer detection scoring window and clearer simulated evidence; encounter size and timing follow the selected mode.',
    Medium: 'Standard timing and moderate evidence uncertainty.',
    Hard: 'Shorter detection scoring window and less reliable evidence; encounter timing tightens where supported.',
    Expert: 'Tightest detection scoring window and greatest supported evidence uncertainty.',
  }
  const plannedCount = getConfiguredThreatCount(scenario.id, scenario.threatCount, difficulty, attackMode)
  return <PortalShell role="soldier"><main className="page-content"><PageHeader eyebrow={`MISSION BRIEFING / ${scenario.name.toUpperCase()}`} title={< >OPERATION <em>{scenario.name.toUpperCase()}</em></>} subtitle={scenario.description}/><div className="briefing-hero" style={{ backgroundImage: `linear-gradient(90deg,#031018eF,#03101855),url(${scenario.image})` }}><div><p className="eyebrow">THREAT SIMULATION // TRAINING ONLY</p><h2>{scenario.name}</h2><div className="briefing-stats"><span><Target size={15}/> {plannedCount} contacts planned</span><span><Clock3 size={15}/> {difficulty} difficulty</span><span><TriangleAlert size={15}/> {scenario.time} / {scenario.visibility}</span></div></div></div>
    <div className="briefing-grid">
      <Panel><p className="panel-label">DIFFICULTY</p><div className="filter-bar">{(['Easy', 'Medium', 'Hard', 'Expert'] as const).map(option => <button key={option} type="button" className={difficulty === option ? 'active' : ''} aria-pressed={difficulty === option} onClick={() => updateConfiguration(option, attackMode)}>{option}</button>)}</div><p className="muted">{difficultyDescription[difficulty]}</p></Panel>
      <Panel><p className="panel-label">ATTACK MODE</p><div className="filter-bar">{([
        ['single', 'Single Threat'], ['multiple', 'Multiple Threats'], ['swarm', 'Swarm Attack'], ['mixed', 'Mixed Scenario'],
      ] as const).map(([mode, label]) => <button key={mode} type="button" className={attackMode === mode ? 'active' : ''} aria-pressed={attackMode === mode} onClick={() => updateConfiguration(difficulty, mode)}>{label}</button>)}</div><p className="muted">{modeDescription[attackMode]}</p></Panel>
    </div>
    <div className="briefing-grid"><Panel><p className="panel-label">MISSION PREVIEW</p><div className="detail-row"><span>Scenario / terrain</span><b>{scenario.name} / {scenario.terrain}</b></div><div className="detail-row"><span>Environment</span><b>{scenario.time} / {scenario.visibility}</b></div><div className="detail-row"><span>Configuration</span><b>{difficulty} / {attackMode === 'single' ? 'Single Threat' : attackMode === 'multiple' ? 'Multiple Threats' : attackMode === 'swarm' ? 'Swarm Attack' : 'Mixed Scenario'}</b></div><div className="detail-row"><span>Expected contacts</span><b>{plannedCount}</b></div><p className="muted">{modeDescription[attackMode]} {difficultyDescription[difficulty]}</p></Panel><Panel><p className="panel-label">MISSION OBJECTIVES</p><ol className="objective-list"><li>Detect each contact when it becomes available.</li><li>Review simulated evidence and classify Friendly, Unknown or Hostile.</li><li>Assess urgency using the displayed scenario context and rubric.</li><li>Choose a simulated response and review the outcome in AAR.</li></ol></Panel></div>
    <SoldierTrainingManual scenario={scenario} difficulty={difficulty} attackMode={attackMode} compact />
    <div className="mode-actions"><Link href="/soldier/training" className="button button-outline"><ArrowLeft size={15}/> Back to scenarios</Link><Link href={navigation.guideHref} className="button button-outline"><BrainCircuit size={15}/> Begin Scenario with VR</Link><Link href={navigation.desktopSimulationHref} className="button">Begin Scenario <ArrowRight size={15}/></Link></div>
    </main></PortalShell>
}

export function DigitalTwinExperience() {
  return <SoldierPage view="digital-twin" />
}

export function ProgressExperience() {
  return <SoldierPage view="progress" />
}

export function ProfileExperience() {
  return <SoldierPage view="profile" />
}

export function NotificationsExperience() {
  const [read, setRead] = useState<string[]>([])
  const notifications = [
    { id: 'adaptive', title: 'Adaptive scenario created', body: 'Night Watch was generated from your weak night-operations score.', time: '12 min ago' },
    { id: 'admin', title: 'Administrator assigned terrain', body: 'Mountain Edge is now required this week.', time: '2 hours ago' },
    { id: 'summary', title: 'Readiness improved', body: 'Your last six sessions lifted readiness by 12%.', time: 'Yesterday' },
  ]

  return (
    <PortalShell role="soldier">
      <main className="page-content">
        <PageHeader
          eyebrow="TRAINEE PORTAL / NOTIFICATIONS"
          title="Notifications"
          subtitle="Adaptive assignments and command updates for your training plan."
          action={<button className="button button-outline" onClick={() => setRead(notifications.map((notification) => notification.id))}>Mark all read</button>}
        />
        <div className="notification-page-list">
          {notifications.map((notification) => (
            <Panel className={read.includes(notification.id) ? 'notification-read' : ''} key={notification.id}>
              <div>
                <span className="notification-dot" />
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
                <small>{notification.time}</small>
              </div>
              <button className="table-action" onClick={() => setRead([...read, notification.id])}>
                {read.includes(notification.id) ? 'Read' : 'Mark read'}
              </button>
            </Panel>
          ))}
        </div>
      </main>
    </PortalShell>
  )
}
