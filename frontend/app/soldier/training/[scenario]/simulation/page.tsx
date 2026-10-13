import { LiveSimulation } from '@/components/soldier/training-experience'
import { scenarios } from '@/lib/types'
import { resolveMissionConfiguration } from '@/lib/training-session'

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<{ scenario: string }>
	searchParams: Promise<{ mode?: string | string[]; difficulty?: string | string[]; attackMode?: string | string[] }>
}) {
	const [{ scenario }, query] = await Promise.all([params, searchParams])
	const mode = query.mode === 'vr' ? 'vr' : 'desktop'
	const scenarioConfig = scenarios.find((item) => item.id === scenario) ?? scenarios[0]
	const config = resolveMissionConfiguration(scenarioConfig, {
		difficulty: Array.isArray(query.difficulty) ? query.difficulty[0] : query.difficulty,
		attackMode: Array.isArray(query.attackMode) ? query.attackMode[0] : query.attackMode,
	})

	return <LiveSimulation scenarioId={scenarioConfig.id} mode={mode} initialDifficulty={config.difficulty} attackMode={config.attackMode} />
}
