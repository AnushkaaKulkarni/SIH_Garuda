import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env')

// Local private service configuration lives beside the Next.js app in backend/.env.
// Production deployments should inject the same names through the host environment.
if (process.env.NODE_ENV !== 'production') {
  loadEnvConfig(resolve(process.cwd(), '../backend'))
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Server configuration is missing ${name}.`)
  return value
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}
