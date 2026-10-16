import { ObjectId } from 'mongodb'
import { getDatabase } from '@/lib/server/database'
import { jsonError } from '@/lib/server/http'
import { getAuthenticatedUser } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedUser()
  if (!admin) return jsonError('Administrator sign-in is required.', 401)
  if (admin.role !== 'ADMIN') return jsonError('Administrator access is required.', 403)
  const { id } = await context.params
  if (!ObjectId.isValid(id)) return jsonError('Trainee was not found.', 404)
  try {
    const { collections } = await getDatabase()
    const trainee = await collections.users.findOne({ _id: new ObjectId(id), role: 'SOLDIER' }, { projection: { passwordHash: 0 } })
    if (!trainee) return jsonError('Trainee was not found.', 404)
    const sessions = await collections.trainingSessions.find(
      { ownerId: trainee._id, status: 'COMPLETED' },
      { projection: { _id: 1, scenario: 1, difficulty: 1, attackMode: 1, score: 1, completedAt: 1 } },
    ).sort({ completedAt: -1 }).limit(50).toArray()
    return Response.json({
      trainee: {
        id: trainee._id.toHexString(), name: trainee.name, email: trainee.email, role: trainee.role,
        status: trainee.status === 'ACTIVE' ? (sessions.length ? 'Training' : 'New') : 'Disabled',
        sessions: sessions.length,
        readiness: sessions.length ? Math.round(sessions.reduce((total, session) => total + (session.score as number), 0) / sessions.length) : 0,
        lastActive: sessions[0]?.completedAt ? new Date(sessions[0].completedAt).toISOString() : null,
      },
      sessions: sessions.map((session) => ({ id: session._id, scenario: session.scenario, difficulty: session.difficulty, attackMode: session.attackMode, score: session.score, completedAt: session.completedAt })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Trainee data is temporarily unavailable.', 503)
  }
}
