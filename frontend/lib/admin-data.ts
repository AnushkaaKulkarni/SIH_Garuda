'use client'

import { useEffect, useState } from 'react'

export type AdminTrainee = {
  id: string
  name: string
  email: string
  unit: string
  readiness: number
  sessions: number
  status: string
  lastActive: string | null
}

export type AdminOverview = {
  totalSoldiers: number
  activeNow: number
  completedSessions: number
  averageScore: number
  trainees: AdminTrainee[]
  recentSessions: Array<{ id: string; scenario: string; difficulty: string; score: number; completedAt: string; soldierName: string; soldierEmail: string }>
  activeSessions: Array<{ id: string; scenario: string; difficulty: string; startedAt: string; soldierName: string; soldierEmail: string }>
  dailyTrend: Array<{ date: string; score: number; sessions: number }>
  skillScores: Array<{ name: string; score: number }>
}

export function useAdminOverview() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  useEffect(() => {
    let active = true
    void fetch('/api/admin/overview', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json() as AdminOverview
      if (active) setOverview(data)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
  return overview
}

export function formatLastActive(value: string | null) {
  if (!value) return 'No completed sessions'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '—'
}
