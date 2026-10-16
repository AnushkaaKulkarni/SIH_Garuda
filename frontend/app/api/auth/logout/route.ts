import { checkSameOrigin, clearAuthCookie, revokeCurrentSession } from '@/lib/server/security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 })
  try {
    await revokeCurrentSession()
    const response = Response.json({ loggedOut: true })
    clearAuthCookie(response)
    return response
  } catch {
    return Response.json({ error: 'Logout is temporarily unavailable.' }, { status: 503 })
  }
}
