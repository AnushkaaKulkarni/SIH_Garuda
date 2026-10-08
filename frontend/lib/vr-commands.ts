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
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  paanch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  dus: 10,
  gyarah: 11,
  barah: 12,
}

const normalizeTargetNumber = (value: string): number | null => {
  if (!value) return null
  const trimmed = value.trim().replace(/^0+/, '')
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const spoken = spokenNumbers[trimmed.toLowerCase()]
  return typeof spoken === 'number' ? spoken : null
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function normalizeVRCommandText(transcript: string): string {
  let text = transcript
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const translations: Array<[RegExp, string]> = [
    [/\b(?:aage|agge|ahead|samne|front|age)\s+(?:badho|jao|move|go)\b/g, 'forward'],
    [/\b(?:peeche|piche|back|backward|behind|piche se)\s+(?:badho|jao|move|go)\b/g, 'backward'],
    [/\b(?:baen|baya|left|left side|leftwards|bayan|turn left)\s+(?:badho|jao|move|go)\b/g, 'left'],
    [/\b(?:daya|dain|right|right side|rightwards|daen|turn right)\s+(?:badho|jao|move|go)\b/g, 'right'],
    [/\b(?:upar|up|upar ki taraf)\s+(?:badho|jao|move|go)\b/g, 'up'],
    [/\b(?:niche|neeche|down|niche ki taraf)\s+(?:badho|jao|move|go)\b/g, 'down'],
    [/\b(?:aage|agge|ahead|samne|front|age)\b/g, 'forward'],
    [/\b(?:peeche|piche|back|backward|behind|piche se)\b/g, 'backward'],
    [/\b(?:baen|baya|left|left side|leftwards|bayan|turn left)\b/g, 'left'],
    [/\b(?:daya|dain|right|right side|rightwards|daen|turn right)\b/g, 'right'],
    [/\b(?:upar|up|upar ki taraf)\b/g, 'up'],
    [/\b(?:niche|neeche|down|niche ki taraf)\b/g, 'down'],
    [/\b(?:hold\s+position|freeze|stay|stand\s+down|ruk|ruko|thamb|tham|stop|hold|pause|stopp|pause karo)\b/g, 'stop'],
    [/\b(?:binoculars?|scope|optics|kash|nazra|nazar|nazar ka)\b/g, 'binoculars'],
    [/\b(?:select|choose|pick|chun|select karo|choose karo|pick karo)\b/g, 'select'],
    [/\b(?:detect|scan|spot|identify|pakad|dekho|scan karo|spot karo)\b/g, 'detect'],
    [/\b(?:classify|identify|name|label|mark|tag|classify karo|kategorize|mark karo|tag karo)\b/g, 'classify'],
    [/\b(?:prioritize|prioritise|priority|set priority|prio|priority set)\b/g, 'prioritize'],
    [/\b(?:respond|engage|neutralize|destroy|attack|action|reply|respond karo|engage karo|action karo)\b/g, 'respond'],
    [/\b(?:friend|friendly|neutral|safe|mitra|saf|safe target)\b/g, 'friendly'],
    [/\b(?:unknown|unsure|uncertain|anjaan|unk|unclear)\b/g, 'unknown'],
    [/\b(?:hostile|enemy|threat|danger|dushman|shaatir|hostile target|enemy target)\b/g, 'hostile'],
    [/\b(?:surveillance|scout|watch|observ|monitor|surveil|sentry)\b/g, 'surveillance'],
    [/\b(?:on|chalu|start|enable|activate|kholo|on karo)\b/g, 'on'],
    [/\b(?:off|band|close|disable|deactivate|band karo|close karo|off karo)\b/g, 'off'],
    [/\b(?:target|t\.?|taar|drone|contact|target ko)\b/g, 'target'],
    [/\b(?:go|move|jao|move karo|badho|aage badho)\b/g, 'move'],
    [/\b(?:ko|ka|se|ki|aur|par)\b/g, ' '],
    [/\b(?:karo|kar)\b/g, ' '],
  ]

  for (const [pattern, replacement] of translations) {
    text = text.replace(pattern, replacement)
  }

  text = text.replace(/\b(?:ek|one)\b/g, '1')
  text = text.replace(/\b(?:do|two)\b/g, '2')
  text = text.replace(/\b(?:teen|three)\b/g, '3')
  text = text.replace(/\b(?:char|four)\b/g, '4')
  text = text.replace(/\b(?:paanch|five)\b/g, '5')
  text = text.replace(/\b(?:chhe|six)\b/g, '6')
  text = text.replace(/\b(?:saat|seven)\b/g, '7')
  text = text.replace(/\b(?:aath|eight)\b/g, '8')
  text = text.replace(/\b(?:nau|nine)\b/g, '9')
  text = text.replace(/\b(?:dus|ten)\b/g, '10')
  text = text.replace(/\b(?:gyarah|eleven)\b/g, '11')
  text = text.replace(/\b(?:barah|twelve)\b/g, '12')
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

export function parseVRCommand(transcript: string, availableThreatIds: readonly string[]): VRCommandParseResult {
  const normalized = normalizeVRCommandText(transcript)
  if (!normalized) return { status: 'unrecognized' }

  const movement: Record<string, VRMovementIntent> = {
    'move forward': 'MOVE_FORWARD',
    'move ahead': 'MOVE_FORWARD',
    'go forward': 'MOVE_FORWARD',
    'forward': 'MOVE_FORWARD',
    'forward move': 'MOVE_FORWARD',
    'move backward': 'MOVE_BACKWARD',
    'move back': 'MOVE_BACKWARD',
    'go backward': 'MOVE_BACKWARD',
    'backward': 'MOVE_BACKWARD',
    'backward move': 'MOVE_BACKWARD',
    'move left': 'MOVE_LEFT',
    'left': 'MOVE_LEFT',
    'left move': 'MOVE_LEFT',
    'move right': 'MOVE_RIGHT',
    'right': 'MOVE_RIGHT',
    'right move': 'MOVE_RIGHT',
    'move up': 'MOVE_UP',
    'up': 'MOVE_UP',
    'up move': 'MOVE_UP',
    'move down': 'MOVE_DOWN',
    'down': 'MOVE_DOWN',
    'down move': 'MOVE_DOWN',
    'stop': 'MOVE_STOP',
    'stop moving': 'MOVE_STOP',
    'hold position': 'MOVE_STOP',
    'hold': 'MOVE_STOP',
    'move stop': 'MOVE_STOP',
  }

  const movementIntent = movement[normalized]
  if (movementIntent) return { status: 'command', command: { intent: movementIntent } }

  const binocularToggle =
    /^(?:(?:turn|switch|set)\s+)?(?:the\s+)?(?:binoculars|nazra|nazar)\s+(on|off)$/.exec(normalized)
    ?? /^(?:(?:turn|switch|set)\s+)?(on|off)\s+(?:the\s+)?(?:binoculars|nazra|nazar)$/.exec(normalized)
  if (binocularToggle) {
    return { status: 'command', command: { intent: 'TOGGLE_BINOCULARS', enabled: binocularToggle[1] === 'on' } }
  }

  const stopIntent = /^(?:stop|hold|hold position|pause|freeze|ruk|ruko|thamb|tham)$/.exec(normalized)
  if (stopIntent) return { status: 'command', command: { intent: 'MOVE_STOP' } }

  const targetMatch = /(?:^|\s)(?:target\s*[- ]?)?(?:t\s*)?0*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?=\s|$)/i.exec(normalized)
  if (!targetMatch) return { status: 'unrecognized' }

  const targetNumber = normalizeTargetNumber((targetMatch[1] ?? '').trim())
  if (targetNumber === null || !Number.isInteger(targetNumber) || targetNumber < 1) return { status: 'unrecognized' }

  const threatId = availableThreatIds.find((id) => {
    const match = /\d+/.exec(id)
    return match ? Number(match[0]) === targetNumber : false
  })
  if (!threatId) return { status: 'target-not-found', targetReference: `T${targetNumber}` }

  const targetToken = `t${targetNumber}`
  const targetReferenceText = targetMatch[0]?.trim() ?? ''
  const commandText = targetReferenceText
    ? normalized.replace(new RegExp(escapeRegex(targetReferenceText), 'gi'), ` ${targetToken} `).replace(/\s+/g, ' ').trim()
    : normalized

  const selectPatterns = [
    `^select\\s+${escapeRegex(targetToken)}$`,
    `^choose\\s+${escapeRegex(targetToken)}$`,
    `^show\\s+classification\\s+for\\s+${escapeRegex(targetToken)}$`,
    `^identify\\s+${escapeRegex(targetToken)}$`,
    `^inspect\\s+${escapeRegex(targetToken)}$`,
    `^look\\s+at\\s+${escapeRegex(targetToken)}$`,
    `^${escapeRegex(targetToken)}\\s+(?:select|choose|identify|inspect|look\\s+at)$`,
    `^${escapeRegex(targetToken)}$`,
  ]
  if (selectPatterns.some((pattern) => new RegExp(pattern, 'i').test(commandText))) {
    return { status: 'command', command: { intent: 'SELECT_TARGET', threatId } }
  }

  const detectPatterns = [
    `^(?:detect|scan|spot)\\s+${escapeRegex(targetToken)}$`,
    `^${escapeRegex(targetToken)}\\s+(?:detect|scan|spot)$`,
  ]
  if (detectPatterns.some((pattern) => new RegExp(pattern, 'i').test(commandText))) {
    return { status: 'command', command: { intent: 'DETECT_TARGET', threatId } }
  }

  const classificationPatterns = [
    new RegExp(`^(?:classify|identify|mark)\\s+${escapeRegex(targetToken)}(?:\\s+(?:as\\s+)?(friendly|unknown|hostile|surveillance))?$`, 'i'),
    new RegExp(`^${escapeRegex(targetToken)}\\s+(?:as\\s+)?(friendly|unknown|hostile|surveillance)(?:\\s+(?:classify|mark))?$`, 'i'),
    new RegExp(`^${escapeRegex(targetToken)}\\s+(?:classify|mark)\\s+(?:as\\s+)?(friendly|unknown|hostile|surveillance)$`, 'i'),
  ]
  for (const pattern of classificationPatterns) {
    const match = pattern.exec(commandText)
    if (match) {
      const value = (match[1] ?? 'unknown').trim().toLowerCase()
      return { status: 'command', command: { intent: 'CLASSIFY_TARGET', threatId, classification: value || 'unknown' } }
    }
  }

  const prioritizedPatterns = [
    new RegExp(`^(?:prioritize|prioritise|set\\s+priority\\s+for)\\s+${escapeRegex(targetToken)}(?:\\s+(?:priority|level)?\\s*(high|medium|low)|\\s+to\\s*(high|medium|low))?$`, 'i'),
    new RegExp(`^${escapeRegex(targetToken)}\\s+(?:priority\\s+)?(?:set\\s+)?(?:for\\s+)?(high|medium|low)$`, 'i'),
  ]
  for (const pattern of prioritizedPatterns) {
    const match = pattern.exec(commandText)
    if (match) {
      const priorityValue = (match[1] ?? match[2] ?? '').trim()
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
  }

  const respondPatterns = [
    new RegExp(`^(?:engage|destroy|eliminate|neutralize|respond)\\s+${escapeRegex(targetToken)}$`, 'i'),
    new RegExp(`^${escapeRegex(targetToken)}\\s+(?:engage|respond)$`, 'i'),
    new RegExp(`^(?:respond|respond\\s+to)\\s+${escapeRegex(targetToken)}$`, 'i'),
  ]
  for (const pattern of respondPatterns) {
    if (pattern.test(commandText)) {
      return { status: 'command', command: { intent: 'RESPOND_TO_TARGET', threatId, response: 'engage' } }
    }
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
    examples: ['Move forward', 'Move backward', 'Move left', 'Move right', 'Move up', 'Move down', 'Stop', 'Aage', 'Ruk'],
  },
  {
    category: 'TARGET SELECTION',
    intents: ['SELECT_TARGET'],
    examples: ['Select T1', 'Select target one', 'T2 select karo', 'Target do select'],
  },
  {
    category: 'DETECTION',
    intents: ['DETECT_TARGET'],
    examples: ['Detect T1', 'Target one detect', 'T2 ko scan karo'],
  },
  {
    category: 'CLASSIFICATION',
    intents: ['CLASSIFY_TARGET'],
    examples: ['Classify T1', 'Classify T1 as hostile', 'T1 ko hostile mark karo'],
  },
  {
    category: 'PRIORITIZATION',
    intents: ['PRIORITIZE_TARGET'],
    examples: ['Prioritize T1', 'Prioritize T1 high', 'T1 priority set karo'],
  },
  {
    category: 'RESPONSE',
    intents: ['RESPOND_TO_TARGET'],
    examples: ['Engage T1', 'Respond to T1', 'T1 ko engage karo'],
  },
  {
    category: 'BINOCULARS',
    intents: ['TOGGLE_BINOCULARS'],
    examples: ['Binoculars on', 'Binoculars off', 'Turn binoculars on', 'Turn binoculars off', 'Nazra on', 'Binocular band'],
  },
]
