export type PhoneOrientationFrame = {
  alpha: number
  beta: number
  gamma: number
  screenAngle: number
  updatedAt: number
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
  latestFrame = frame
}

export function getLatestPhoneFrame() {
  return latestFrame
}
