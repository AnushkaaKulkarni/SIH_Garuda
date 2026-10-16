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
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const activeSince = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const [totalSoldiers, completedSessions, activeNow, scoreSummary, trainees, recentSessions, activeSessions, dailyTrend, skillScores] = await Promise.all([
      collections.users.countDocuments({ role: 'SOLDIER', status: 'ACTIVE' }),
      collections.trainingSessions.countDocuments({ status: 'COMPLETED' }),
      collections.trainingSessions.countDocuments({ status: 'IN_PROGRESS', startedAt: { $gte: activeSince } }),
      collections.trainingSessions.aggregate<{ averageScore: number | null; activeNow: number }>([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, averageScore: { $avg: '$score' } } },
      ]).next(),
      collections.users.aggregate([
        { $match: { role: 'SOLDIER' } },
        { $lookup: { from: 'trainingSessions', localField: '_id', foreignField: 'ownerId', as: 'trainingSessions' } },
        { $project: {
          name: 1,
          email: 1,
          status: 1,
          createdAt: 1,
          sessions: { $size: '$trainingSessions' },
          readiness: { $round: [{ $ifNull: [{ $avg: '$trainingSessions.score' }, 0] }, 0] },
          lastActive: { $max: '$trainingSessions.completedAt' },
        } },
        { $sort: { createdAt: -1 } },
        { $limit: 250 },
      ]).toArray(),
      collections.trainingSessions.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $sort: { completedAt: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: 'ownerId', foreignField: '_id', as: 'owner' } },
        { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, scenario: 1, difficulty: 1, score: 1, completedAt: 1, soldierName: '$owner.name', soldierEmail: '$owner.email' } },
      ]).toArray(),
      collections.trainingSessions.aggregate([
        { $match: { status: 'IN_PROGRESS', startedAt: { $gte: activeSince } } },
        { $sort: { startedAt: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'users', localField: 'ownerId', foreignField: '_id', as: 'owner' } },
        { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, scenario: 1, difficulty: 1, startedAt: 1, soldierName: '$owner.name', soldierEmail: '$owner.email' } },
      ]).toArray(),
      collections.trainingSessions.aggregate([
        { $match: { status: 'COMPLETED', completedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, score: { $avg: '$score' }, sessions: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      collections.trainingSessions.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: {
          _id: null,
          detection: { $avg: '$summary.detectionAccuracy' },
          classification: { $avg: '$summary.classificationAccuracy' },
          priority: { $avg: '$summary.priorityAccuracy' },
          response: { $avg: '$summary.responseAccuracy' },
        } },
      ]).next(),
    ])
    return Response.json({
      totalSoldiers,
      activeNow,
      completedSessions,
      averageScore: Math.round(scoreSummary?.averageScore ?? 0),
      trainees: trainees.map((trainee) => ({
        id: String(trainee._id),
        name: trainee.name,
        email: trainee.email,
        unit: 'Unassigned',
        readiness: trainee.readiness,
        sessions: trainee.sessions,
        status: trainee.status === 'ACTIVE' ? (trainee.sessions ? 'Training' : 'New') : 'Disabled',
        lastActive: trainee.lastActive ? new Date(trainee.lastActive).toISOString() : null,
      })),
      recentSessions: recentSessions.map((session) => ({
        id: session._id,
        scenario: session.scenario,
        difficulty: session.difficulty,
        score: session.score,
        completedAt: session.completedAt,
        soldierName: session.soldierName ?? 'Unknown trainee',
        soldierEmail: session.soldierEmail ?? '',
      })),
      activeSessions: activeSessions.map((session) => ({
        id: session._id,
        scenario: session.scenario,
        difficulty: session.difficulty,
        startedAt: session.startedAt,
        soldierName: session.soldierName ?? 'Unknown trainee',
        soldierEmail: session.soldierEmail ?? '',
      })),
      dailyTrend: dailyTrend.map((day) => ({ date: day._id, score: Math.round(day.score), sessions: day.sessions })),
      skillScores: [
        { name: 'Detection', score: Math.round(skillScores?.detection ?? 0) },
        { name: 'Classification', score: Math.round(skillScores?.classification ?? 0) },
        { name: 'Prioritization', score: Math.round(skillScores?.priority ?? 0) },
        { name: 'Response', score: Math.round(skillScores?.response ?? 0) },
      ],
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Administrator analytics are temporarily unavailable.', 503)
  }
}
