'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Crosshair } from 'lucide-react'
import { PageHeader, Panel, PortalShell, ProgressBar, ReadinessGauge, StatCard } from '@/components/common/portal-shell'

type HistoryData = {
  stats: { total: number; averageScore: number; trainingHours: number }
  sessions: Array<{ id: string; scenario: string; score: number; completedAt: string; difficulty: string; summary?: Record<string, number | null> }>
}

export function SoldierDatabaseView({ view }: { view: 'dashboard' | 'progress' | 'digital-twin' }) {
  const [data, setData] = useState<HistoryData | null>(null)
  useEffect(() => {
    let active = true
    void fetch('/api/training/sessions', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as HistoryData
      if (active) setData(result)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
  const sessions = data?.sessions ?? []
  const skills = ['detectionAccuracy', 'classificationAccuracy', 'priorityAccuracy', 'responseAccuracy']
  const labels = ['Detection', 'Classification', 'Prioritization', 'Response']
  const values = skills.map((key, index) => {
    const scores = sessions.map((session) => session.summary?.[key]).filter((score): score is number => typeof score === 'number')
    return { label: labels[index], score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0 }
  })
  const points = sessions.slice().reverse().slice(-30).map((session, index, items) => `${items.length < 2 ? 270 : index * 540 / (items.length - 1)},${170 - Math.max(0, Math.min(100, session.score)) * 1.4}`).join(' ')

  return <PortalShell role="soldier"><main className="page-content">
    <PageHeader eyebrow={view === 'dashboard' ? 'TRAINEE PORTAL / DASHBOARD' : view === 'progress' ? 'TRAINEE PORTAL / PROGRESS' : 'TRAINEE INTELLIGENCE / DIGITAL TWIN'} title={view === 'dashboard' ? 'Training Readiness' : view === 'progress' ? 'Training Progress' : 'Trainee Digital Twin'} subtitle="Readiness and activity from your saved training results." />
    <div className="stat-grid"><StatCard label="Overall Readiness" value={data ? `${data.stats.averageScore}%` : '—'} trend="Mean completed score" /><StatCard label="Training Hours" value={data?.stats.trainingHours ?? '—'} trend="Recorded mission time" /><StatCard label="Missions Completed" value={data?.stats.total ?? '—'} trend="Saved to your account" /><StatCard label="Latest Score" value={sessions[0] ? `${sessions[0].score}%` : '—'} trend={sessions[0] ? new Date(sessions[0].completedAt).toLocaleDateString() : 'No completed missions'} /></div>
    {view === 'digital-twin' && <div className="twin-grid"><Panel className="twin-readiness"><p className="panel-label">OVERALL READINESS</p><ReadinessGauge value={data?.stats.averageScore ?? 0} /></Panel><Panel className="radar-card"><p className="panel-label">SKILL PROFICIENCY</p>{values.map((skill) => <div className="skill-row" key={skill.label}><span>{skill.label}</span><ProgressBar value={skill.score} /><b>{skill.score}%</b></div>)}</Panel><Panel><p className="panel-label">RECENT SESSIONS</p>{sessions.slice(0, 6).map((session) => <div className="session-row" key={session.id}><span><strong>{session.scenario}</strong><small>{session.difficulty}</small></span><b>{session.score}%</b></div>)}</Panel></div>}
    {view === 'progress' && <Panel className="large-chart"><p className="panel-label">SESSION SCORE TREND</p><div className="trend-chart"><svg viewBox="0 0 540 190" role="img" aria-label="Your saved session scores"><path className="trend-grid" d="M0 35H540M0 95H540M0 155H540" />{points && <polyline className="trend-line" points={points} />}</svg></div></Panel>}
    {view === 'dashboard' && <><div className="dashboard-grid"><Panel className="readiness-large"><p className="panel-label">READINESS PROFILE</p><ReadinessGauge value={data?.stats.averageScore ?? 0} /><div className="readiness-note"><strong>{sessions.length ? 'Your completed training results' : 'Complete a training session to begin'}</strong><span>Saved results stay associated with your account.</span></div></Panel><Panel className="mission-card"><div><span>CONTINUE MISSION</span><h2>Training scenarios</h2><p>Continue readiness practice in the scenario library.</p><Link href="/soldier/training" className="button">Browse Training <ArrowRight size={15} /></Link></div></Panel></div><Panel><div className="panel-heading"><p className="panel-label">RECENT SESSIONS</p><Link href="/soldier/progress">View progress <ArrowRight size={14} /></Link></div>{sessions.slice(0, 6).map((session) => <div className="session-row" key={session.id}><Crosshair size={17} /><span><strong>{session.scenario}</strong><small>{new Date(session.completedAt).toLocaleDateString()}</small></span><ProgressBar value={session.score} /><b>{session.score}%</b></div>)}</Panel></>}
  </main></PortalShell>
}
