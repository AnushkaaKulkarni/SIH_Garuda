'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { PageHeader, Panel, PortalShell, ProgressBar, StatCard } from '@/components/common/portal-shell'
import { formatLastActive, useAdminOverview, type AdminTrainee } from '@/lib/admin-data'

export function AdminDatabaseDashboard() {
  const overview = useAdminOverview()
  const trainees = overview?.trainees ?? []
  const distribution = [
    { label: 'Excellent', count: trainees.filter((trainee) => trainee.readiness >= 85).length },
    { label: 'Good', count: trainees.filter((trainee) => trainee.readiness >= 70 && trainee.readiness < 85).length },
    { label: 'Average', count: trainees.filter((trainee) => trainee.readiness >= 50 && trainee.readiness < 70).length },
    { label: 'Needs Attention', count: trainees.filter((trainee) => trainee.readiness < 50).length },
  ]
  const points = (overview?.dailyTrend ?? []).map((day, index, items) => {
    const x = items.length < 2 ? 270 : index * 540 / (items.length - 1)
    const y = 170 - Math.max(0, Math.min(100, day.score)) * 1.4
    return `${x},${y}`
  }).join(' ')

  return <PortalShell role="admin"><main className="page-content">
    <PageHeader eyebrow="ADMINISTRATOR PORTAL / UNIT OVERVIEW" title="Unit Readiness Overview" subtitle="Monitor training progress across teams and units." />
    <div className="stat-grid">
      <StatCard label="Total Trainees" value={overview?.totalSoldiers ?? '—'} trend="Registered soldier accounts" />
      <StatCard label="Active Now" value={overview?.activeNow ?? '—'} trend="In progress" tone="amber" />
      <StatCard label="Avg. Readiness" value={overview ? `${overview.averageScore}%` : '—'} trend="Mean completed score" />
      <StatCard label="Missions Completed" value={overview?.completedSessions ?? '—'} trend="Saved training sessions" />
    </div>
    <div className="admin-grid">
      <Panel><p className="panel-label">READINESS DISTRIBUTION</p><div className="donut-chart"><strong>{overview?.totalSoldiers ?? '—'}</strong><small>TRAINEES</small></div><div className="legend">{distribution.map((item) => <span key={item.label}>{item.label} <b>{overview ? item.count : '—'}</b></span>)}</div></Panel>
      <Panel><div className="panel-heading"><p className="panel-label">SESSION SCORE TREND / 30 DAYS</p><strong className="teal">{overview ? `${overview.dailyTrend.length} days` : '—'}</strong></div><div className="trend-chart"><svg viewBox="0 0 540 190" role="img" aria-label="Average score by completed training day"><path className="trend-grid" d="M0 35H540M0 95H540M0 155H540" />{points && <polyline className="trend-line" points={points} />}</svg></div><div className="chart-labels"><span>{overview?.dailyTrend[0]?.date ?? 'No saved sessions'}</span><span>{overview?.dailyTrend.at(-1)?.date ?? ''}</span></div></Panel>
      <Panel className="wide"><p className="panel-label">AVERAGE PERFORMANCE AREAS</p>{(overview?.skillScores ?? []).map((skill) => <div className="skill-row" key={skill.name}><span>{skill.name}</span><ProgressBar value={skill.score} tone={skill.score < 60 ? 'amber' : 'teal'} /><b>{skill.score}%</b></div>)}</Panel>
    </div>
    <TraineeRows trainees={trainees} compact />
  </main></PortalShell>
}

