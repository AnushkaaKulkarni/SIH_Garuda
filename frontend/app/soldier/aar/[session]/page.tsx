import { AARExperience } from '@/components/soldier/training-experience'
export default async function Page({params}:{params:Promise<{session:string}>}){const {session}=await params;return <AARExperience session={session}/>}
