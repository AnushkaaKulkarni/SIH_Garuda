import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVRCommand } from '../lib/vr-commands.ts'

const threatIds = ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07']

test('normalizes target IDs and spoken ordinals to active threat IDs', () => {
  assert.deepEqual(parseVRCommand('Select T1', threatIds), {
    status: 'command',
    command: { intent: 'SELECT_TARGET', threatId: 'T-01' },
  })
  assert.deepEqual(parseVRCommand('target two', threatIds), {
    status: 'command',
    command: { intent: 'SELECT_TARGET', threatId: 'T-02' },
  })
  assert.deepEqual(parseVRCommand('detect target one', threatIds), {
    status: 'command',
    command: { intent: 'DETECT_TARGET', threatId: 'T-01' },
  })
})

test('parses movement and event-backed target actions', () => {
  assert.deepEqual(parseVRCommand('move ahead', threatIds), {
    status: 'command',
    command: { intent: 'MOVE_FORWARD' },
  })
  assert.deepEqual(parseVRCommand('up', threatIds), {
    status: 'command',
    command: { intent: 'MOVE_UP' },
  })
  assert.deepEqual(parseVRCommand('move down', threatIds), {
    status: 'command',
    command: { intent: 'MOVE_DOWN' },
  })
  assert.deepEqual(parseVRCommand('Classify T-03 as hostile', threatIds), {
    status: 'command',
    command: { intent: 'CLASSIFY_TARGET', threatId: 'T-03', classification: 'hostile' },
  })
  assert.deepEqual(parseVRCommand('prioritize T7', threatIds), {
    status: 'command',
    command: { intent: 'PRIORITIZE_TARGET', threatId: 'T-07' },
  })
  assert.deepEqual(parseVRCommand('engage T1', threatIds), {
    status: 'command',
    command: { intent: 'RESPOND_TO_TARGET', threatId: 'T-01', response: 'engage' },
  })
})

test('reports unknown targets and leaves invalid classification validation to the action layer', () => {
  assert.deepEqual(parseVRCommand('select T9', threatIds), {
    status: 'target-not-found',
    targetReference: 'T9',
  })
  assert.deepEqual(parseVRCommand('classify T1 as surveillance', threatIds), {
    status: 'command',
    command: { intent: 'CLASSIFY_TARGET', threatId: 'T-01', classification: 'surveillance' },
  })
  assert.equal(parseVRCommand('unrelated words', threatIds).status, 'unrecognized')
})