export function AdminDatabaseTraineeDetail({ id }: { id?: string }) {
  const [record, setRecord] = useState<{ trainee: AdminTrainee; sessions: Array<{ id: string; scenario: string; score: number; difficulty: string; completedAt: string }> } | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    void fetch(`/api/admin/trainees/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json() as typeof record
      if (active) setRecord(data)
    }).catch(() => undefined)
    return () => { active = false }
  }, [id])
  const trainee = record?.trainee
  return <PortalShell role="admin"><main className="page-content">
    <PageHeader eyebrow="ADMINISTRATOR PORTAL / TRAINEE DETAIL" title={trainee?.name ?? 'Trainee record'} subtitle={trainee ? `${trainee.email} · Service record ${trainee.id}` : 'Loading authorized trainee data.'} action={<Link href="/admin/trainees" className="button button-outline">Back to trainees</Link>} />
    <div className="stat-grid"><StatCard label="Readiness" value={trainee ? `${trainee.readiness}%` : '—'} trend="Mean completed score" /><StatCard label="Sessions" value={trainee?.sessions ?? '—'} trend="Saved sessions" /><StatCard label="Training Hours" value="—" trend="Not recorded by the current simulator" /><StatCard label="Current Status" value={trainee?.status ?? '—'} trend={formatLastActive(trainee?.lastActive ?? null)} /></div>
    <Panel><p className="panel-label">RECENT TRAINING RESULTS</p>{record?.sessions.length ? record.sessions.map((session) => <div className="session-row" key={session.id}><span><strong>{session.scenario}</strong><small>{session.difficulty} · {formatLastActive(session.completedAt)}</small></span><b>{session.score}%</b></div>) : <p className="muted">{trainee ? 'No completed training sessions are saved.' : 'Trainee data is unavailable.'}</p>}</Panel>
  </main></PortalShell>
}

export function AdminDatabaseLiveTraining() {
  const overview = useAdminOverview()
  const sessions = overview?.activeSessions ?? []
  const soldiers = new Set(sessions.map((session) => session.soldierEmail)).size
  return <PortalShell role="admin"><main className="page-content">
    <PageHeader eyebrow="ADMINISTRATOR PORTAL / LIVE OPERATIONS" title="Live Training Monitor" subtitle="Observe training sessions registered by the simulation." />
    <div className="stat-grid"><StatCard label="Sessions Live" value={overview ? sessions.length : '—'} trend="Running sessions" /><StatCard label="Trainees Active" value={overview ? soldiers : '—'} trend="Registered accounts" /><StatCard label="Avg. Progress" value="—" trend="Progress is not streamed by the simulator" /></div>
    <Panel><div className="panel-heading"><p className="panel-label">ACTIVE SESSIONS</p><span className="live-pill">● LIVE</span></div>{sessions.length ? sessions.map((session) => <div className="session-row" key={session.id}><span><strong>{session.soldierName}</strong><small>{session.scenario} · {session.difficulty} · Started {new Date(session.startedAt).toLocaleTimeString()}</small></span><b>IN PROGRESS</b></div>) : <p className="muted">{overview ? 'No sessions are currently running.' : 'Loading active sessions.'}</p>}</Panel>
  </main></PortalShell>
}

export function AdminDatabaseAnalytics() {
  const overview = useAdminOverview()
  const trend = overview?.dailyTrend ?? []
  const points = trend.map((day, index, items) => `${items.length < 2 ? 270 : index * 540 / (items.length - 1)},${170 - Math.max(0, Math.min(100, day.score)) * 1.4}`).join(' ')
  return <PortalShell role="admin"><main className="page-content">
    <PageHeader eyebrow="ADMINISTRATOR PORTAL / INSIGHTS" title="Analytics & Reports" subtitle="Review readiness and performance from saved training sessions." />
    <div className="stat-grid"><StatCard label="Registered Soldiers" value={overview?.totalSoldiers ?? '—'} trend="Active accounts" /><StatCard label="Completed Sessions" value={overview?.completedSessions ?? '—'} trend="Stored results" /><StatCard label="Mean Score" value={overview ? `${overview.averageScore}%` : '—'} trend="Across completed sessions" /><StatCard label="Areas Below 60%" value={overview ? overview.skillScores.filter((skill) => skill.score < 60).length : '—'} trend="From session scoring metrics" tone="amber" /></div>
    <Panel><p className="panel-label">AVERAGE SKILL PERFORMANCE</p>{(overview?.skillScores ?? []).map((skill) => <div className="skill-row" key={skill.name}><span>{skill.name}</span><ProgressBar value={skill.score} tone={skill.score < 60 ? 'amber' : 'teal'} /><b>{skill.score}%</b></div>)}{overview?.skillScores.length === 0 && <p className="muted">No saved scoring metrics are available yet.</p>}</Panel>
    <div className="admin-grid"><Panel><div className="panel-heading"><p className="panel-label">MEAN SESSION SCORE / 30 DAYS</p><strong className="teal">{trend.length} days</strong></div><div className="trend-chart"><svg viewBox="0 0 540 190" role="img" aria-label="Mean completed session score by day"><path className="trend-grid" d="M0 35H540M0 95H540M0 155H540" />{points && <polyline className="trend-line" points={points} />}</svg></div></Panel><Panel><p className="panel-label">RECENT SAVED RESULTS</p>{(overview?.recentSessions ?? []).slice(0, 6).map((session) => <div className="session-row" key={session.id}><span><strong>{session.soldierName}</strong><small>{session.scenario} · {session.difficulty}</small></span><b>{session.score}%</b></div>)}{overview?.recentSessions.length === 0 && <p className="muted">No completed training results yet.</p>}</Panel></div>
  </main></PortalShell>
}

function TraineeRows({ trainees, compact = false }: { trainees: AdminTrainee[]; compact?: boolean }) {
  return <Panel className={compact ? 'table-panel' : ''}><div className="panel-heading"><p className="panel-label">{compact ? 'REGISTERED SOLDIERS' : 'TRAINEE MANAGEMENT'}</p></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Login</th><th>Readiness</th><th>Last Active</th><th>Status</th><th>Actions</th></tr></thead><tbody>{trainees.map((trainee, index) => <tr key={trainee.id}><td>{index + 1}</td><td><strong>{trainee.name}</strong></td><td>{trainee.email}</td><td><span className={trainee.readiness < 60 ? 'red' : 'teal'}>{trainee.readiness}%</span></td><td>{formatLastActive(trainee.lastActive)}</td><td><span className="status-badge">{trainee.status}</span></td><td><Link href={`/admin/trainees/${trainee.id}`} className="table-action"><Eye size={14} /> View</Link></td></tr>)}</tbody></table></div></Panel>
}
