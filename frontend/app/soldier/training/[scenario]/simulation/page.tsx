import { LiveSimulation } from '@/components/soldier/training-experience'

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<{ scenario: string }>
	searchParams: Promise<{ mode?: string | string[] }>
}) {
	const [{ scenario }, query] = await Promise.all([params, searchParams])
	const mode = scenario === 'himalayan-shield' && query.mode === 'vr' ? 'vr' : 'desktop'

	return <LiveSimulation scenarioId={scenario} mode={mode} />
}
