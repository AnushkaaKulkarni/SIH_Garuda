import { ScenarioBriefing } from '@/components/soldier/training-experience'

type PageProps = {
  params: Promise<{ scenario: string }>
  searchParams: Promise<{ difficulty?: string | string[]; attackMode?: string | string[] }>
}

export default async function Page({ params, searchParams }: PageProps) {
  const [{ scenario }, query] = await Promise.all([params, searchParams])
  return <ScenarioBriefing
    scenarioId={scenario}
    initialDifficulty={Array.isArray(query.difficulty) ? query.difficulty[0] : query.difficulty}
    initialAttackMode={Array.isArray(query.attackMode) ? query.attackMode[0] : query.attackMode}
  />
}
