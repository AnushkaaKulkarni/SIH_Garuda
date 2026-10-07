'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, BrainCircuit, Clock3, Sparkles, Target, TriangleAlert, X } from 'lucide-react'
import { scenarios, type Scenario } from '@/lib/types'
import { PageHeader, Panel, PortalShell } from '@/components/common/portal-shell'
import { SoldierPage } from '@/components/soldier/soldier-page'

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

export function ScenarioBriefing({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[0]
  const [vr, setVr] = useState(false)
  return <PortalShell role="soldier"><main className="page-content"><PageHeader eyebrow={`MISSION BRIEFING / ${scenario.name.toUpperCase()}`} title={< >OPERATION <em>{scenario.name.toUpperCase()}</em></>} subtitle={scenario.description}/><div className="briefing-hero" style={{ backgroundImage: `linear-gradient(90deg,#031018eF,#03101855),url(${scenario.image})` }}><div><p className="eyebrow">THREAT SIMULATION // TRAINING ONLY</p><h2>{scenario.name}</h2><div className="briefing-stats"><span><Target size={15}/> {scenario.threatCount} contacts</span><span><Clock3 size={15}/> {scenario.difficulty} intensity</span><span><TriangleAlert size={15}/> {scenario.visibility}</span></div></div></div><div className="briefing-grid"><Panel><p className="panel-label">MISSION OBJECTIVES</p><ol className="objective-list"><li>Detect every incoming contact in the operational area.</li><li>Classify friendly, hostile and unknown signatures.</li><li>Prioritize the highest-risk threat before response.</li><li>Minimize critical asset exposure.</li></ol></Panel><Panel><p className="panel-label">SENSOR AND TERRAIN PROFILE</p><div className="detail-row"><span>Terrain</span><b>{scenario.terrain}</b></div><div className="detail-row"><span>Time / visibility</span><b>{scenario.time} / {scenario.visibility}</b></div><div className="detail-row"><span>Contacts</span><b>{scenario.threatCount} drone signatures</b></div></Panel></div><div className="mode-actions"><Link href="/soldier/training" className="button button-outline"><ArrowLeft size={15}/> Back to scenarios</Link><button className="button button-outline" onClick={() => setVr(true)}><BrainCircuit size={15}/> Enter scenario in VR</button><Link href={`/soldier/training/${scenario.id}/simulation`} className="button">Begin scenario <ArrowRight size={15}/></Link></div>{vr && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><button className="modal-close" onClick={() => setVr(false)} aria-label="Close"><X/></button><BrainCircuit className="modal-icon" size={34}/><p className="eyebrow">IMMERSIVE TRAINING</p><h2>VR mode is in progress</h2><p>Headset calibration and room-scale tracking are being integrated. You can begin the desktop simulation while the VR module is prepared.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setVr(false)}>Return to briefing</button><Link href={`/soldier/training/${scenario.id}/simulation`} className="button" onClick={() => setVr(false)}>Use desktop mode <ArrowRight size={14}/></Link></div></div></div>}</main></PortalShell>
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
