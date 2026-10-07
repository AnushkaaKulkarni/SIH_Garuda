import { ScenarioBriefing } from '@/components/soldier/training-experience'
export default async function Page({params}:{params:Promise<{scenario:string}>}){const {scenario}=await params;return <ScenarioBriefing scenarioId={scenario}/>}
