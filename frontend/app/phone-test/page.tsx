'use client'

import { useEffect, useState } from 'react'
import styles from './phone-test.module.css'

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

export default function PhoneTestPage() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null)
  const [buttonTapReceived, setButtonTapReceived] = useState(false)
  const [orientationReceived, setOrientationReceived] = useState(false)
  const [motionReceived, setMotionReceived] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('WAITING FOR SENSOR DATA')
  const [message, setMessage] = useState('')
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
      setOrientation(values)
      if (hasValue([values.alpha, values.beta, values.gamma])) {
        setOrientationReceived(true)
        setAvailability((current) => ({ ...current, deviceRotation: true }))
        setConnectionStatus('SENSOR DATA RECEIVED')
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

      setRotationRate(rate)
      setAcceleration(accelerationValues)
      const hasRotationRate = hasValue([rate.alpha, rate.beta, rate.gamma])
      const hasAcceleration = hasValue([
        accelerationValues.x,
        accelerationValues.y,
        accelerationValues.z,
      ])
      if (hasRotationRate || hasAcceleration) {
        setMotionReceived(true)
        setAvailability((current) => ({
          ...current,
          deviceMotion: true,
          gyroscope: current.gyroscope || hasRotationRate,
          accelerometer: current.accelerometer || hasAcceleration,
        }))
      }

      if (
        hasValue([
          rate.alpha,
          rate.beta,
          rate.gamma,
          accelerationValues.x,
          accelerationValues.y,
          accelerationValues.z,
        ])
      ) {
        setConnectionStatus('SENSOR DATA RECEIVED')
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    window.addEventListener('devicemotion', handleMotion)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('devicemotion', handleMotion)
    }
  }, [isListening])

  const enableSensors = async () => {
    if (isListening || isRequesting) return

    setButtonTapReceived(true)
    setConnectionStatus('BUTTON TAP RECEIVED...')
    setMessage('')
    setIsRequesting(true)

    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined'
    const hasMotion = typeof window.DeviceMotionEvent !== 'undefined'

    if (!hasOrientation && !hasMotion) {
      setConnectionStatus('PHONE SENSORS NOT SUPPORTED')
      setMessage('This browser does not expose DeviceOrientationEvent or DeviceMotionEvent.')
      setIsRequesting(false)
      return
    }

    if (!window.isSecureContext) {
      setConnectionStatus('INSECURE CONTEXT — SENSORS NOT ENABLED')
      setMessage(
        'This page is using HTTP and window.isSecureContext is false. The browser may block motion/orientation sensors here. Open this page through a trusted HTTPS development URL; sensor access was not requested.',
      )
      setIsRequesting(false)
      return
    }

    if (!hasOrientation || !hasMotion) {
      setMessage(
        `Partial sensor API support: DeviceOrientationEvent is ${hasOrientation ? 'available' : 'unavailable'}; DeviceMotionEvent is ${hasMotion ? 'available' : 'unavailable'}.`,
      )
    }

    try {
      const permissions = await Promise.all([
        hasOrientation
          ? requestPermissionIfNeeded(
              window.DeviceOrientationEvent as unknown as PermissionAwareConstructor,
            )
          : Promise.resolve(true),
        hasMotion
          ? requestPermissionIfNeeded(
              window.DeviceMotionEvent as unknown as PermissionAwareConstructor,
            )
          : Promise.resolve(true),
      ])

      if (permissions.some((granted) => !granted)) {
        setConnectionStatus('SENSOR ACCESS DENIED')
        setMessage('Permission was not granted. Check this site’s motion/orientation permissions in browser settings, then reload and try again.')
        return
      }

      setConnectionStatus('WAITING FOR SENSOR DATA')
      setIsListening(true)
    } catch (error) {
      setConnectionStatus('SENSOR ACCESS ERROR')
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

  const status = isMobile === false
    ? 'DESKTOP DEVICE DETECTED'
    : connectionStatus

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
          onClick={enableSensors}
          disabled={isListening || isRequesting}
        >
          {isListening
            ? 'LISTENING — WAITING FOR DATA'
            : isRequesting
              ? 'REQUESTING SENSOR ACCESS…'
              : 'ENABLE PHONE SENSORS'}
        </button>

        <section className={styles.instructions}>
          <h2>TEST INSTRUCTIONS</h2>
          <ol>
            <li>Open this page on your Android phone.</li>
            <li>Press ENABLE PHONE SENSORS.</li>
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
          <span>No streaming or simulation integration</span>
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
