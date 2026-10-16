import { getDatabase } from '@/lib/server/database'
import { jsonError } from '@/lib/server/http'
import { getAuthenticatedUser } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError('Sign in to view this training result.', 401)
  if (user.role !== 'SOLDIER') return jsonError('This endpoint is for soldier training history.', 403)
  const { id } = await context.params
  if (!/^[a-zA-Z0-9_-]{4,128}$/.test(id)) return jsonError('Training result was not found.', 404)
  try {
    const { collections } = await getDatabase()
    const session = await collections.trainingSessions.findOne({ _id: id, ownerId: user._id }, { projection: { data: 1 } })
    if (!session?.data) return jsonError('Training result was not found.', 404)
    return Response.json({ session: session.data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Training result is temporarily unavailable.', 503)
  }
}
