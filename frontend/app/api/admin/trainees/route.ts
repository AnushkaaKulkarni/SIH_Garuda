import { getDatabase } from '@/lib/server/database'
import { jsonError } from '@/lib/server/http'
import { getAuthenticatedUser } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return jsonError('Administrator sign-in is required.', 401)
  if (user.role !== 'ADMIN') return jsonError('Administrator access is required.', 403)
  try {
    const { collections } = await getDatabase()
    const trainees = await collections.users.aggregate([
      { $match: { role: 'SOLDIER' } },
      { $lookup: { from: 'trainingSessions', localField: '_id', foreignField: 'ownerId', as: 'trainingSessions' } },
      { $project: {
        name: 1, email: 1, status: 1, createdAt: 1,
        sessions: { $size: '$trainingSessions' },
        readiness: { $round: [{ $ifNull: [{ $avg: '$trainingSessions.score' }, 0] }, 0] },
        lastActive: { $max: '$trainingSessions.completedAt' },
      } },
      { $sort: { createdAt: -1 } },
      { $limit: 250 },
    ]).toArray()
    return Response.json({ trainees: trainees.map((trainee) => ({
      id: String(trainee._id), name: trainee.name, email: trainee.email, unit: 'Unassigned',
      readiness: trainee.readiness, sessions: trainee.sessions,
      status: trainee.status === 'ACTIVE' ? (trainee.sessions ? 'Training' : 'New') : 'Disabled',
      lastActive: trainee.lastActive ? new Date(trainee.lastActive).toISOString() : null,
    })) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Trainee data is temporarily unavailable.', 503)
  }
}
