import { createHash, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { ObjectId, type WithId } from 'mongodb'
import { getDatabase, type UserDocument, type UserRole } from './database.ts'
import { requiredEnv } from './env.ts'

export const AUTH_COOKIE = 'garuda_session'
const ISSUER = 'garuda-training'

export type AuthenticatedUser = Pick<WithId<UserDocument>, '_id' | 'name' | 'email' | 'role' | 'status'>

function secretBytes() {
  const secret = requiredEnv('JWT_SECRET')
  const bytes = new TextEncoder().encode(secret)
  if (bytes.byteLength < 32) throw new Error('Server configuration JWT_SECRET must contain at least 32 bytes.')
  return bytes
}

function sessionSeconds() {
  const value = process.env.JWT_EXPIRY?.trim() || '7d'
  const match = /^(\d+)(s|m|h|d)$/.exec(value)
  if (!match) throw new Error('Server configuration JWT_EXPIRY must use s, m, h, or d units.')
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd']
  const seconds = Number(match[1]) * multiplier
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 30 * 86400) {
    throw new Error('Server configuration JWT_EXPIRY must be between 1 minute and 30 days.')
  }
  return seconds
}

export async function createAuthToken(userId: ObjectId, role: UserRole) {
  const now = new Date()
  const expiresIn = sessionSeconds()
  const sessionId = randomUUID()
  const { collections } = await getDatabase()
  await collections.authSessions.insertOne({
    _id: sessionId,
    userId,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    revokedAt: null,
    createdAt: now,
  })
  const token = await new SignJWT({ role, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(userId.toHexString())
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + expiresIn)
    .sign(secretBytes())
  return { token, expiresIn }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secretBytes(), { issuer: ISSUER, algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || !ObjectId.isValid(payload.sub) ||
      typeof payload.sid !== 'string' || (payload.role !== 'SOLDIER' && payload.role !== 'ADMIN')) return null
    const userId = new ObjectId(payload.sub)
    const { collections } = await getDatabase()
    const [session, user] = await Promise.all([
      collections.authSessions.findOne({
        _id: payload.sid,
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
      collections.users.findOne({ _id: userId, status: 'ACTIVE' }),
    ])
    if (!session || !user || user.role !== payload.role) return null
    return { _id: user._id, name: user.name, email: user.email, role: user.role, status: user.status }
  } catch {
    return null
  }
}

export async function revokeCurrentSession() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  if (!token) return
  try {
    const { payload } = await jwtVerify(token, secretBytes(), { issuer: ISSUER, algorithms: ['HS256'] })
    if (typeof payload.sid !== 'string') return
    const { collections } = await getDatabase()
    await collections.authSessions.updateOne({ _id: payload.sid, revokedAt: null }, { $set: { revokedAt: new Date() } })
  } catch {
    // An invalid or expired cookie has no live server session to revoke.
  }
}

export function setAuthCookie(response: Response, token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  )
}

export function clearAuthCookie(response: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.headers.append('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

export function checkSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function allowAttempt(request: Request, identity: string, maxAttempts = 8) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000))
  const key = createHash('sha256').update(`${identity}\0${forwardedFor}\0${bucket}`).digest('hex')
  const expiresAt = new Date((bucket + 2) * 15 * 60 * 1000)
  const { collections } = await getDatabase()
  await collections.rateLimits.updateOne(
    { _id: key },
    { $setOnInsert: { expiresAt }, $inc: { count: 1 } },
    { upsert: true },
  )
  const count = (await collections.rateLimits.findOne({ _id: key }))?.count
  return typeof count === 'number' && count <= maxAttempts
}
