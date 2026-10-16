import { getAuthenticatedUser } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return Response.json({ user: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    return Response.json({ user: { id: user._id.toHexString(), name: user.name, email: user.email, role: user.role } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Authentication service is temporarily unavailable.' }, { status: 503 })
  }
}
