import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { getLatestPhoneFrame, getPhoneEyeAspect, isPhoneFrameFresh, setLatestPhoneFrame, type PhoneOrientationFrame } from '../lib/phone-control.ts'
import { sensorQuaternion } from '../lib/phone-orientation.ts'
import { getTrainingNavigation } from '../lib/training-navigation.ts'

const frame = (updatedAt: number, changes: Partial<PhoneOrientationFrame> = {}): PhoneOrientationFrame => ({
  alpha: 0,
  beta: 0,
  gamma: 0,
  screenAngle: 0,
  updatedAt,
  ...changes,
})

test('VR guide navigation preserves scenario, difficulty, attack mode, and VR-ready mode', () => {
  const navigation = getTrainingNavigation('himalayan-shield', 'Expert', 'mixed')
  assert.equal(navigation.briefingHref, '/soldier/training/himalayan-shield/briefing?difficulty=Expert&attackMode=mixed')
  assert.equal(navigation.guideHref, '/soldier/training/himalayan-shield/guide?difficulty=Expert&attackMode=mixed')
  assert.equal(navigation.desktopSimulationHref, '/soldier/training/himalayan-shield/simulation?difficulty=Expert&attackMode=mixed')
  assert.equal(navigation.vrSimulationHref, '/soldier/training/himalayan-shield/simulation?difficulty=Expert&attackMode=mixed&mode=vr')
})

test('phone-matched projection uses the aspect ratio of one stereo eye', () => {
  assert.equal(getPhoneEyeAspect(frame(1, { viewportWidth: 2340, viewportHeight: 1080, stereo: true })), 2340 / 1080 / 2)
  assert.equal(getPhoneEyeAspect(frame(1, { viewportWidth: 1920, viewportHeight: 1080, stereo: false })), 1920 / 1080)
  assert.equal(getPhoneEyeAspect(frame(1)), null)
})

test('stale and future orientation frames are rejected and an older frame cannot overwrite a newer one', () => {
  assert.equal(isPhoneFrameFresh(frame(500), 1000), true)
  assert.equal(isPhoneFrameFresh(frame(0), 1501), false)
  assert.equal(isPhoneFrameFresh(frame(1001), 1000), false)
  setLatestPhoneFrame(null)
  setLatestPhoneFrame(frame(20))
  setLatestPhoneFrame(frame(19, { alpha: 90 }))
  assert.equal(getLatestPhoneFrame()?.alpha, 0)
  setLatestPhoneFrame(null)
})

test('phone sensor mapping returns normalized camera rotations for both landscape directions', () => {
  const left = sensorQuaternion(frame(1, { alpha: 38, beta: 12, gamma: -9, screenAngle: 90 }))
  const right = sensorQuaternion(frame(2, { alpha: 38, beta: 12, gamma: -9, screenAngle: -90 }))
  assert.ok(Math.abs(left.length() - 1) < 1e-10)
  assert.ok(Math.abs(right.length() - 1) < 1e-10)
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(left).distanceTo(new THREE.Vector3(0, 1, 0).applyQuaternion(right)) > 0.1)
  const yaw = sensorQuaternion(frame(3, { alpha: 90 }))
  assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(yaw).distanceTo(new THREE.Vector3(0, 0, -1).applyQuaternion(left)) > 0.1)
})
