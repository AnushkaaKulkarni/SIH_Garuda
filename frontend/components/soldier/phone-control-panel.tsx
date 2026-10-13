'use client'

import { useEffect, useState } from 'react'
import { getLatestPhoneFrame, setLatestPhoneFrame } from '@/lib/phone-control'
import styles from './training-simulation-scene.module.css'

type PairResponse = {
  phoneConnected?: boolean
  stale?: boolean
  frame?: { alpha: number; beta: number; gamma: number; screenAngle: number; updatedAt: number } | null
  error?: string
}

export function PhoneControlPanel({
  onControlChange,
  onPairingCodeChange,
}: {
  onControlChange: (enabled: boolean, recenterKey: number) => void
  onPairingCodeChange?: (code: string | null) => void
}) {
  const [pairingCode, setPairingCode] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [frameStale, setFrameStale] = useState(true)
  const [controlEnabled, setControlEnabled] = useState(false)
  const [recenterKey, setRecenterKey] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pairingCode) return
    let stopped = false
    let busy = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      if (busy || stopped) return
      busy = true
      try {
        const response = await fetch(`/api/phone-control?code=${encodeURIComponent(pairingCode)}`, { cache: 'no-store' })
        const data = await response.json() as PairResponse
        if (!response.ok) throw new Error(data.error || 'Could not read phone connection status.')
        if (stopped) return
        setPhoneConnected(Boolean(data.phoneConnected))
        setFrameStale(Boolean(data.stale))
        setError('')
        setLatestPhoneFrame(data.frame && Date.now() - data.frame.updatedAt < 1500 ? data.frame : null)
      } catch (reason) {
        if (!stopped) {
          setPhoneConnected(false)
          setFrameStale(true)
          setLatestPhoneFrame(null)
          setError(reason instanceof Error ? reason.message : 'Phone connection was interrupted.')
        }
      } finally {
        busy = false
        if (!stopped) timer = setTimeout(poll, controlEnabled ? 34 : 250)
      }
    }

    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [pairingCode, controlEnabled])

  useEffect(() => {
    if (!pairingCode) return
    return () => {
      void fetch('/api/phone-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', code: pairingCode }),
        keepalive: true,
      }).catch(() => undefined)
    }
  }, [pairingCode])

  const createPairing = async () => {
    setError('')
    try {
      const response = await fetch('/api/phone-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await response.json() as { code?: string; error?: string }
      if (!response.ok || !data.code) throw new Error(data.error || 'Could not create a phone pairing.')
      setLatestPhoneFrame(null)
      setPhoneConnected(false)
      setFrameStale(true)
      setPairingCode(data.code)
      onPairingCodeChange?.(data.code)
      setControlEnabled(false)
      onControlChange(false, recenterKey)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a phone pairing.')
    }
  }

  const toggleControl = () => {
    if (!controlEnabled && (!phoneConnected || frameStale || !getLatestPhoneFrame())) return
    const nextEnabled = !controlEnabled
    setControlEnabled(nextEnabled)
    onControlChange(nextEnabled, recenterKey)
  }

  const recenter = () => {
    if (!controlEnabled || !getLatestPhoneFrame()) return
    const nextKey = recenterKey + 1
    setRecenterKey(nextKey)
    onControlChange(true, nextKey)
  }

  const disconnect = async () => {
    const code = pairingCode
    setControlEnabled(false)
    onControlChange(false, recenterKey)
    setLatestPhoneFrame(null)
    setPairingCode('')
    onPairingCodeChange?.(null)
    setPhoneConnected(false)
    setFrameStale(true)
    if (code) {
      void fetch('/api/phone-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close', code }),
        }).catch(() => {
          // Closing the local scene control still takes effect if the network is down.
        })
    }
  }

  const phoneUrl = pairingCode && typeof window !== 'undefined'
    ? `${window.location.origin}/phone-test?pair=${pairingCode}`
    : ''

  return (
    <section className={styles.phoneControlPanel} aria-label="Phone camera control">
      <div className={styles.phoneControlHeading}>
        <div>
          <p className="panel-label">REMOTE CAMERA / PHONE LINK</p>
          <strong>{controlEnabled ? 'PHONE CONTROL ACTIVE' : phoneConnected ? 'PHONE CONNECTED' : 'PHONE NOT CONNECTED'}</strong>
        </div>
        {!pairingCode ? (
          <button type="button" className="button button-outline" onClick={createPairing}>Pair phone</button>
        ) : (
          <button type="button" className="button button-outline" onClick={disconnect}>Disconnect</button>
        )}
      </div>
      {pairingCode && (
        <div className={styles.pairingDetails}>
          <span>Enter this one-time code on the phone:</span>
          <strong className={styles.pairingCode}>{pairingCode}</strong>
          <small>Phone page: {phoneUrl}</small>
        </div>
      )}
      <p className={styles.phoneControlStatus} aria-live="polite">
        {!pairingCode
          ? 'Create a temporary pairing code, then enter it on the phone.'
          : !phoneConnected
            ? 'Waiting for the phone to connect and send real orientation data.'
            : frameStale
              ? 'Phone is paired, but its orientation data is stale. Check the phone controller.'
              : controlEnabled
                ? 'Mouse orbit is paused. The camera keeps its position and follows the phone view.'
                : 'Phone data is live. Enable Phone Control to calibrate the current phone pose.'}
      </p>
      {error && <p className={styles.phoneControlError} role="alert">{error}</p>}
      {pairingCode && (
        <div className={styles.phoneControlActions}>
          <button type="button" className="button" disabled={controlEnabled ? false : !phoneConnected || frameStale} onClick={toggleControl}>
            {controlEnabled ? 'Disable Phone Control' : 'Enable Phone Control'}
          </button>
          <button type="button" className="button button-outline" disabled={!controlEnabled || frameStale} onClick={recenter}>
            Recenter / Reset View
          </button>
        </div>
      )}
      <span className={styles.phoneSecurityNote}>Temporary dev pairing; keep the code private. Link expires after inactivity.</span>
    </section>
  )
}
