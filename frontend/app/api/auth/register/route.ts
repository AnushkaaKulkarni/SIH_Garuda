import { getDatabase } from '@/lib/server/database'
import { hashPassword } from '@/lib/server/passwords'
import { createAuthToken, checkSameOrigin, setAuthCookie } from '@/lib/server/security'
import { validateRegistrationInput } from '@/lib/server/validation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > 8192) return Response.json({ error: 'Request is too large.' }, { status: 413 })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
  const input = validateRegistrationInput(body)
  if (!input) return Response.json({ error: 'Enter a valid name, email, and password of at least 10 characters.' }, { status: 400 })

  try {
    const { collections } = await getDatabase()
    const user = { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: 'SOLDIER' as const, status: 'ACTIVE' as const, createdAt: new Date(), updatedAt: new Date() }
    const inserted = await collections.users.insertOne(user)
    const { token, expiresIn } = await createAuthToken(inserted.insertedId, user.role)
    const response = Response.json({ user: { id: inserted.insertedId.toHexString(), name: user.name, email: user.email, role: user.role } }, { status: 201 })
    setAuthCookie(response, token, expiresIn)
    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return Response.json({ error: 'An account with this email already exists.' }, { status: 409 })
    console.error('Account registration failed.')
    return Response.json({ error: 'Registration is temporarily unavailable.' }, { status: 503 })
  }
}
