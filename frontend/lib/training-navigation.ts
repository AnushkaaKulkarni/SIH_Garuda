import type { AttackMode, TrainingDifficulty } from './training-session'

export function getTrainingNavigation(scenarioId: string, difficulty: TrainingDifficulty, attackMode: AttackMode) {
  const config = new URLSearchParams({ difficulty, attackMode }).toString()
  const base = `/soldier/training/${encodeURIComponent(scenarioId)}`
  return {
    briefingHref: `${base}/briefing?${config}`,
    guideHref: `${base}/guide?${config}`,
    desktopSimulationHref: `${base}/simulation?${config}`,
    vrSimulationHref: `${base}/simulation?${config}&mode=vr`,
  }
}
