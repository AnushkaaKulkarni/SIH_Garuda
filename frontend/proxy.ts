import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { jwtVerify } from 'jose'
import { NextResponse, type NextRequest } from 'next/server'

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env')
if (process.env.NODE_ENV !== 'production') loadEnvConfig(resolve(process.cwd(), '../backend'))

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('garuda_session')?.value
  let role: unknown = null
  if (token && process.env.JWT_SECRET) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
        issuer: 'garuda-training',
        algorithms: ['HS256'],
      })
      role = payload.role
    } catch {
      role = null
    }
  }

  const isAdminPage = request.nextUrl.pathname.startsWith('/admin')
  if (role !== (isAdminPage ? 'ADMIN' : 'SOLDIER')) {
    const login = new URL('/login', request.url)
    login.searchParams.set('returnTo', request.nextUrl.pathname)
    const response = NextResponse.redirect(login)
    response.cookies.delete('garuda_session')
    return response
  }
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*', '/soldier/:path*'] }
