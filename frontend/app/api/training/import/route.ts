import { ObjectId } from 'mongodb'
import { getSessionMetrics } from '@/lib/training-session'
import { getDatabase } from '@/lib/server/database'
import { jsonError, readJson, requestBodyError } from '@/lib/server/http'
import { checkSameOrigin, getAuthenticatedUser } from '@/lib/server/security'
import { validateTrainingSession } from '@/lib/server/validation'

export const runtime = 'nodejs'

// Explicit, idempotent migration endpoint for sessions previously held in localStorage.
export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return jsonError('Request origin is not allowed.', 403)
  const user = await getAuthenticatedUser()
  if (!user) return jsonError('Sign in before importing training results.', 401)
  if (user.role !== 'SOLDIER') return jsonError('Only soldiers can import training results.', 403)
  let body: unknown
  try { body = await readJson(request, 12 * 1024 * 1024) } catch (error) { return requestBodyError(error) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray((body as { sessions?: unknown }).sessions)) return jsonError('Provide a sessions array.', 400)
  const rawSessions = (body as { sessions: unknown[] }).sessions
  if (rawSessions.length > 25) return jsonError('Import at most 25 sessions at a time.', 400)
  const sessions = rawSessions.map(validateTrainingSession)
  if (sessions.some((session) => session === null)) return jsonError('One or more imported sessions are invalid.', 400)

  try {
    const { collections } = await getDatabase()
    const validSessions = sessions.filter((session) => session !== null)
    const ids = validSessions.map((session) => session.id)
    const conflicts = await collections.trainingSessions.find({ _id: { $in: ids }, ownerId: { $ne: user._id } }, { projection: { _id: 1 } }).limit(1).toArray()
    if (conflicts.length) return jsonError('One or more imported sessions cannot be associated with this account.', 409)
    const operations = validSessions.map((session) => ({
      updateOne: {
        filter: { _id: session.id, ownerId: user._id },
        update: {
          $setOnInsert: {
            ownerId: user._id,
            status: 'COMPLETED',
            scenario: session.scenario,
            difficulty: session.difficulty,
            attackMode: session.attackMode ?? null,
            startedAt: new Date(session.startedAt),
            completedAt: new Date(session.completedAt),
            score: session.score,
            scoreVersion: session.scoreRule,
            summary: getSessionMetrics(session),
            data: session,
            createdAt: new Date(),
          },
          $set: { importedAt: new Date(), updatedAt: new Date() },
        },
        upsert: true,
      },
    }))
    if (operations.length) await collections.trainingSessions.bulkWrite(operations, { ordered: true })
    return Response.json({ imported: operations.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return jsonError('One or more imported sessions cannot be associated with this account.', 409)
    return jsonError('Training result import is temporarily unavailable.', 503)
  }
}
