'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { IMAGE_HERO, type Role } from '@/lib/types'
import { Logo } from '@/components/common/portal-shell'

type AuthResponse = { user?: { role?: 'SOLDIER' | 'ADMIN' }; error?: string }

export function AuthForm({ mode = 'login' }: { mode?: 'login' | 'signup' }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>('trainee')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const signup = mode === 'signup'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    if (signup && password !== String(form.get('confirmPassword') || '')) {
      setError('Passwords do not match.')
      return
    }
    if (signup && role === 'admin') {
      setError('Administrator accounts must be provisioned by an authorized administrator.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(signup ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signup
          ? { name: form.get('name'), email, password, role: 'SOLDIER' }
          : { email, password, role: role === 'admin' ? 'ADMIN' : 'SOLDIER' }),
      })
      const result = await response.json() as AuthResponse
      if (!response.ok || !result.user?.role) {
        setError(result.error || 'The account could not be authenticated.')
        return
      }
      router.replace(result.user.role === 'ADMIN' ? '/admin/dashboard' : '/soldier/dashboard')
      router.refresh()
    } catch {
      setError('The authentication service could not be reached. Try again shortly.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-art" style={{ backgroundImage: `url(${IMAGE_HERO})` }}>
        <div className="hero-overlay" />
        <div><Logo /><p className="auth-motto">DISCIPLINE<br />TECHNOLOGY<br />READINESS</p><span>Secure access to the adaptive training network.</span></div>
      </div>
      <div className="auth-content">
        <Link href="/" className="back-link">← Return to public site</Link>
        <form className="auth-form" onSubmit={submit}>
          <p className="eyebrow"><LockKeyhole size={14} /> SECURE TRAINING PORTAL</p>
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p>{signup ? 'Join the GARUDA adaptive training platform.' : 'Continue your readiness journey.'}</p>
          <div className="role-switch">
            <button type="button" className={role === 'trainee' ? 'active' : ''} onClick={() => setRole('trainee')}>Soldier / Trainee</button>
            <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Administrator</button>
          </div>
          {signup && <label>Full Name<input name="name" required placeholder="Arjun Singh" autoComplete="name" /></label>}
          <label>Service ID / Email<input name="email" required type="email" placeholder="service.id@garuda.in" autoComplete="email" /></label>
          {signup && <label>Confirm Password<input name="confirmPassword" required type="password" placeholder="••••••••••" autoComplete="new-password" /></label>}
          <label>Password<input name="password" required type="password" placeholder="••••••••••" autoComplete={signup ? 'new-password' : 'current-password'} /></label>
          {!signup && <div className="form-row"><label className="check"><input type="checkbox" /> Remember me</label><button type="button" className="text-button">Forgot password?</button></div>}
          {error && <p role="alert" style={{ color: '#ee5a51' }}>{error}</p>}
          <button className="button wide" disabled={submitting}>{submitting ? 'Please wait…' : signup ? 'Create Account' : 'Login'} <ArrowRight size={17} /></button>
          <div className="alt-login"><span>OR CONTINUE WITH</span><div><button type="button">Aadhaar</button><button type="button">Smart Card</button><button type="button">SSO</button></div></div>
          <p className="auth-switch">{signup ? 'Already have an account?' : 'New user?'} <Link href={signup ? '/login' : '/signup'}>{signup ? 'Login' : 'Create an account'}</Link></p>
        </form>
      </div>
    </main>
  )
}
