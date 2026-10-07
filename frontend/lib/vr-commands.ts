export type VRCommandIntent =
  | 'MOVE_FORWARD'
  | 'MOVE_BACKWARD'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'SELECT_TARGET'
  | 'DETECT_TARGET'
  | 'CLASSIFY_TARGET'
  | 'PRIORITIZE_TARGET'
  | 'RESPOND_TO_TARGET'

export type VRTargetReference = `T${number}`

export type VRTrainingCommand =
  | { intent: 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' }
  | { intent: 'SELECT_TARGET' | 'DETECT_TARGET' | 'PRIORITIZE_TARGET' | 'RESPOND_TO_TARGET'; target: VRTargetReference }
  | { intent: 'CLASSIFY_TARGET'; target: VRTargetReference; classification: 'friendly' | 'unknown' | 'hostile' | 'surveillance' }

export type ParsedVRCommand =
  | { intent: 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' }
  | { intent: 'SELECT_TARGET' | 'DETECT_TARGET' | 'PRIORITIZE_TARGET'; threatId: string }
  | { intent: 'CLASSIFY_TARGET'; threatId: string; classification: string }
  | { intent: 'RESPOND_TO_TARGET'; threatId: string; response: 'engage' | 'respond' }
type VRMovementIntent = 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT'

export type VRCommandParseResult =
  | { status: 'command'; command: ParsedVRCommand }
  | { status: 'target-not-found'; targetReference: string }
  | { status: 'unrecognized' }

const spokenNumbers: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

export function parseVRCommand(transcript: string, availableThreatIds: readonly string[]): VRCommandParseResult {
  const normalized = transcript.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim()
  const movement: Record<string, VRMovementIntent> = {
    'move forward': 'MOVE_FORWARD',
    'move ahead': 'MOVE_FORWARD',
    'go forward': 'MOVE_FORWARD',
    'go ahead': 'MOVE_FORWARD',
    'move backward': 'MOVE_BACKWARD',
    'go backward': 'MOVE_BACKWARD',
    'move left': 'MOVE_LEFT',
    'move right': 'MOVE_RIGHT',
  }
  const movementIntent = movement[normalized]
  if (movementIntent) return { status: 'command', command: { intent: movementIntent } }

  const reference = /\bt\s*-?\s*0*(\d+)\b|\btarget\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/.exec(normalized)
  if (!reference) return { status: 'unrecognized' }
  const targetNumber = reference[1] ? Number(reference[1]) : spokenNumbers[reference[2]] ?? Number(reference[2])
  if (!Number.isInteger(targetNumber) || targetNumber < 1) return { status: 'unrecognized' }

  const threatId = availableThreatIds.find((id) => Number(/\d+/.exec(id)?.[0]) === targetNumber)
  if (!threatId) return { status: 'target-not-found', targetReference: `T${targetNumber}` }

  const commandText = `${normalized.slice(0, reference.index)}t${targetNumber}${normalized.slice(reference.index + reference[0].length)}`.trim()
  const targetToken = `t${targetNumber}`
  if (
    commandText === targetToken ||
    commandText === `select ${targetToken}` ||
    commandText === `choose ${targetToken}` ||
    commandText === `show classification for ${targetToken}` ||
    commandText === `identify ${targetToken}`
  ) {
    return { status: 'command', command: { intent: 'SELECT_TARGET', threatId } }
  }
  if (commandText === `detect ${targetToken}`) {
    return { status: 'command', command: { intent: 'DETECT_TARGET', threatId } }
  }
  const classification = new RegExp(`^classify ${targetToken}(?: as (.+))?$`).exec(commandText)
  if (classification) {
    return { status: 'command', command: { intent: 'CLASSIFY_TARGET', threatId, classification: classification[1]?.trim() ?? '' } }
  }
  if (commandText === `prioritize ${targetToken}` || commandText === `prioritise ${targetToken}`) {
    return { status: 'command', command: { intent: 'PRIORITIZE_TARGET', threatId } }
  }
  if (commandText === `engage ${targetToken}` || commandText === `destroy ${targetToken}`) {
    return { status: 'command', command: { intent: 'RESPOND_TO_TARGET', threatId, response: 'engage' } }
  }
  if (commandText === `respond ${targetToken}` || commandText === `respond to ${targetToken}`) {
    return { status: 'command', command: { intent: 'RESPOND_TO_TARGET', threatId, response: 'respond' } }
  }
  return { status: 'unrecognized' }
}

export const VR_COMMAND_GROUPS: {
  category: string
  intents: VRCommandIntent[]
  examples: string[]
}[] = [
  {
    category: 'MOVEMENT',
    intents: ['MOVE_FORWARD', 'MOVE_BACKWARD', 'MOVE_LEFT', 'MOVE_RIGHT'],
    examples: ['Move forward', 'Move backward', 'Move left', 'Move right'],
  },
  {
    category: 'TARGET SELECTION',
    intents: ['SELECT_TARGET'],
    examples: ['Select T1', 'Select target one', 'Select T2', 'Select target two'],
  },
  {
    category: 'DETECTION',
    intents: ['DETECT_TARGET'],
    examples: ['Detect T1', 'Detect target one'],
  },
  {
    category: 'CLASSIFICATION',
    intents: ['CLASSIFY_TARGET'],
    examples: ['Classify T1', 'Classify T1 as hostile', 'Classify T1 as surveillance'],
  },
  {
    category: 'PRIORITIZATION',
    intents: ['PRIORITIZE_TARGET'],
    examples: ['Prioritize T1', 'Prioritize target one'],
  },
  {
    category: 'RESPONSE',
    intents: ['RESPOND_TO_TARGET'],
    examples: ['Engage T1', 'Respond to T1'],
  },
]
