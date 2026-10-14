export type PhoneOrientationFrame = {
  alpha: number
  beta: number
  gamma: number
  screenAngle: number
  updatedAt: number
  viewportWidth?: number
  viewportHeight?: number
  stereo?: boolean
}

export type PhoneSceneSnapshot = {
  scenarioId: string
  terrain: string
  time: string
  visibility: string
  himalayanVisuals: boolean
  contacts: Array<{
    id: string
    type: string
    attackGroupId?: string
    detected: boolean
    selected: boolean
    position: [number, number, number]
    classification?: 'Friendly' | 'Unknown' | 'Hostile'
    eventCue?: string
    motion?: {
      amplitude: [number, number]
      frequency: [number, number]
      phase: number
      speed?: number
      spawnTimeSeconds?: number
      waypoints?: [number, number, number][]
      verticalAmplitude?: number
      verticalFrequency?: number
      rotationAmplitude?: number
    }
  }>
  missionStartedAt: number
  publishedAt: number
}

let latestFrame: PhoneOrientationFrame | null = null

export function setLatestPhoneFrame(frame: PhoneOrientationFrame | null) {
  if (frame && latestFrame && frame.updatedAt <= latestFrame.updatedAt) return
  latestFrame = frame
}

export function getLatestPhoneFrame() {
  return latestFrame
}

export function isPhoneFrameFresh(frame: PhoneOrientationFrame | null, now: number, maxAgeMs = 1500) {
  if (!frame || !Number.isFinite(frame.updatedAt)) return false
  const age = now - frame.updatedAt
  return age >= 0 && age <= maxAgeMs
}

export function getPhoneEyeAspect(frame: Pick<PhoneOrientationFrame, 'viewportWidth' | 'viewportHeight' | 'stereo'>) {
  const { viewportWidth, viewportHeight, stereo } = frame
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || !viewportWidth || !viewportHeight) return null
  const fullAspect = viewportWidth / viewportHeight
  if (fullAspect < 0.5 || fullAspect > 4) return null
  return fullAspect * (stereo ? 0.5 : 1)
}
