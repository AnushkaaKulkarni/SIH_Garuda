import { getDatabase } from '@/lib/server/database'
import { verifyPassword } from '@/lib/server/passwords'
import { allowAttempt, checkSameOrigin, createAuthToken, setAuthCookie } from '@/lib/server/security'
import { validateLoginInput } from '@/lib/server/validation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > 8192) return Response.json({ error: 'Request is too large.' }, { status: 413 })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
  const input = validateLoginInput(body)
  if (!input) return Response.json({ error: 'Enter a valid email and password.' }, { status: 400 })

  try {
    if (!await allowAttempt(request, input.email)) return Response.json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { status: 429 })
    const { collections } = await getDatabase()
    const user = await collections.users.findOne({ email: input.email })
    const validPassword = user ? await verifyPassword(input.password, user.passwordHash) : false
    const expectedRole = input.expectedRole === 'ADMIN' || input.expectedRole === 'admin' ? 'ADMIN' : input.expectedRole ? 'SOLDIER' : null
    if (!user || !validPassword || user.status !== 'ACTIVE' || (expectedRole && user.role !== expectedRole)) return Response.json({ error: 'Email, password, or account type is incorrect.' }, { status: 401 })
    const { token, expiresIn } = await createAuthToken(user._id, user.role)
    const response = Response.json({ user: { id: user._id.toHexString(), name: user.name, email: user.email, role: user.role } })
    setAuthCookie(response, token, expiresIn)
    return response
  } catch {
    console.error('Sign-in request failed.')
    return Response.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 })
  }
}
