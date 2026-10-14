'use client'

import dynamic from 'next/dynamic'
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { setLatestPhoneFrame, type PhoneSceneSnapshot } from '@/lib/phone-control'
import styles from './phone-test.module.css'

const TrainingSimulationScene = dynamic(
  () => import('@/components/soldier/training-simulation-scene').then((module) => module.TrainingSimulationScene),
  { ssr: false, loading: () => <p className={styles.sceneLoading}>Loading live GARUDA scene…</p> },
)

class PhoneSceneErrorBoundary extends Component<{
  children: ReactNode
  onError: () => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('[phone-viewer] scene renderer failed', error)
    this.props.onError()
  }

  render() {
    return this.state.failed
      ? <p className={styles.sceneLoading}>GARUDA scene renderer error</p>
      : this.props.children
  }
}

type SensorValues = {
  alpha: number | null
  beta: number | null
  gamma: number | null
}

type MotionValues = {
  alpha: number | null
  beta: number | null
  gamma: number | null
}

type AccelerationValues = {
  x: number | null
  y: number | null
  z: number | null
}

type SensorAvailability = {
  gyroscope: boolean
  accelerometer: boolean
  deviceMotion: boolean
  deviceRotation: boolean
}

type PermissionAwareConstructor = {
  requestPermission?: () => Promise<string>
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatValue(value: number | null) {
  return isNumber(value) ? value.toFixed(1) : '—'
}

function hasValue(values: Array<number | null>) {
  return values.some(isNumber)
}

async function requestPermissionIfNeeded(
  eventType: PermissionAwareConstructor | undefined,
) {
  const requestPermission = eventType?.requestPermission
  if (typeof requestPermission !== 'function') return true
  return (await requestPermission.call(eventType)) === 'granted'
}

function unlockScreenOrientation() {
  try {
    const orientationManager = screen.orientation as ScreenOrientation & { unlock?: () => void }
    orientationManager.unlock?.()
  } catch {
    // Browser support varies; manual rotation remains available.
  }
}

export default function PhoneTestPage() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null)
  const [buttonTapReceived, setButtonTapReceived] = useState(false)
  const [pairingCode, setPairingCode] = useState('')
  const [controllerId, setControllerId] = useState('')
  const [controlStatus, setControlStatus] = useState('NOT CONNECTED')
  const [landscapeMessage, setLandscapeMessage] = useState('Rotate the phone manually to landscape before starting.')
  const [orientationReceived, setOrientationReceived] = useState(false)
  const [motionReceived, setMotionReceived] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('WAITING FOR SENSOR DATA')
  const [message, setMessage] = useState('')
  const [sceneSnapshot, setSceneSnapshot] = useState<PhoneSceneSnapshot | null>(null)
  const [sceneStatus, setSceneStatus] = useState('WAITING FOR LIVE SCENE')
  const [phoneRecenterKey, setPhoneRecenterKey] = useState(0)
  const [availability, setAvailability] = useState<SensorAvailability>({
    gyroscope: false,
    accelerometer: false,
    deviceMotion: false,
    deviceRotation: false,
  })
  const [orientation, setOrientation] = useState<SensorValues>({
    alpha: null,
    beta: null,
    gamma: null,
  })
  const [rotationRate, setRotationRate] = useState<MotionValues>({
    alpha: null,
    beta: null,
    gamma: null,
  })
  const [acceleration, setAcceleration] = useState<AccelerationValues>({
    x: null,
    y: null,
    z: null,
  })
  const orientationRef = useRef<SensorValues>({ alpha: null, beta: null, gamma: null })
  const controllerRunning = useRef(false)
  const lastSceneLogAt = useRef(0)
  const lastConnectionLogAt = useRef(0)
  const sceneRenderFailed = useRef(false)
  const lastDiagnosticRenderAt = useRef(0)
  const remoteRecenterKey = useRef<number | null>(null)

  useEffect(() => {
    const codeFromUrl = new URLSearchParams(window.location.search).get('pair')
    if (codeFromUrl) {
      const normalizedCode = codeFromUrl.toUpperCase().replace(/[^A-Z2-9]/g, '')
      setPairingCode(normalizedCode)
      const savedControllerId = sessionStorage.getItem(`garuda-phone-controller:${normalizedCode}`)
      if (savedControllerId) setControllerId(savedControllerId)
    }
  }, [])

  useEffect(() => {
    setIsMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent))
    setIsSecureContext(window.isSecureContext)
  }, [])

  useEffect(() => {
    if (!isListening) return

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const values = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
      }
      orientationRef.current = values
      if (isListening && [values.alpha, values.beta, values.gamma].every(isNumber)) {
        const now = Date.now()
        setLatestPhoneFrame({
          alpha: values.alpha!,
          beta: values.beta!,
          gamma: values.gamma!,
          screenAngle: typeof screen.orientation?.angle === 'number' ? screen.orientation.angle : 0,
          updatedAt: now,
        })
        if (now - lastDiagnosticRenderAt.current >= 250) {
          lastDiagnosticRenderAt.current = now
          setOrientation(values)
          setOrientationReceived(true)
          setAvailability((current) => current.deviceRotation ? current : ({ ...current, deviceRotation: true }))
          setConnectionStatus((current) => current === 'SENSOR DATA RECEIVED' ? current : 'SENSOR DATA RECEIVED')
        }
      }
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      const rate = {
        alpha: event.rotationRate?.alpha ?? null,
        beta: event.rotationRate?.beta ?? null,
        gamma: event.rotationRate?.gamma ?? null,
      }
      const accelerationValues = {
        x: event.acceleration?.x ?? null,
        y: event.acceleration?.y ?? null,
        z: event.acceleration?.z ?? null,
      }

      const hasRotationRate = hasValue([rate.alpha, rate.beta, rate.gamma])
      const hasAcceleration = hasValue([
        accelerationValues.x,
        accelerationValues.y,
        accelerationValues.z,
      ])
      if (hasRotationRate || hasAcceleration) {
        const now = Date.now()
        if (now - lastDiagnosticRenderAt.current >= 250) {
          lastDiagnosticRenderAt.current = now
          setRotationRate(rate)
          setAcceleration(accelerationValues)
          setMotionReceived(true)
          setAvailability((current) => current.deviceMotion && (!hasRotationRate || current.gyroscope) && (!hasAcceleration || current.accelerometer) ? current : ({
            ...current,
            deviceMotion: true,
            gyroscope: current.gyroscope || hasRotationRate,
            accelerometer: current.accelerometer || hasAcceleration,
          }))
          setConnectionStatus((current) => current === 'SENSOR DATA RECEIVED' ? current : 'SENSOR DATA RECEIVED')
        }
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    window.addEventListener('devicemotion', handleMotion)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('devicemotion', handleMotion)
    }
  }, [isListening])

  useEffect(() => {
    if (!isListening || !pairingCode) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let busy = false
    let lastPollStartedAt = 0
    const pollScene = async () => {
      if (stopped || busy) return
      busy = true
      lastPollStartedAt = performance.now()
      try {
        const response = await fetch(`/api/phone-control?code=${encodeURIComponent(pairingCode)}&scope=scene`, { cache: 'no-store' })
        const data = await response.json() as {
          scene?: PhoneSceneSnapshot | null
          sceneAgeMs?: number | null
          sceneElapsedMs?: number | null
          recenterKey?: number
          error?: string
        }
        if (!response.ok) throw new Error(data.error || 'The laptop scene connection was interrupted.')
        if (!stopped) {
          if (typeof data.recenterKey === 'number' && remoteRecenterKey.current !== data.recenterKey) {
            remoteRecenterKey.current = data.recenterKey
            setPhoneRecenterKey(data.recenterKey)
          }
          const scene = data.scene && (data.sceneAgeMs ?? Infinity) < 4000 ? data.scene : null
          setSceneSnapshot(scene && Number.isFinite(data.sceneElapsedMs)
            ? { ...scene, missionStartedAt: Date.now() - Math.max(0, data.sceneElapsedMs!) }
            : scene)
          if (!sceneRenderFailed.current) setSceneStatus(scene ? 'LIVE · SYNCED' : 'WAITING FOR LAPTOP SCENE')
          if (scene && Date.now() - lastSceneLogAt.current > 10000) {
            console.info('[phone-viewer] live state received', {
              scenarioId: scene.scenarioId,
              contactCount: scene.contacts.length,
            })
            lastSceneLogAt.current = Date.now()
          }
        }
      } catch (reason) {
        if (!stopped) {
          setSceneSnapshot(null)
          setSceneStatus('LAPTOP CONNECTION LOST')
          setMessage(reason instanceof Error ? reason.message : 'Waiting for the live laptop scene.')
          if (Date.now() - lastConnectionLogAt.current > 10000) {
            console.warn('[phone-viewer] laptop scene connection failed')
            lastConnectionLogAt.current = Date.now()
          }
        }
      } finally {
        busy = false
        if (!stopped) timer = setTimeout(pollScene, Math.max(0, 250 - (performance.now() - lastPollStartedAt)))
      }
    }
    void pollScene()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [isListening, pairingCode])

  useEffect(() => {
    if (!isListening || !controllerId || !pairingCode) return
    let stopped = false
    let busy = false
    let timer: ReturnType<typeof setTimeout>
    const abortController = new AbortController()
    let lastSendStartedAt = 0

    const sendLatest = async () => {
      if (stopped || !controllerRunning.current || busy) return
      const current = orientationRef.current
      if (!hasValue([current.alpha, current.beta, current.gamma])) {
        timer = setTimeout(sendLatest, 34)
        return
      }
      busy = true
      lastSendStartedAt = performance.now()
      try {
        const signedDegrees = (value: number) => ((value + 180) % 360 + 360) % 360 - 180
        const response = await fetch('/api/phone-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            action: 'update',
            code: pairingCode,
            controllerId,
            orientation: {
              alpha: ((current.alpha! % 360) + 360) % 360,
              beta: signedDegrees(current.beta!),
              gamma: signedDegrees(current.gamma!),
              screenAngle: signedDegrees(typeof screen.orientation?.angle === 'number' ? screen.orientation.angle : 0),
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              stereo: true,
            },
          }),
        })
        if (!response.ok) {
          const data = await response.json() as { error?: string }
          throw new Error(data.error || 'Phone link disconnected.')
        }
      } catch (error) {
        if (!stopped && !abortController.signal.aborted) {
          unlockScreenOrientation()
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
          setLatestPhoneFrame(null)
          setSceneSnapshot(null)
          setControlStatus('LINK INTERRUPTED')
          setMessage(error instanceof Error ? error.message : 'Phone link interrupted. Reconnect with the laptop code.')
          setConnectionStatus('PHONE LINK ERROR')
          controllerRunning.current = false
          try {
            const orientationManager = screen.orientation as ScreenOrientation & { unlock?: () => void }
            orientationManager.unlock?.()
          } catch {
            // Browser support varies; the data link is still stopped.
          }
          setIsListening(false)
        }
      } finally {
        busy = false
        if (!stopped && controllerRunning.current) timer = setTimeout(sendLatest, Math.max(0, 34 - (performance.now() - lastSendStartedAt)))
      }
    }

    void sendLatest()
    return () => {
      stopped = true
      clearTimeout(timer)
      abortController.abort()
    }
  }, [controllerId, isListening, pairingCode])

  const enableSensors = async () => {
    if (isListening || isRequesting) return

    setButtonTapReceived(true)
    setConnectionStatus('BUTTON TAP RECEIVED...')
    setMessage('')
    setIsRequesting(true)
    setControlStatus('CHECKING PHONE SENSORS')

    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined'
    const hasMotion = typeof window.DeviceMotionEvent !== 'undefined'

    if (!hasOrientation) {
      setConnectionStatus('PHONE SENSORS NOT SUPPORTED')
      setControlStatus('SENSOR API UNSUPPORTED')
      setMessage('This browser does not expose DeviceOrientationEvent, which is required for camera control.')
      setIsRequesting(false)
      return
    }

    if (!window.isSecureContext) {
      setConnectionStatus('INSECURE CONTEXT — SENSORS NOT ENABLED')
      setMessage(
        'This page is using HTTP and window.isSecureContext is false. The browser may block motion/orientation sensors here. Open this page through a trusted HTTPS development URL; sensor access was not requested.',
      )
      setControlStatus('SECURE HTTPS REQUIRED')
      setIsRequesting(false)
      return
    }

    const normalizedCode = pairingCode.toUpperCase().replace(/[^A-Z2-9]/g, '')
    if (normalizedCode.length !== 12) {
      setControlStatus('PAIRING CODE REQUIRED')
      setConnectionStatus('WAITING FOR LAPTOP PAIRING')
      setMessage('Enter the 12-character pairing code shown in the laptop scene before starting phone control.')
      setIsRequesting(false)
      return
    }

    try {
      const orientationPermission = requestPermissionIfNeeded(
        window.DeviceOrientationEvent as unknown as PermissionAwareConstructor,
      )
      const motionPermission = hasMotion
        ? requestPermissionIfNeeded(window.DeviceMotionEvent as unknown as PermissionAwareConstructor).catch(() => false)
        : Promise.resolve(false)
      const orientationManager = screen.orientation as ScreenOrientation & {
        lock?: (value: string) => Promise<void>
      }
      // Invoke in the tap handler while browser user activation is available.
      const fullscreenRequest = document.documentElement.requestFullscreen
        ? document.documentElement.requestFullscreen().then(() => true).catch(() => false)
        : Promise.resolve(false)
      const landscapeLock = (async () => {
        await fullscreenRequest
        return orientationManager.lock
          ? orientationManager.lock('landscape').then(() => true).catch(() => false)
          : false
      })()

      if (!(await orientationPermission)) {
        unlockScreenOrientation()
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
        setConnectionStatus('SENSOR ACCESS DENIED')
        setControlStatus('SENSOR PERMISSION DENIED')
        setMessage('Orientation permission was not granted. Check this site’s sensor permissions in browser settings, then retry.')
        return
      }

      if (hasMotion && !(await motionPermission)) {
        setMessage('Motion permission was denied or unavailable. Orientation control can continue; motion diagnostics may remain unavailable.')
      }

      const storageKey = `garuda-phone-controller:${normalizedCode}`
      const nextControllerId = controllerId || sessionStorage.getItem(storageKey) || crypto.randomUUID()
      const response = await fetch('/api/phone-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', code: normalizedCode, controllerId: nextControllerId }),
      })
      const connection = await response.json() as { error?: string }
      if (!response.ok) throw new Error(connection.error || 'Could not connect to the laptop pairing session.')

      const [locked] = await Promise.all([landscapeLock, fullscreenRequest])
      setLandscapeMessage(locked
        ? 'Landscape orientation locked.'
        : 'Rotate your phone horizontally to landscape.')

      setLatestPhoneFrame(null)
      setSceneSnapshot(null)
      setSceneStatus('WAITING FOR LIVE SCENE')
      sceneRenderFailed.current = false
      setPhoneRecenterKey(0)
      remoteRecenterKey.current = null
      setPairingCode(normalizedCode)
      setControllerId(nextControllerId)
      sessionStorage.setItem(storageKey, nextControllerId)
      controllerRunning.current = true
      setControlStatus('CONNECTED — SENDING ORIENTATION')
      setConnectionStatus('WAITING FOR SENSOR DATA')
      setIsListening(true)
      console.info('[phone-viewer] paired; requesting live scene')
    } catch (error) {
      unlockScreenOrientation()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      setConnectionStatus('SENSOR ACCESS ERROR')
      setControlStatus('CONNECTION FAILED')
      const detail = error instanceof Error ? error.message : 'The browser rejected sensor access.'
      setMessage(
        !window.isSecureContext
          ? `The browser rejected sensor access in this insecure context. Use trusted HTTPS. Details: ${detail}`
          : `Could not enable phone sensors. Check browser permissions and try again. Details: ${detail}`,
      )
    } finally {
      setIsRequesting(false)
    }
  }

  const stopPhoneControl = async () => {
    controllerRunning.current = false
    setIsListening(false)
    setSceneSnapshot(null)
    setLatestPhoneFrame(null)
    remoteRecenterKey.current = null
    setControlStatus('DISCONNECTED')
    setConnectionStatus('PHONE CONTROL STOPPED')
    unlockScreenOrientation()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    if (controllerId && pairingCode) {
      try {
        await fetch('/api/phone-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'disconnect', code: pairingCode, controllerId }),
        })
      } catch {
        setMessage('Local sensors stopped. The laptop will mark this phone disconnected when its link lease expires.')
      }
    }
  }

  const status = isMobile === false
    ? 'DESKTOP DEVICE DETECTED'
    : connectionStatus

  if (isListening) {
    return (
      <main className={styles.mobileViewer}>
        {sceneSnapshot ? (
          <div className={styles.mobileScene}>
            <PhoneSceneErrorBoundary onError={() => {
              sceneRenderFailed.current = true
              setSceneStatus('SCENE RENDER ERROR')
            }}>
              <TrainingSimulationScene
                contacts={sceneSnapshot.contacts}
                terrain={sceneSnapshot.terrain}
                time={sceneSnapshot.time}
                visibility={sceneSnapshot.visibility}
                himalayanVisuals={sceneSnapshot.himalayanVisuals}
                missionStartedAt={sceneSnapshot.missionStartedAt}
                phoneControlEnabled
                phoneRecenterKey={phoneRecenterKey}
                mobileOptimized
                mobileStereo
              />
            </PhoneSceneErrorBoundary>
          </div>
        ) : (
          <p className={styles.sceneLoading}>Waiting for the laptop’s live GARUDA scene…</p>
        )}
        <p className={styles.viewerStatus} role="status">{sceneStatus}</p>
        {landscapeMessage.startsWith('Rotate') && <p className={styles.viewerNotice}>{landscapeMessage}</p>}
        {sceneSnapshot && <button className={styles.viewerRecenter} type="button" onClick={() => {
          const nextKey = (remoteRecenterKey.current ?? phoneRecenterKey) + 1
          remoteRecenterKey.current = nextKey
          setPhoneRecenterKey(nextKey)
          void fetch('/api/phone-control', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'recenter', code: pairingCode }),
          }).then(async (response) => {
            if (!response.ok) return
            const data = await response.json() as { recenterKey?: number }
            if (typeof data.recenterKey === 'number') {
              remoteRecenterKey.current = data.recenterKey
              setPhoneRecenterKey(data.recenterKey)
            }
          }).catch(() => undefined)
        }}>Recenter</button>}
        <button className={styles.viewerExit} type="button" onClick={stopPhoneControl}>Disconnect</button>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className="brand" aria-label="GARUDA">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <b>GARUDA</b>
          </div>
          <span className={styles.mode}>TEMPORARY DIAGNOSTIC</span>
        </header>

        <section className={styles.intro}>
          <p className="eyebrow">DEVICE SENSOR CHECK</p>
          <h1>PHONE ORIENTATION TEST</h1>
          <p>Verify that your mobile browser is receiving live motion and orientation sensor data.</p>
        </section>

        <section className={styles.statusPanel} aria-live="polite">
          <div>
            <span className={styles.label}>CONNECTION STATUS</span>
            <strong
              className={`${styles.connection} ${status === 'SENSOR DATA RECEIVED' ? styles.connected : ''}`}
            >
              <span className={styles.statusDot} />
              {status}
            </strong>
          </div>
          {buttonTapReceived && (
            <p className={styles.notice}>BUTTON TAP RECEIVED — checking browser sensor access.</p>
          )}
          {isMobile === false && (
            <p className={styles.notice}>This diagnostic is intended to be tested on a mobile device.</p>
          )}
          <p className={styles.notice}>PHONE LINK: {controlStatus}</p>
          <p className={styles.notice}>{landscapeMessage}</p>
          {status === 'PHONE SENSORS NOT SUPPORTED' && (
            <p className={styles.error}>{message || 'This browser does not support the required sensor APIs.'}</p>
          )}
          {status === 'SENSOR ACCESS DENIED' && (
            <p className={styles.error}>SENSOR ACCESS DENIED<br />Please allow motion/orientation access in the browser.</p>
          )}
          {message && <p className={styles.error}>{message}</p>}
          {isSecureContext === false && (
            <p className={styles.notice}>
              Current address is not a secure context (HTTPS). Sensor access may be blocked by the browser. This page will not bypass that restriction.
            </p>
          )}
        </section>

        <section className={styles.controllerPanel}>
          <h2>CONNECT TO GARUDA</h2>
          <label className={styles.pairingLabel} htmlFor="pairing-code">Laptop pairing code</label>
          <input
            id="pairing-code"
            className={styles.pairingInput}
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12))}
            placeholder="12-CHARACTER CODE"
            autoCapitalize="characters"
            autoComplete="off"
            disabled={isListening || isRequesting}
          />
          <p>On the laptop, open the live training scene and choose <strong>Pair phone</strong>. Enter its code here.</p>
        </section>

        <section className={styles.panel}>
          <h2>SENSOR STATUS</h2>
          <p className={styles.readingStatus}>
            Orientation readings: <strong>{orientationReceived ? 'RECEIVED' : 'NOT RECEIVED'}</strong>
            <br />
            Motion readings: <strong>{motionReceived ? 'RECEIVED' : 'NOT RECEIVED'}</strong>
          </p>
          <dl className={styles.sensorList}>
            <SensorRow label="Gyroscope" available={availability.gyroscope} />
            <SensorRow label="Accelerometer" available={availability.accelerometer} />
            <SensorRow label="Device Motion" available={availability.deviceMotion} />
            <SensorRow label="Device Rotation" available={availability.deviceRotation} />
          </dl>
        </section>

        <section className={`${styles.panel} ${styles.orientationPanel}`}>
          <h2>PHONE ORIENTATION</h2>
          <div className={styles.orientationGrid}>
            <ValueCard label="Alpha / Yaw" value={orientation.alpha} />
            <ValueCard label="Beta / Pitch" value={orientation.beta} />
            <ValueCard label="Gamma / Roll" value={orientation.gamma} />
          </div>
        </section>

        <section className={`${styles.panel} ${styles.rawPanel}`}>
          <h2>RAW SENSOR VALUES</h2>
          <div className={styles.rawGrid}>
            <div>
              <h3>Rotation Rate</h3>
              <ValueRow label="alpha" value={rotationRate.alpha} />
              <ValueRow label="beta" value={rotationRate.beta} />
              <ValueRow label="gamma" value={rotationRate.gamma} />
            </div>
            <div>
              <h3>Acceleration</h3>
              <ValueRow label="x" value={acceleration.x} />
              <ValueRow label="y" value={acceleration.y} />
              <ValueRow label="z" value={acceleration.z} />
            </div>
          </div>
        </section>

        <button
          className={`button ${styles.enableButton}`}
          type="button"
          onClick={isListening ? stopPhoneControl : enableSensors}
          disabled={isRequesting}
        >
          {isListening
            ? 'STOP PHONE CONTROL'
            : isRequesting
              ? 'REQUESTING SENSOR ACCESS…'
              : 'START PHONE CONTROL'}
        </button>

        <section className={styles.instructions}>
          <h2>TEST INSTRUCTIONS</h2>
          <ol>
            <li>Open this page on your Android phone.</li>
            <li>Enter the laptop pairing code, then press START PHONE CONTROL.</li>
            <li>Allow motion/orientation permission if prompted.</li>
            <li>Hold the phone normally and rotate left/right.</li>
            <li>Tilt the phone up/down and clockwise/counter-clockwise.</li>
            <li>Watch the orientation values change.</li>
          </ol>
          <p><strong>Expected result:</strong> Yaw/Pitch/Roll values should change when the phone moves.</p>
          <p><strong>Local HTTP note:</strong> If readings do not arrive at the local IP address, use a trusted HTTPS development URL. Do not disable browser security.</p>
        </section>

        <footer className={styles.footer}>
          PHONE → BROWSER → SENSOR VALUES
          <span>Orientation is sent only while phone control runs on this phone</span>
        </footer>
      </div>
    </main>
  )
}

function SensorRow({ label, available }: { label: string; available: boolean }) {
  return (
    <div className={styles.sensorRow}>
      <dt>{label}</dt>
      <dd className={available ? styles.available : ''}>
        <span />
        {available ? 'AVAILABLE' : 'UNAVAILABLE'}
      </dd>
    </div>
  )
}

function ValueCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.valueCard}>
      <span>{label}</span>
      <strong>{formatValue(value)}°</strong>
    </div>
  )
}

function ValueRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.valueRow}>
      <span>{label}:</span>
      <strong>{formatValue(value)}</strong>
    </div>
  )
}
