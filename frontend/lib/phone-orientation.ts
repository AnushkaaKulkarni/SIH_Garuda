import * as THREE from 'three'
import type { PhoneOrientationFrame } from './phone-control'

const radians = Math.PI / 180
const cameraCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

/** Maps DeviceOrientation angles into Three.js camera space, then compensates for screen rotation. */
export function sensorQuaternion(frame: PhoneOrientationFrame) {
  const deviceEuler = new THREE.Euler(
    frame.beta * radians,
    frame.alpha * radians,
    -frame.gamma * radians,
    'YXZ',
  )
  const screenCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -frame.screenAngle * radians,
  )
  return new THREE.Quaternion().setFromEuler(deviceEuler)
    .multiply(cameraCorrection)
    .multiply(screenCorrection)
}
