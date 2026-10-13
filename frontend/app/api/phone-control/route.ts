import { randomBytes } from 'node:crypto'
import type { PhoneOrientationFrame, PhoneSceneSnapshot } from '@/lib/phone-control'

type PhoneSession = {
  touchedAt: number
  controllerId: string | null
  controllerSeenAt: number
  lastUpdateAt: number
  frame: PhoneOrientationFrame | null
  snapshot: PhoneSceneSnapshot | null
}

declare global {
  // Keep active pairings alive across development hot reloads.
  var garudaPhoneSessions: Map<string, PhoneSession> | undefined
}

const sessions = globalThis.garudaPhoneSessions ??= new Map<string, PhoneSession>()
const SESSION_TTL_MS = 10 * 60 * 1000
const CONTROLLER_LEASE_MS = 8 * 1000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function cleanSessions(now: number) {
  for (const [code, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) sessions.delete(code)
  }
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z2-9]/g, '') : ''
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function POST(request: Request) {
  const now = Date.now()
  cleanSessions(now)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }

  if (body.action === 'create') {
    if (sessions.size >= 128) return json({ error: 'Too many active pairings. Try again shortly.' }, 503)
    let code = ''
    do {
      code = [...randomBytes(12)].map((byte) => CODE_ALPHABET[byte & 31]).join('')
    } while (sessions.has(code))
    sessions.set(code, {
      touchedAt: now,
      controllerId: null,
      controllerSeenAt: 0,
      lastUpdateAt: 0,
      frame: null,
      snapshot: null,
    })
    return json({ code, expiresInSeconds: SESSION_TTL_MS / 1000 })
  }

  const code = normalizeCode(body.code)
  const session = sessions.get(code)
  if (!session) return json({ error: 'Pairing code is invalid or expired. Create a new code on the laptop.' }, 404)
  session.touchedAt = now

  if (body.action === 'connect' || body.action === 'update' || body.action === 'disconnect') {
    const controllerId = typeof body.controllerId === 'string' ? body.controllerId.slice(0, 64) : ''
    if (!controllerId) return json({ error: 'A controller identifier is required.' }, 400)

    if (body.action === 'connect') {
      const leaseIsActive = session.controllerId && now - session.controllerSeenAt < CONTROLLER_LEASE_MS
      if (leaseIsActive && session.controllerId !== controllerId) {
        return json({ error: 'Another phone tab is already connected. Stop it before pairing this tab.' }, 409)
      }
      session.controllerId = controllerId
      session.controllerSeenAt = now
      return json({ connected: true })
    }

    if (session.controllerId !== controllerId) {
      return json({ error: 'This phone controller is no longer connected. Reconnect with the pairing code.' }, 409)
    }

    if (body.action === 'disconnect') {
      session.controllerId = null
      session.controllerSeenAt = 0
      session.frame = null
      return json({ connected: false })
    }

    if (now - session.lastUpdateAt < 20) {
      return json({ error: 'Orientation updates are arriving too quickly.' }, 429)
    }

    const value = body.orientation as Partial<PhoneOrientationFrame> | undefined
    if (!value || ![value.alpha, value.beta, value.gamma, value.screenAngle].every(
      (number) => typeof number === 'number' && Number.isFinite(number),
    )) return json({ error: 'Orientation values must be finite numbers.' }, 400)

    session.controllerSeenAt = now
    session.lastUpdateAt = now
    session.frame = {
      alpha: value.alpha as number,
      beta: value.beta as number,
      gamma: value.gamma as number,
      screenAngle: value.screenAngle as number,
      updatedAt: now,
    }
    return json({ accepted: true })
  }

  if (body.action === 'close') {
    sessions.delete(code)
    return json({ closed: true })
  }

  if (body.action === 'publish-scene') {
    if (!session.controllerId || now - session.controllerSeenAt >= CONTROLLER_LEASE_MS) {
      return json({ error: 'Pair a phone before publishing the live scene.' }, 409)
    }
    const snapshot = body.snapshot as PhoneSceneSnapshot | undefined
    if (!snapshot || typeof snapshot.scenarioId !== 'string' ||
      typeof snapshot.terrain !== 'string' || typeof snapshot.time !== 'string' ||
      typeof snapshot.visibility !== 'string' || typeof snapshot.himalayanVisuals !== 'boolean' ||
      !Array.isArray(snapshot.contacts) || !Number.isFinite(snapshot.missionStartedAt) ||
      snapshot.contacts.length > 64) {
      return json({ error: 'Live scene snapshot is invalid.' }, 400)
    }
    session.snapshot = { ...snapshot, publishedAt: now }
    return json({ published: true })
  }

  return json({ error: 'Unknown action.' }, 400)
}

export async function GET(request: Request) {
  const now = Date.now()
  cleanSessions(now)
  const url = new URL(request.url)
  const code = normalizeCode(url.searchParams.get('code'))
  const session = sessions.get(code)
  if (!session) return json({ error: 'Pairing code is invalid or expired.' }, 404)

  const phoneConnected = Boolean(
    session.controllerId && now - session.controllerSeenAt < CONTROLLER_LEASE_MS,
  )
  return json({
    phoneConnected,
    stale: !session.frame || now - session.frame.updatedAt > 1500,
    frame: session.frame,
    scene: session.snapshot,
    sceneAgeMs: session.snapshot ? now - session.snapshot.publishedAt : null,
    sceneElapsedMs: session.snapshot ? now - session.snapshot.missionStartedAt : null,
    expiresInSeconds: Math.max(0, Math.ceil((SESSION_TTL_MS - (now - session.touchedAt)) / 1000)),
  })
}
