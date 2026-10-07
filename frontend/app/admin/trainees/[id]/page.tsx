import { AdminPage } from '@/components/admin/admin-page'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AdminPage view="trainee-detail" id={id}/>} 
