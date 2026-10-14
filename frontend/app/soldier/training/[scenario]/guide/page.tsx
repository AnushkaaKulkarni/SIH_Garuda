import { VRTrainingBriefing } from '@/components/soldier/training-vr-briefing'

type PageProps = {
  params: Promise<{ scenario: string }>
  searchParams: Promise<{ difficulty?: string | string[]; attackMode?: string | string[] }>
}

export default async function Page({ params, searchParams }: PageProps) {
  const [{ scenario }, query] = await Promise.all([params, searchParams])
  return <VRTrainingBriefing
    scenarioId={scenario}
    requestedDifficulty={Array.isArray(query.difficulty) ? query.difficulty[0] : query.difficulty}
    requestedAttackMode={Array.isArray(query.attackMode) ? query.attackMode[0] : query.attackMode}
  />
}
