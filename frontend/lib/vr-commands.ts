export type VRCommandIntent =
  | 'MOVE_FORWARD'
  | 'MOVE_BACKWARD'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'MOVE_UP'
  | 'MOVE_DOWN'
  | 'MOVE_STOP'
  | 'TOGGLE_BINOCULARS'
  | 'SELECT_TARGET'
  | 'DETECT_TARGET'
  | 'CLASSIFY_TARGET'
  | 'PRIORITIZE_TARGET'
  | 'RESPOND_TO_TARGET'

export type VRTargetReference = `T${number}`

export type VRTrainingCommand =
  | { intent: 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' | 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_STOP' }
  | { intent: 'SELECT_TARGET' | 'DETECT_TARGET' | 'PRIORITIZE_TARGET' | 'RESPOND_TO_TARGET'; target: VRTargetReference }
  | { intent: 'CLASSIFY_TARGET'; target: VRTargetReference; classification: 'friendly' | 'unknown' | 'hostile' | 'surveillance' }
  | { intent: 'TOGGLE_BINOCULARS'; enabled: boolean }

export type ParsedVRCommand =
  | { intent: 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' | 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_STOP' }
  | { intent: 'TOGGLE_BINOCULARS'; enabled: boolean }
  | { intent: 'SELECT_TARGET' | 'DETECT_TARGET' | 'PRIORITIZE_TARGET'; threatId: string }
  | { intent: 'CLASSIFY_TARGET'; threatId: string; classification: string }
  | { intent: 'RESPOND_TO_TARGET'; threatId: string; response: 'engage' | 'respond' }
  | { intent: 'PRIORITIZE_TARGET'; threatId: string; priority: 'High' | 'Medium' | 'Low' }
type VRMovementIntent = 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' | 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_STOP'

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
  eleven: 11,
  twelve: 12,
}

const normalizeTargetNumber = (value: string): number | null => {
  if (!value) return null
  const trimmed = value.trim().replace(/^0+/, '')
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const spoken = spokenNumbers[trimmed]
  return typeof spoken === 'number' ? spoken : null
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function parseVRCommand(transcript: string, availableThreatIds: readonly string[]): VRCommandParseResult {
  const normalized = transcript.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return { status: 'unrecognized' }

  const movement: Record<string, VRMovementIntent> = {
    'move forward': 'MOVE_FORWARD',
    'move ahead': 'MOVE_FORWARD',
    'go forward': 'MOVE_FORWARD',
    'go ahead': 'MOVE_FORWARD',
    forward: 'MOVE_FORWARD',
    'move backward': 'MOVE_BACKWARD',
    'move back': 'MOVE_BACKWARD',
    'go backward': 'MOVE_BACKWARD',
    backward: 'MOVE_BACKWARD',
    'move left': 'MOVE_LEFT',
    left: 'MOVE_LEFT',
    'move right': 'MOVE_RIGHT',
    right: 'MOVE_RIGHT',
    'move up': 'MOVE_UP',
    up: 'MOVE_UP',
    'move down': 'MOVE_DOWN',
    down: 'MOVE_DOWN',
    stop: 'MOVE_STOP',
    'stop moving': 'MOVE_STOP',
    'hold position': 'MOVE_STOP',
    hold: 'MOVE_STOP',
  }

  const movementIntent = movement[normalized]
  if (movementIntent) return { status: 'command', command: { intent: movementIntent } }

  const binocularToggle = /^(?:binoculars|binocular|scope|optics)\s+(on|off)$/.exec(normalized)
  if (binocularToggle) {
    return { status: 'command', command: { intent: 'TOGGLE_BINOCULARS', enabled: binocularToggle[1] === 'on' } }
  }

  const targetMatch = /(?:^|\s)(?:t|target)[- ]?0*(\d+)\b|(?:^|\s)target\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/i.exec(normalized)
  if (!targetMatch) return { status: 'unrecognized' }

  const targetNumber = normalizeTargetNumber((targetMatch[1] ?? targetMatch[2] ?? '').trim())
  if (targetNumber === null || !Number.isInteger(targetNumber) || targetNumber < 1) return { status: 'unrecognized' }

  const threatId = availableThreatIds.find((id) => {
    const match = /\d+/.exec(id)
    return match ? Number(match[0]) === targetNumber : false
  })
  if (!threatId) return { status: 'target-not-found', targetReference: `T${targetNumber}` }

  const targetToken = `t${targetNumber}`
  const targetReferenceText = targetMatch[0]?.trim() ?? ''
  const commandText = targetReferenceText
    ? normalized.replace(new RegExp(escapeRegex(targetReferenceText), 'i'), ` ${targetToken} `).replace(/\s+/g, ' ').trim()
    : normalized

  if (
    commandText === targetToken ||
    new RegExp(`^select\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText) ||
    new RegExp(`^choose\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText) ||
    new RegExp(`^show\\s+classification\\s+for\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText) ||
    new RegExp(`^identify\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText) ||
    new RegExp(`^inspect\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText) ||
    new RegExp(`^look\\s+at\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText)
  ) {
    return { status: 'command', command: { intent: 'SELECT_TARGET', threatId } }
  }

  if (new RegExp(`^(?:detect|scan|spot)\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText)) {
    return { status: 'command', command: { intent: 'DETECT_TARGET', threatId } }
  }

  const classification = new RegExp(`^(?:classify|identify)\\s+${escapeRegex(targetToken)}(?:\\s+as\\s+([a-z]+))?$`, 'i').exec(commandText)
  if (classification) {
    const value = classification[1]?.trim() ?? ''
    return { status: 'command', command: { intent: 'CLASSIFY_TARGET', threatId, classification: value || 'unknown' } }
  }

  const prioritized = new RegExp(`^(?:prioritize|prioritise|set\\s+priority\\s+for)\\s+${escapeRegex(targetToken)}(?:\\s+(?:priority|level)?\\s*(high|medium|low)|\\s+to\\s*(high|medium|low))?$`, 'i').exec(commandText)
  if (prioritized) {
    const priorityValue = prioritized[1] ?? prioritized[2]
    const priority = priorityValue ? priorityValue.charAt(0).toUpperCase() + priorityValue.slice(1) : undefined
    return {
      status: 'command',
      command: {
        intent: 'PRIORITIZE_TARGET',
        threatId,
        ...(priority ? { priority: priority as 'High' | 'Medium' | 'Low' } : {}),
      },
    }
  }

  if (new RegExp(`^(?:engage|destroy|eliminate|neutralize)\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText)) {
    return { status: 'command', command: { intent: 'RESPOND_TO_TARGET', threatId, response: 'engage' } }
  }
  if (new RegExp(`^(?:respond|respond\\s+to)\\s+${escapeRegex(targetToken)}$`, 'i').test(commandText)) {
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
    intents: ['MOVE_FORWARD', 'MOVE_BACKWARD', 'MOVE_LEFT', 'MOVE_RIGHT', 'MOVE_UP', 'MOVE_DOWN', 'MOVE_STOP'],
    examples: ['Move forward', 'Move backward', 'Move left', 'Move right', 'Move up', 'Move down', 'Stop'],
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
    examples: ['Prioritize T1', 'Prioritize T1 high', 'Set priority for T1 to medium'],
  },
  {
    category: 'RESPONSE',
    intents: ['RESPOND_TO_TARGET'],
    examples: ['Engage T1', 'Respond to T1'],
  },
  {
    category: 'BINOCULARS',
    intents: ['TOGGLE_BINOCULARS'],
    examples: ['Binoculars on', 'Binoculars off'],
  },
]
