import { ObjectId } from 'mongodb'
import { getSessionMetrics } from '@/lib/training-session'
import { getDatabase } from '@/lib/server/database'
import { jsonError, readJson, requestBodyError } from '@/lib/server/http'
import { checkSameOrigin, getAuthenticatedUser } from '@/lib/server/security'
import { validateTrainingSession, validateTrainingSessionStart } from '@/lib/server/validation'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return jsonError('Sign in to view training history.', 401)
    if (user.role !== 'SOLDIER') return jsonError('This endpoint is for soldier training history.', 403)
    const { collections } = await getDatabase()
    const [sessions, stats] = await Promise.all([collections.trainingSessions.find(
      { ownerId: user._id },
      { projection: { _id: 1, scenario: 1, score: 1, completedAt: 1, difficulty: 1, attackMode: 1, status: 1, startedAt: 1, 'data.missionDurationMs': 1, summary: 1 } },
    ).sort({ completedAt: -1 }).limit(250).toArray(), collections.trainingSessions.aggregate([
      { $match: { ownerId: user._id, status: 'COMPLETED' } },
      { $group: { _id: null, count: { $sum: 1 }, averageScore: { $avg: '$score' }, durationMs: { $sum: '$data.missionDurationMs' } } },
    ]).next()])
    return Response.json({ stats: { total: stats?.count ?? 0, averageScore: Math.round(stats?.averageScore ?? 0), trainingHours: Math.round((stats?.durationMs ?? 0) / 360000) / 10 }, sessions: sessions.map((session) => ({
      id: session._id,
      scenario: session.scenario,
      score: session.score,
      completedAt: session.completedAt,
      difficulty: session.difficulty,
      ...(session.attackMode ? { attackMode: session.attackMode } : {}),
      ...(typeof session.data?.missionDurationMs === 'number' ? { missionDurationMs: session.data.missionDurationMs } : {}),
      ...(session.summary ? { summary: session.summary } : {}),
    })) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Training history is temporarily unavailable.', 503)
  }
}

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return jsonError('Request origin is not allowed.', 403)
  const user = await getAuthenticatedUser()
  if (!user) return jsonError('Sign in before saving training results.', 401)
  if (user.role !== 'SOLDIER') return jsonError('Only soldiers can submit training results.', 403)

  let body: unknown
  try { body = await readJson(request, 3 * 1024 * 1024) } catch (error) { return requestBodyError(error) }
  const start = validateTrainingSessionStart(body)
  if (start) {
    try {
      const { collections } = await getDatabase()
      const existing = await collections.trainingSessions.findOne({ _id: start.id }, { projection: { ownerId: 1 } })
      if (existing) return jsonError(new ObjectId(existing.ownerId).equals(user._id) ? 'This session has already been started.' : 'Training result was not found.', existing.ownerId && new ObjectId(existing.ownerId).equals(user._id) ? 409 : 404)
      const startedAt = new Date(start.startedAt)
      await collections.trainingSessions.insertOne({
        _id: start.id,
        ownerId: user._id,
        status: 'IN_PROGRESS',
        scenario: start.scenario,
        difficulty: start.difficulty,
        attackMode: start.attackMode ?? null,
        mode: start.mode ?? 'desktop',
        seed: start.seed,
        startedAt,
        completedAt: startedAt,
        score: 0,
        scoreVersion: 'event-performance-v4',
        summary: { progress: 0 },
        data: { seed: start.seed, mode: start.mode ?? 'desktop' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      return Response.json({ saved: true, id: start.id, status: start.status }, { status: 201 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return jsonError('This session could not be started.', 409)
      return jsonError('Training session could not be started on the server.', 503)
    }
  }
  const session = validateTrainingSession(body)
  if (!session) return jsonError('Training result is invalid.', 400)
  try {
    const { collections } = await getDatabase()
    const existing = await collections.trainingSessions.findOne({ _id: session.id }, { projection: { ownerId: 1 } })
    if (existing && !new ObjectId(existing.ownerId).equals(user._id)) return jsonError('Training result was not found.', 404)
    const metrics = getSessionMetrics(session)
    const result = await collections.trainingSessions.updateOne(
      { _id: session.id, ownerId: user._id },
      {
        $set: {
          ownerId: user._id,
          status: 'COMPLETED',
          scenario: session.scenario,
          difficulty: session.difficulty,
          attackMode: session.attackMode ?? null,
          startedAt: new Date(session.startedAt),
          completedAt: new Date(session.completedAt),
          score: session.score,
          scoreVersion: session.scoreRule,
          summary: metrics,
          data: session,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    )
    return Response.json({ saved: true, id: session.id, updated: result.modifiedCount > 0 }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return jsonError('Training result was not found.', 404)
    return jsonError('Training result could not be saved.', 503)
  }
}
