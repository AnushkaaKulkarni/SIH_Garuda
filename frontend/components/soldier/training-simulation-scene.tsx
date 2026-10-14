'use client'

import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { XRStore } from '@react-three/xr'
import * as THREE from 'three'
import { StereoEffect } from 'three/addons/effects/StereoEffect.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { getLatestPhoneFrame, getPhoneEyeAspect, isPhoneFrameFresh } from '@/lib/phone-control'
import { sensorQuaternion } from '@/lib/phone-orientation'

const TrainingXRLayer = lazy(() => import('./training-xr-layer').then((module) => ({ default: module.TrainingXRLayer })))

export type SimulationContact = {
  id: string
  type: string
  attackGroupId?: string
  detected: boolean
  selected: boolean
  position: [number, number, number]
  classification?: 'Friendly' | 'Unknown' | 'Hostile'
  eventCue?: string
  cueHypothetical?: boolean
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
}

type TrainingSimulationSceneProps = {
  contacts: SimulationContact[]
  terrain: string
  time: string
  visibility: string
  himalayanVisuals?: boolean
  xrStore?: XRStore
  xrActive?: boolean
  playbackSeconds?: number
  missionStartedAt?: number
  onThreatDetected?: (threatId: string) => void
  phoneControlEnabled?: boolean
  phoneMatchedView?: boolean
  phoneRecenterKey?: number
  mobileOptimized?: boolean
  mobileStereo?: boolean
}

type OrbitControlHandle = OrbitControlsImpl

function SceneLabel({
  text,
  position,
  color,
  background = 'rgba(5, 12, 16, 0.88)',
  width = 5.2,
  opacity = 1,
}: {
  text: string
  position: [number, number, number]
  color: string
  background?: string
  width?: number
  opacity?: number
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 96
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = background
      context.strokeStyle = color
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(3, 3, 634, 90, 10)
      context.fill()
      context.stroke()
      context.fillStyle = '#edf6f5'
      context.font = '700 31px ui-monospace, monospace'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, 320, 48, 600)
    }
    const labelTexture = new THREE.CanvasTexture(canvas)
    labelTexture.colorSpace = THREE.SRGBColorSpace
    return labelTexture
  }, [background, color, text])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite position={position} scale={[width, width * 0.15, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} opacity={opacity} />
    </sprite>
  )
}

function Snowfall() {
  const geometry = useMemo(() => {
    const random = seededRandom(0x48a1a)
    const positions = new Float32Array(180 * 3)
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = random() * 96 - 48
      positions[index + 1] = random() * 28 + 1
      positions[index + 2] = random() * 96 - 48
    }
    const points = new THREE.BufferGeometry()
    points.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return points
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, delta) => {
    const positions = geometry.attributes.position.array as Float32Array
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] += delta * 0.035
      if (positions[index] > 48) positions[index] = -48
      positions[index + 1] -= delta * 0.42
      if (positions[index + 1] < -0.5) {
        positions[index + 1] = 29
        positions[index] = positions[index] - 4
      }
    }
    geometry.attributes.position.needsUpdate = true
  })

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={1}>
      <pointsMaterial color="#e8f1f3" size={0.09} transparent opacity={0.3} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function Drone({
  contact,
  selected,
  playbackSeconds,
  missionStartedAt,
  onThreatDetected,
}: {
  contact: SimulationContact
  selected: boolean
  playbackSeconds?: number
  missionStartedAt?: number
  onThreatDetected?: (threatId: string) => void
}) {
  const body = useRef<THREE.Group>(null)
  const rotors = useRef<THREE.Group[]>([])
  const motion = contact.motion ?? {
    amplitude: [1.25, 1.1] as [number, number],
    frequency: [0.24, 0.21] as [number, number],
    phase: contact.position[0],
    verticalAmplitude: 0.16,
    verticalFrequency: 1.7,
    rotationAmplitude: 0.16,
  }
  const route = useMemo(
    () => motion.waypoints?.length
      ? new THREE.CatmullRomCurve3(motion.waypoints.map((point) => new THREE.Vector3(...point)), true, 'catmullrom', 0.35)
      : null,
    [motion.waypoints],
  )
  const routeLength = route?.getLength() ?? 0
  const cueColor = contact.cueHypothetical
    ? '#ba8cff'
    : contact.eventCue?.includes('MISSED') ? '#f06b5e'
      : contact.eventCue?.includes('RESPONSE') || contact.eventCue?.includes('NEUTRALIZED') ? '#61d7b5'
        : contact.eventCue ? '#f4bb61' : '#58d7b3'

  useFrame(({ clock }, delta) => {
    const elapsedSeconds = missionStartedAt !== undefined
      ? Math.max(0, (Date.now() - missionStartedAt) / 1000)
      : playbackSeconds ?? clock.elapsedTime
    const missionTime = elapsedSeconds - (motion.spawnTimeSeconds ?? 0)
    const elapsed = Math.max(0, missionTime) + motion.phase
    if (body.current) {
      if (route && routeLength > 0) {
        const routeSpeed = ((motion.speed ?? 0.8) * 0.08)
        const progress = missionTime <= 0
          ? 0
          : ((missionTime * routeSpeed) % routeLength) / routeLength
        const point = route.getPointAt(progress)
        const tangent = route.getTangentAt(progress)
        const bank = THREE.MathUtils.clamp(-tangent.x * 0.3, -0.32, 0.32)
        const driftX = Math.sin(elapsed * (motion.frequency[0] ?? 0.3) + motion.phase) * (motion.amplitude[0] ?? 1) * 0.25
        const driftZ = Math.cos(elapsed * (motion.frequency[1] ?? 0.2) + motion.phase) * (motion.amplitude[1] ?? 1) * 0.25
        const lift = Math.sin(elapsed * (motion.verticalFrequency ?? 1.7) + motion.phase) * (motion.verticalAmplitude ?? 0.9)
        body.current.position.set(
          point.x + driftX,
          point.y + lift,
          point.z + driftZ,
        )
        body.current.rotation.set(
          Math.sin(elapsed * 0.7 + motion.phase) * 0.05,
          Math.atan2(tangent.x, tangent.z),
          bank + Math.sin(elapsed * 0.5 + motion.phase) * (motion.rotationAmplitude ?? 0.16) * 0.3,
        )
      } else {
        body.current.position.set(
          contact.position[0] + Math.sin(elapsed * motion.frequency[0]) * motion.amplitude[0],
          contact.position[1] + Math.sin(elapsed * (motion.verticalFrequency ?? 1.7)) * (motion.verticalAmplitude ?? 0.16) + Math.cos(elapsed * 0.8 + motion.phase) * 0.8,
          contact.position[2] + Math.cos(elapsed * motion.frequency[1]) * motion.amplitude[1],
        )
        body.current.rotation.y = Math.sin(elapsed * motion.frequency[0]) * (motion.rotationAmplitude ?? 0.16)
      }
    }
    for (const rotor of rotors.current) rotor.rotation.y += 6 * delta
  })

  const rotorPositions: [number, number, number][] = [
    [-0.43, 0.055, -0.38],
    [0.43, 0.055, -0.38],
    [-0.43, 0.055, 0.38],
    [0.43, 0.055, 0.38],
  ]

  return (
    <group
      ref={body}
      scale={0.68}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
      }}
    >
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onThreatDetected?.(contact.id)
        }}
      >
        <sphereGeometry args={[0.72, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.12, 0.42]} />
        <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.075, -0.015]} castShadow>
        <boxGeometry args={[0.22, 0.045, 0.25]} />
        <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
      </mesh>
      {contact.classification && (
        <mesh position={[0, 0.101, -0.015]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.008, 0.08]} />
          <meshStandardMaterial
            color={
              contact.classification === 'Friendly'
                ? '#3f7553'
                : contact.classification === 'Hostile'
                  ? '#853f3b'
                  : '#9a7633'
            }
            metalness={0.08}
            roughness={0.76}
          />
        </mesh>
      )}
      {rotorPositions.map((position, index) => {
        const armX = position[0] * 0.52
        const armZ = position[2] * 0.52
        return (
        <group
          key={index}
          position={position}
          ref={(node) => {
            if (node) rotors.current[index] = node
          }}
        >
          <mesh
            position={[-position[0] * 0.52, -0.055, -position[2] * 0.52]}
            rotation={[0, Math.atan2(armZ, armX), 0]}
            castShadow
          >
            <boxGeometry args={[0.67, 0.045, 0.055]} />
            <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
          </mesh>
          <mesh position={[0, -0.015, 0]} castShadow>
            <cylinderGeometry args={[0.095, 0.11, 0.13, 12]} />
            <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
          </mesh>
          <mesh position={[0, 0.065, 0]}>
            <cylinderGeometry args={[0.055, 0.065, 0.045, 12]} />
            <meshStandardMaterial color="#77858a" metalness={0.72} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.59, 0.012, 0.035]} />
            <meshStandardMaterial color="#aab4b4" transparent opacity={0.48} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.59, 0.012, 0.035]} />
            <meshStandardMaterial color="#aab4b4" transparent opacity={0.48} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.145, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.34, 0.012, 5, 32]} />
            <meshStandardMaterial color="#64747a" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#a8b4b4" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[index % 2 === 0 ? -0.11 : 0.11, 0.015, 0]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshStandardMaterial color="#667276" metalness={0.38} roughness={0.48} />
          </mesh>
        </group>
        )
      })}
      <mesh position={[0, -0.11, 0.24]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.12, 10]} />
        <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
      </mesh>
      <mesh position={[0, -0.12, 0.31]}>
        <sphereGeometry args={[0.065, 12, 10]} />
        <meshStandardMaterial color="#17252a" metalness={0.28} roughness={0.15} />
      </mesh>
      <mesh position={[0, -0.12, 0.365]}>
        <sphereGeometry args={[0.027, 12, 10]} />
        <meshStandardMaterial color="#7db5c1" metalness={0.35} roughness={0.16} emissive="#234b58" emissiveIntensity={0.24} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.19, -0.15, -0.12]} rotation={[0, 0, side * -0.12]}>
          <cylinderGeometry args={[0.018, 0.018, 0.3, 6]} />
          <meshStandardMaterial color="#263137" metalness={0.62} roughness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, 0.13, -0.25]}>
        <sphereGeometry args={[0.024, 8, 6]} />
        <meshStandardMaterial color="#f4f0dd" emissive="#f4f0dd" emissiveIntensity={0.9} />
      </mesh>
      <SceneLabel
        position={[0, 1.48, 0]}
        text={contact.id.match(/T-\d+$/)?.[0] ?? contact.id}
        color={selected ? '#f4bb61' : '#b5ccc7'}
        background={selected ? 'rgba(84, 47, 12, 0.9)' : 'rgba(5, 12, 16, 0.76)'}
        width={4.9}
        opacity={selected ? 1 : 0.86}
      />
      {contact.attackGroupId && <SceneLabel position={[0, 2.15, 0]} text={contact.attackGroupId} color="#74cbbb" width={5.2} opacity={0.9} />}
      {contact.eventCue && (
        <>
          <mesh position={[0, -0.23, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.78, 0.84, 48]} />
            <meshBasicMaterial color={cueColor} transparent opacity={contact.cueHypothetical ? 0.9 : 0.72} side={THREE.DoubleSide} />
          </mesh>
          <SceneLabel
            position={[0, 0.85, 0]}
            text={`${contact.cueHypothetical ? 'WHAT-IF / ' : ''}${contact.eventCue}`}
            color={cueColor}
            background={contact.cueHypothetical ? 'rgba(82, 54, 122, 0.94)' : 'rgba(18, 34, 38, 0.94)'}
          />
        </>
      )}
    </group>
  )
}

type TerrainKind = 'highlands' | 'desert' | 'coastal' | 'urban' | 'industrial' | 'border' | 'rural'
type SceneTree = { x: number; z: number; height: number; rotation: number }

function terrainKind(terrain: string): TerrainKind {
  const value = terrain.toLowerCase()
  if (/mountain|highland|altitude|ridge|valley|himalaya/.test(value)) return 'highlands'
  if (/desert|dry|arid/.test(value)) return 'desert'
  if (/coast|shore|maritime/.test(value)) return 'coastal'
  if (/urban|city/.test(value)) return 'urban'
  if (/industrial|corridor/.test(value)) return 'industrial'
  if (/border|frontier/.test(value)) return 'border'
  return 'rural'
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function groundHeight(kind: TerrainKind, x: number, z: number) {
  const edge = THREE.MathUtils.clamp((Math.abs(x) - 7) / 28, 0, 1)
  const distance = THREE.MathUtils.clamp((-z - 3) / 42, 0, 1)
  if (kind === 'highlands') {
    const flank = Math.max(edge, distance * 0.78)
    const ridges = Math.abs(Math.sin(x * 0.14 + z * 0.045) * Math.cos(z * 0.1))
    const valleyRoll = Math.max(0, Math.sin(x * 0.16 + z * 0.07) * Math.cos(z * 0.13)) * 0.42
    return 0.12 + flank * (0.35 + ridges * 2.1) + valleyRoll
  }
  if (kind === 'desert') return 0.08 + Math.max(0, Math.sin(x * 0.13 + z * 0.08)) * 0.48
    + Math.max(0, Math.sin(z * 0.24 - x * 0.035)) * 0.18
  if (kind === 'coastal') return 0.08 + Math.sin(x * 0.06 + z * 0.035) * 0.08
  if (kind === 'rural' || kind === 'border') return 0.06 + Math.sin(x * 0.17) * Math.cos(z * 0.11) * 0.13
  return 0.04 + Math.sin(x * 0.12 + z * 0.09) * 0.035
}

function TerrainTrees({ kind, trees }: { kind: TerrainKind; trees: SceneTree[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const lowerCanopies = useRef<THREE.InstancedMesh>(null)
  const upperCanopies = useRef<THREE.InstancedMesh>(null)
  const leaves = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const palm = kind === 'coastal'
  const shrub = kind === 'desert'
  const leafy = kind === 'rural' || kind === 'border'

  useEffect(() => {
    const canopyTrees = palm ? trees.length * 5 : trees.length
    if (trunks.current) {
      trees.forEach((tree, index) => {
        const base = groundHeight(kind, tree.x, tree.z) - 0.45
        dummy.position.set(tree.x, base + tree.height * 0.36, tree.z)
        dummy.rotation.set(0, tree.rotation, 0)
        dummy.scale.set(1, tree.height, 1)
        dummy.updateMatrix()
        trunks.current?.setMatrixAt(index, dummy.matrix)

        dummy.position.set(tree.x, base + tree.height * (palm ? 0.93 : 0.72), tree.z)
        dummy.scale.set(tree.height * (palm ? 0.58 : 0.72), tree.height * (palm ? 0.34 : 0.58), tree.height * (palm ? 0.58 : 0.72))
        dummy.rotation.set(0, tree.rotation, 0)
        dummy.updateMatrix()
        lowerCanopies.current?.setMatrixAt(index, dummy.matrix)

        dummy.position.set(tree.x, base + tree.height * 1.02, tree.z)
        dummy.scale.set(tree.height * 0.48, tree.height * 0.4, tree.height * 0.48)
        dummy.updateMatrix()
        upperCanopies.current?.setMatrixAt(index, dummy.matrix)
      })
      trunks.current.instanceMatrix.needsUpdate = true
      if (lowerCanopies.current) lowerCanopies.current.instanceMatrix.needsUpdate = true
      if (upperCanopies.current) upperCanopies.current.instanceMatrix.needsUpdate = true
    }
    if (palm) {
      const leavesMesh = leaves.current
      if (!leavesMesh) return
      trees.forEach((tree, index) => {
        for (let leaf = 0; leaf < 5; leaf += 1) {
          const angle = (leaf / 5) * Math.PI * 2 + tree.rotation
          dummy.position.set(
            tree.x + Math.cos(angle) * tree.height * 0.34,
            groundHeight(kind, tree.x, tree.z) - 0.45 + tree.height * 1.03,
            tree.z + Math.sin(angle) * tree.height * 0.34,
          )
          dummy.rotation.set(0.8, -angle, Math.cos(angle) * 0.72)
          dummy.scale.set(tree.height * 0.52, tree.height * 0.86, tree.height * 0.5)
          dummy.updateMatrix()
          leavesMesh.setMatrixAt(index * 5 + leaf, dummy.matrix)
        }
      })
      leavesMesh.instanceMatrix.needsUpdate = true
    }
    for (const mesh of [trunks.current, lowerCanopies.current, upperCanopies.current, leaves.current]) {
      if (mesh) mesh.computeBoundingSphere()
    }
  }, [dummy, kind, palm, trees])

  if (!trees.length) return null
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.16, 1, 6]} />
        <meshStandardMaterial color={palm ? '#756047' : shrub ? '#8a714c' : '#51483a'} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={lowerCanopies} args={[undefined, undefined, trees.length]} castShadow>
        {leafy ? <dodecahedronGeometry args={[0.62, 0]} /> : <coneGeometry args={[0.58, 1, 7]} />}
        <meshStandardMaterial color={palm ? '#617449' : shrub ? '#89834f' : leafy ? '#4c6844' : '#315347'} roughness={1} />
      </instancedMesh>
      {!palm && !shrub && !leafy && (
        <instancedMesh ref={upperCanopies} args={[undefined, undefined, trees.length]} castShadow>
          <coneGeometry args={[0.44, 1, 7]} />
          <meshStandardMaterial color="#47634a" roughness={1} />
        </instancedMesh>
      )}
      {palm && (
        <instancedMesh ref={leaves} args={[undefined, undefined, trees.length * 5]} castShadow>
          <coneGeometry args={[0.22, 1, 5]} />
          <meshStandardMaterial color="#687b4a" roughness={1} />
        </instancedMesh>
      )}
    </>
  )
}

function HimalayanTerrainDetails({ seed }: { seed: number }) {
  const rocks = useRef<THREE.InstancedMesh>(null)
  const snowPatches = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const details = useMemo(() => {
    const random = seededRandom(seed ^ 0x6d2b79f5)
    const rockData = Array.from({ length: 20 }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1
      let x = side * (12 + random() * 35)
      const z = -43 + random() * 84
      if (Math.abs(x) < 17 && z > -5 && z < 21) x = side * (18 + random() * 6)
      return {
        x,
        z,
        radius: index % 6 === 0 ? 0.9 + random() * 0.6 : 0.28 + random() * 0.58,
        height: index % 6 === 0 ? 0.55 + random() * 0.35 : 0.2 + random() * 0.42,
        rotation: random() * Math.PI * 2,
        tint: 0.72 + random() * 0.28,
      }
    })
    const patchData = Array.from({ length: 6 }, (_, index) => ({
      x: (index % 2 === 0 ? -1 : 1) * (21 + random() * 13),
      z: -29 + random() * 52,
      width: 1.1 + random() * 1.6,
      depth: 0.7 + random() * 1.3,
      rotation: (random() - 0.5) * 0.7,
    }))
    return { rockData, patchData }
  }, [seed])

  useEffect(() => {
    if (rocks.current) {
      details.rockData.forEach((rock, index) => {
        const base = groundHeight('highlands', rock.x, rock.z) - 0.45
        dummy.position.set(rock.x, base + rock.height, rock.z)
        dummy.rotation.set(rock.rotation * 0.18, rock.rotation, rock.rotation * 0.13)
        dummy.scale.set(rock.radius, rock.height, rock.radius * (0.65 + rock.tint * 0.25))
        dummy.updateMatrix()
        rocks.current?.setMatrixAt(index, dummy.matrix)
        rocks.current?.setColorAt(index, new THREE.Color('#77746d').multiplyScalar(rock.tint))
      })
      rocks.current.instanceMatrix.needsUpdate = true
      if (rocks.current.instanceColor) rocks.current.instanceColor.needsUpdate = true
      rocks.current.computeBoundingSphere()
    }
    if (snowPatches.current) {
      details.patchData.forEach((patch, index) => {
        const base = groundHeight('highlands', patch.x, patch.z) - 0.45
        dummy.position.set(patch.x, base + 0.04, patch.z)
        dummy.rotation.set(-0.08, patch.rotation, 0)
        dummy.scale.set(patch.width, 0.055, patch.depth)
        dummy.updateMatrix()
        snowPatches.current?.setMatrixAt(index, dummy.matrix)
      })
      snowPatches.current.instanceMatrix.needsUpdate = true
      snowPatches.current.computeBoundingSphere()
    }
  }, [details, dummy])

  return (
    <>
      <instancedMesh ref={rocks} args={[undefined, undefined, details.rockData.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#77746d" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={snowPatches} args={[undefined, undefined, details.patchData.length]} receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#dfeaf0" roughness={1} flatShading />
      </instancedMesh>
    </>
  )
}

function HimalayanPeak({ seed, width, height }: { seed: number; width: number; height: number }) {
  const geometry = useMemo(() => {
    const random = seededRandom(seed)
    const segmentCount = 7
    const ringSettings = [
      { radius: width, elevation: 0.02 },
      { radius: width * 0.68, elevation: 0.36 },
      { radius: width * 0.34, elevation: 0.76 },
    ]
    const rings: [number, number, number][][] = ringSettings.map((ring) => Array.from({ length: segmentCount }, (_, index) => {
      const angle = (index / segmentCount) * Math.PI * 2 + (random() - 0.5) * 0.16
      const radius = ring.radius * (0.84 + random() * 0.3)
      return [
        Math.cos(angle) * radius + (random() - 0.5) * width * 0.12,
        height * ring.elevation * (0.9 + random() * 0.2),
        Math.sin(angle) * radius + (random() - 0.5) * width * 0.12,
      ] as [number, number, number]
    }))
    const apex: [number, number, number] = [(random() - 0.5) * width * 0.16, height, (random() - 0.5) * width * 0.16]
    const positions: number[] = []
    const colors: number[] = []
    const rocks = ['#4c565a', '#606a6d', '#778084'].map((color) => new THREE.Color(color))
    const snow = new THREE.Color('#e5edf1')
    const addTriangle = (triangle: [number, number, number][]) => {
      const rock = rocks[Math.floor(random() * rocks.length)]
      for (const [x, y, z] of triangle) {
        const elevation = y / height
        const slopeVariation = Math.sin(x * 0.8 + z * 0.45 + seed) * 0.09
        const coverage = THREE.MathUtils.smoothstep(elevation + slopeVariation, 0.6 + random() * 0.1, 0.94)
        const faceColor = rock.clone().lerp(snow, coverage)
        positions.push(x, y, z)
        colors.push(faceColor.r, faceColor.g, faceColor.b)
      }
    }

    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      for (let index = 0; index < segmentCount; index += 1) {
        const next = (index + 1) % segmentCount
        const lower = rings[ringIndex]
        const upper = rings[ringIndex + 1]
        const firstDiagonal = random() > 0.5
        if (firstDiagonal) {
          addTriangle([lower[index], upper[index], lower[next]])
          addTriangle([lower[next], upper[index], upper[next]])
        } else {
          addTriangle([lower[index], upper[index], upper[next]])
          addTriangle([lower[index], upper[next], lower[next]])
        }
      }
    }
    const summit = rings[rings.length - 1]
    for (let index = 0; index < segmentCount; index += 1) {
      addTriangle([summit[index], apex, summit[(index + 1) % segmentCount]])
    }
    const mesh = new THREE.BufferGeometry()
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    mesh.computeVertexNormals()
    return mesh
  }, [height, seed, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} flatShading side={THREE.DoubleSide} />
    </mesh>
  )
}

function MountainRange({ z, height, seed, color }: { z: number; height: number; seed: number; color: string }) {
  const geometry = useMemo(() => {
    const random = seededRandom(seed)
    const segments = 26
    const width = 138
    const base = -0.25
    const points = Array.from({ length: segments + 1 }, (_, index) => ({
      x: -width / 2 + (index / segments) * width,
      y: base + height * (0.24 + Math.pow(random(), 0.72) * 0.84),
    }))
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const snowColor = new THREE.Color(color)
    const rockPalette = ['#4d5658', '#626c70', '#748084'].map((value) => new THREE.Color(value))
    for (let index = 0; index < segments; index += 1) {
      const start = positions.length / 3
      const left = points[index]
      const right = points[index + 1]
      const ridge = Math.min(left.y, right.y) + height * (0.08 + random() * 0.2)
      const heights = [base, left.y, ridge, right.y, base]
      positions.push(left.x, base, 0, left.x, left.y, 0, (left.x + right.x) / 2, ridge, 0, right.x, right.y, 0, right.x, base, 0)
      const rockColor = rockPalette[Math.floor(random() * rockPalette.length)]
      for (const vertexHeight of heights) {
        const elevation = THREE.MathUtils.clamp((vertexHeight - base) / height, 0, 1)
        const snowCoverage = THREE.MathUtils.smoothstep(elevation, 0.58 + random() * 0.08, 0.82)
        const vertexColor = rockColor.clone().lerp(snowColor, snowCoverage)
        colors.push(vertexColor.r, vertexColor.g, vertexColor.b)
      }
      indices.push(start, start + 1, start + 2, start + 2, start + 3, start + 4, start, start + 2, start + 4)
    }
    const mesh = new THREE.BufferGeometry()
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    mesh.setIndex(indices)
    mesh.computeVertexNormals()
    return mesh
  }, [color, height, seed])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, 0, z]} castShadow>
      <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Road({ points, width, color, kind }: { points: [number, number][]; width: number; color: string; kind: TerrainKind }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
    const samples = curve.getPoints(48)
    const positions: number[] = []
    const indices: number[] = []
    samples.forEach((point, index) => {
      const tangent = curve.getTangent(index / (samples.length - 1))
      const offsetX = -tangent.z * width / 2
      const offsetZ = tangent.x * width / 2
      positions.push(point.x + offsetX, -0.45 + groundHeight(kind, point.x + offsetX, point.z + offsetZ) + 0.045, point.z + offsetZ)
      positions.push(point.x - offsetX, -0.45 + groundHeight(kind, point.x - offsetX, point.z - offsetZ) + 0.045, point.z - offsetZ)
      if (index < samples.length - 1) {
        const vertex = index * 2
        indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3)
      }
    })
    const mesh = new THREE.BufferGeometry()
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    mesh.setIndex(indices)
    mesh.computeVertexNormals()
    return mesh
  }, [kind, points, width])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} />
    </mesh>
  )
}

function DunePatch({
  x,
  z,
  width,
  depth,
  height,
  phase,
  color,
}: {
  x: number
  z: number
  width: number
  depth: number
  height: number
  phase: number
  color: string
}) {
  const geometry = useMemo(() => {
    const mesh = new THREE.PlaneGeometry(width, depth, 40, 16)
    const vertices = mesh.attributes.position
    for (let index = 0; index < vertices.count; index += 1) {
      const localX = vertices.getX(index)
      const worldZ = -vertices.getY(index)
      const ridge = Math.sin(localX * 0.13 + phase) * 1.8 + Math.sin(localX * 0.045 - phase) * 1.2
      const crossSection = (worldZ - ridge) / (depth * 0.28)
      const endFade = THREE.MathUtils.smoothstep(width / 2 - Math.abs(localX), 0, 5)
      const mound = height * Math.exp(-crossSection * crossSection) * endFade
      vertices.setZ(index, mound)
    }
    mesh.computeVertexNormals()
    return mesh
  }, [depth, height, phase, width])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[x, -0.28, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} flatShading />
    </mesh>
  )
}

type MovementIntent = 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT' | 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_STOP'

function CameraRig({
  phoneControlEnabled,
  phoneMatchedView,
  phoneRecenterKey,
  orbitControlsRef,
}: {
  phoneControlEnabled: boolean
  phoneMatchedView: boolean
  phoneRecenterKey: number
  orbitControlsRef: React.RefObject<OrbitControlHandle | null>
}) {
  const { camera, gl, size } = useThree()
  const perspectiveCamera = camera as THREE.PerspectiveCamera
  const phoneControlEnabledRef = useRef(phoneControlEnabled)
  phoneControlEnabledRef.current = phoneControlEnabled
  const phoneCalibration = useRef<{
    enabled: boolean
    recenterKey: number
    neutral: THREE.Quaternion | null
    cameraBase: THREE.Quaternion | null
    desktopPose: { position: THREE.Vector3; quaternion: THREE.Quaternion; target: THREE.Vector3 } | null
  }>({ enabled: false, recenterKey: -1, neutral: null, cameraBase: null, desktopPose: null })
  const keys = useRef({ forward: false, backward: false, left: false, right: false })
  const voiceMovement = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false })
  const defaultFov = useRef(perspectiveCamera.fov)
  const binocularActive = useRef(false)
  const activeMoveIntent = useRef<MovementIntent | null>(null)
  const matchedAspect = useRef<number | null>(null)
  const matchedViewActive = useRef(false)

  const clearVoiceMovement = () => {
    voiceMovement.current.forward = false
    voiceMovement.current.backward = false
    voiceMovement.current.left = false
    voiceMovement.current.right = false
    voiceMovement.current.up = false
    voiceMovement.current.down = false
  }

  const applyVoiceMovement = (intent: MovementIntent) => {
    if (intent === 'MOVE_STOP') {
      clearVoiceMovement()
      keys.current.forward = false
      keys.current.backward = false
      keys.current.left = false
      keys.current.right = false
      activeMoveIntent.current = null
      return
    }

    clearVoiceMovement()
    activeMoveIntent.current = intent

    const mapping: Partial<Record<MovementIntent, keyof typeof voiceMovement.current>> = {
      MOVE_FORWARD: 'forward',
      MOVE_BACKWARD: 'backward',
      MOVE_LEFT: 'left',
      MOVE_RIGHT: 'right',
      MOVE_UP: 'up',
      MOVE_DOWN: 'down',
    }

    const axis = mapping[intent]
    if (axis) {
      voiceMovement.current[axis] = true
    }
  }

  const applyBinocularMode = (enabled: boolean) => {
    if (phoneControlEnabledRef.current) return
    binocularActive.current = enabled
    const targetFov = enabled ? 22 : defaultFov.current
    perspectiveCamera.fov = THREE.MathUtils.lerp(perspectiveCamera.fov, targetFov, 0.18)
    perspectiveCamera.updateProjectionMatrix()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phoneControlEnabledRef.current) return
      if (event.key.toLowerCase() === 'w') keys.current.forward = true
      if (event.key.toLowerCase() === 's') keys.current.backward = true
      if (event.key.toLowerCase() === 'a') keys.current.left = true
      if (event.key.toLowerCase() === 'd') keys.current.right = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'w') keys.current.forward = false
      if (event.key.toLowerCase() === 's') keys.current.backward = false
      if (event.key.toLowerCase() === 'a') keys.current.left = false
      if (event.key.toLowerCase() === 'd') keys.current.right = false
    }
    const onVoiceMove = (event: Event) => {
      const customEvent = event as CustomEvent<{ intent: MovementIntent }>
      if (customEvent.detail) applyVoiceMovement(customEvent.detail.intent)
    }
    const onBinocularToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>
      if (customEvent.detail) applyBinocularMode(customEvent.detail.enabled)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('vr-move-intent', onVoiceMove)
    window.addEventListener('vr-binocular-intent', onBinocularToggle)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('vr-move-intent', onVoiceMove)
      window.removeEventListener('vr-binocular-intent', onBinocularToggle)
    }
  }, [])

  useEffect(() => {
    if (!phoneControlEnabled) return
    keys.current = { forward: false, backward: false, left: false, right: false }
    activeMoveIntent.current = null
  }, [phoneControlEnabled])

  useEffect(() => {
    const calibration = phoneCalibration.current
    if (phoneControlEnabled) {
      if (!calibration.enabled) {
        calibration.desktopPose = {
          position: perspectiveCamera.position.clone(),
          quaternion: perspectiveCamera.quaternion.clone(),
          target: orbitControlsRef.current?.target.clone() ?? new THREE.Vector3(0, 3, -8),
        }
        const phoneTarget = new THREE.Vector3(0, 3, -8)
        perspectiveCamera.position.set(25, 25, 37)
        perspectiveCamera.lookAt(phoneTarget)
        if (orbitControlsRef.current) {
          orbitControlsRef.current.target.copy(phoneTarget)
          orbitControlsRef.current.update()
        }
        calibration.cameraBase = perspectiveCamera.quaternion.clone()
      }
      const frame = getLatestPhoneFrame()
      if (frame && isPhoneFrameFresh(frame, Date.now()) &&
        (!calibration.enabled || calibration.recenterKey !== phoneRecenterKey)) {
        calibration.cameraBase ??= perspectiveCamera.quaternion.clone()
        calibration.neutral = sensorQuaternion(frame)
        calibration.recenterKey = phoneRecenterKey
      }
      calibration.enabled = true
      return
    }

    if (calibration.enabled && calibration.desktopPose) {
      perspectiveCamera.position.copy(calibration.desktopPose.position)
      perspectiveCamera.quaternion.copy(calibration.desktopPose.quaternion)
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(calibration.desktopPose.target)
        orbitControlsRef.current.update()
      }
    }
    calibration.enabled = false
    calibration.neutral = null
    calibration.cameraBase = null
    calibration.desktopPose = null
  }, [phoneControlEnabled, phoneRecenterKey, perspectiveCamera, orbitControlsRef])

  useFrame((_, delta) => {
    const calibration = phoneCalibration.current
    const phoneFrame = phoneControlEnabled ? getLatestPhoneFrame() : null
    if (phoneControlEnabled && phoneFrame && isPhoneFrameFresh(phoneFrame, Date.now())) {
      if (!calibration.neutral || !calibration.cameraBase) {
        calibration.neutral = sensorQuaternion(phoneFrame)
        calibration.cameraBase ??= perspectiveCamera.quaternion.clone()
      }
      const relative = sensorQuaternion(phoneFrame).multiply(calibration.neutral.clone().invert())
      const target = relative.multiply(calibration.cameraBase)
      perspectiveCamera.quaternion.slerp(target, 1 - Math.exp(-delta / 0.06))
    }

    if (phoneMatchedView && phoneControlEnabled) {
      matchedViewActive.current = true
      const eyeAspect = phoneFrame ? getPhoneEyeAspect(phoneFrame) : null
      if (eyeAspect) matchedAspect.current = eyeAspect
      const aspect = matchedAspect.current ?? size.width / Math.max(1, size.height)
      const viewportWidth = Math.min(size.width, size.height * aspect)
      const viewportX = (size.width - viewportWidth) / 2
      if (Math.abs(perspectiveCamera.aspect - aspect) > 0.001) {
        perspectiveCamera.aspect = aspect
        perspectiveCamera.updateProjectionMatrix()
      }
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
      gl.setClearColor(0x000000, 1)
      gl.clear(true, true, true)
      gl.setScissor(viewportX, 0, viewportWidth, size.height)
      gl.setViewport(viewportX, 0, viewportWidth, size.height)
      gl.setScissorTest(true)
    } else if (matchedViewActive.current) {
      matchedViewActive.current = false
      matchedAspect.current = null
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
      const aspect = size.width / Math.max(1, size.height)
      if (Math.abs(perspectiveCamera.aspect - aspect) > 0.001) {
        perspectiveCamera.aspect = aspect
        perspectiveCamera.updateProjectionMatrix()
      }
    }

    const moveVector = new THREE.Vector3()
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const horizontalIntent = keys.current.forward || voiceMovement.current.forward
    const backwardIntent = keys.current.backward || voiceMovement.current.backward
    const leftIntent = keys.current.left || voiceMovement.current.left
    const rightIntent = keys.current.right || voiceMovement.current.right

    if (horizontalIntent) moveVector.add(forward)
    if (backwardIntent) moveVector.sub(forward)
    if (leftIntent) moveVector.sub(right)
    if (rightIntent) moveVector.add(right)

    const verticalMovement = Number(voiceMovement.current.up) - Number(voiceMovement.current.down)
    const moveActive = horizontalIntent || backwardIntent || leftIntent || rightIntent || verticalMovement !== 0
    if (phoneControlEnabled || !moveActive) {
      activeMoveIntent.current = null
    }

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(14 * delta)
      perspectiveCamera.position.add(moveVector)
      perspectiveCamera.position.y = THREE.MathUtils.clamp(perspectiveCamera.position.y, 4, 20)
    }
    if (verticalMovement !== 0) {
      perspectiveCamera.position.y += verticalMovement * 14 * delta
      perspectiveCamera.position.y = THREE.MathUtils.clamp(perspectiveCamera.position.y, 4, 32)
    }

    const targetFov = binocularActive.current ? 22 : defaultFov.current
    perspectiveCamera.fov = THREE.MathUtils.lerp(perspectiveCamera.fov, targetFov, 0.16)
    perspectiveCamera.updateProjectionMatrix()
  })

  return null
}

function MobileCanvasResize() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const container = canvas.parentElement
    if (!container) return

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      gl.setSize(width, height, false)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
    }

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(container)
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    resize()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
    }
  }, [camera, gl])

  return null
}

function MobileStereoRenderer() {
  const { camera, gl, scene, size } = useThree()
  const stereo = useRef<StereoEffect | null>(null)
  useEffect(() => {
    const effect = new StereoEffect(gl)
    effect.setEyeSeparation(0.064)
    stereo.current = effect
    return () => { stereo.current = null }
  }, [gl])
  useEffect(() => { stereo.current?.setSize(size.width, size.height) }, [size.width, size.height])
  useFrame(() => { stereo.current?.render(scene, camera) }, 1)
  return null
}

function ProtectedSites() {
  const sites = [
    { id: 'forward-outpost', name: 'FORWARD OUTPOST', position: [-18, 0.15, 12], color: '#8da0a2' },
    { id: 'communication-station', name: 'COMMUNICATION STATION', position: [6, 0.18, -15], color: '#7a8a90' },
    { id: 'radar-station', name: 'RADAR / SENSOR STATION', position: [20, 0.2, 8], color: '#93a0a7' },
    { id: 'supply-area', name: 'SUPPLY / LOGISTICS', position: [-4, 0.15, -28], color: '#7b7770' },
    { id: 'ridge-road', name: 'PROTECTED ROUTE', position: [0, 0.15, 18], color: '#7a8684' },
  ]

  return (
    <group>
      {sites.map((site) => (
        <group key={site.id} position={site.position as [number, number, number]}>
          <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.4, 2.2]} />
            <meshStandardMaterial color={site.color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.9, 0]} castShadow>
            <boxGeometry args={[1.8, 0.18, 1.8]} />
            <meshStandardMaterial color="#4d5f63" roughness={0.68} />
          </mesh>
          <mesh position={[0.82, 2.1, 0.82]} castShadow>
            <cylinderGeometry args={[0.12, 0.18, 2.2, 8]} />
            <meshStandardMaterial color="#a8b6b2" metalness={0.34} roughness={0.5} />
          </mesh>
          {site.id === 'radar-station' && (
            <group position={[-0.62, 2.15, 0.35]}>
              <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <sphereGeometry args={[0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#c0d0d0" metalness={0.3} roughness={0.48} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 0.9, 7]} />
                <meshStandardMaterial color="#879b9d" metalness={0.28} roughness={0.52} />
              </mesh>
            </group>
          )}
          {site.id === 'communication-station' && (
            <group position={[-0.55, 2.5, -0.35]}>
              <mesh><cylinderGeometry args={[0.035, 0.055, 2.6, 6]} /><meshStandardMaterial color="#b0bfbc" metalness={0.35} roughness={0.5} /></mesh>
              <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.9, 0.045, 0.045]} /><meshStandardMaterial color="#b0bfbc" metalness={0.35} roughness={0.5} /></mesh>
              <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.65, 0.04, 0.04]} /><meshStandardMaterial color="#b0bfbc" metalness={0.35} roughness={0.5} /></mesh>
            </group>
          )}
          {site.id === 'supply-area' && (
            <group position={[0, 0.1, -0.72]}>
              <mesh position={[-0.52, 0.38, 0]} castShadow><boxGeometry args={[0.64, 0.7, 0.58]} /><meshStandardMaterial color="#9b8869" roughness={0.94} /></mesh>
              <mesh position={[0.3, 0.28, 0]} castShadow><boxGeometry args={[0.74, 0.5, 0.62]} /><meshStandardMaterial color="#727b6b" roughness={0.94} /></mesh>
            </group>
          )}
          <mesh position={[0, 1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.8, 3.4, 32]} />
            <meshBasicMaterial color="#9dd6d1" transparent opacity={0.32} side={THREE.DoubleSide} />
          </mesh>
          <SceneLabel position={[0, 3.2, 0]} text={`PROTECTED / ${site.name}`} color="#9dd6d1" width={6.2} />
        </group>
      ))}
    </group>
  )
}

function Terrain({
  terrain,
  time,
  visibility,
  himalayanVisuals,
}: {
  terrain: string
  time: string
  visibility: string
  himalayanVisuals: boolean
}) {
  const kind = terrainKind(terrain)
  const dayPhase = time.toLowerCase()
  const visibilityCondition = visibility.toLowerCase()
  const night = dayPhase === 'night'
  const dawn = dayPhase === 'dawn'
  const dusk = dayPhase === 'dusk'
  const blackout = /blackout/.test(visibilityCondition)
  const lowLight = /low light/.test(visibilityCondition)
  const skyColor = night || blackout ? '#18212b' : dusk ? '#756c6a' : dawn ? '#c3d4e2' : kind === 'desert' ? '#a7a096' : kind === 'coastal' ? '#94a6a4' : '#c8d7e7'
  const atmosphericColor = /dust/.test(visibilityCondition)
    ? '#a79a82'
    : /snow/.test(visibilityCondition)
      ? '#d9e4ef'
      : /fog|haze|degraded|reduced/.test(visibilityCondition)
        ? '#a0aaa5'
        : night || blackout
          ? '#18212b'
          : skyColor
  const desert = kind === 'desert'
  const coastal = kind === 'coastal'
  const urban = kind === 'urban'
  const industrial = kind === 'industrial'
  const highlands = kind === 'highlands'
  const rural = kind === 'rural'
  const color = highlands ? '#777366' : desert ? '#aa966f' : coastal ? '#827d69' : urban ? '#656861' : industrial ? '#77766a' : kind === 'border' ? '#716e5c' : '#66704f'
  const baseMaterial = highlands ? '#625e53' : desert ? '#ad9567' : coastal ? '#8a8066' : urban ? '#535754' : industrial ? '#65675e' : kind === 'border' ? '#77715c' : '#69714f'

  const groundGeometry = useMemo(() => {
    const mesh = new THREE.PlaneGeometry(112, 112, 72, 72)
    const vertices = mesh.attributes.position
    const colors: number[] = []
    const baseColor = new THREE.Color(color)
    const snowColor = new THREE.Color('#e6edf0')
    for (let index = 0; index < vertices.count; index += 1) {
      const x = vertices.getX(index)
      const z = -vertices.getY(index)
      const elevation = groundHeight(kind, x, z)
      const microRelief = himalayanVisuals ? Math.sin(x * 0.62 + z * 0.47) * Math.cos(z * 0.54 - x * 0.36) * 0.045 : 0
      vertices.setZ(index, elevation + microRelief)
      const variation = Math.sin(x * 0.43 + z * 0.17) * Math.cos(z * 0.38 - x * 0.1)
      const patch = Math.sin(x * 0.19 + z * 0.12) * Math.cos(z * 0.16 - x * 0.07)
      const vertexColor = baseColor.clone().offsetHSL(0, 0, variation * 0.025)
      if (highlands) vertexColor.lerp(snowColor, THREE.MathUtils.clamp((elevation - 1.2 + patch * 0.6) * 1.25, 0, 0.95))
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b)
    }
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    mesh.computeVertexNormals()
    return mesh
  }, [color, highlands, himalayanVisuals, kind])
  useEffect(() => () => groundGeometry.dispose(), [groundGeometry])

  const seed = hashText(`${terrain}|${time}|${visibility}`)
  const trees = useMemo(() => {
    const random = seededRandom(seed)
    const count = highlands ? 48 : coastal ? 12 : desert ? 7 : urban ? 9 : rural ? 25 : kind === 'border' ? 13 : 6
    return Array.from({ length: count }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1
      let x = side * (highlands ? 12 + random() * 27 : urban ? 19 + random() * 17 : 10 + random() * 32)
      let z = -35 + random() * 62
      if (coastal) {
        x = side * (14 + random() * 23)
        z = -13 + random() * 25
      } else if (highlands) {
        z = -28 + random() * 54
      } else if (urban) {
        z = -27 + random() * 58
      }
      if (Math.abs(x) < 11 && z > -7 && z < 20) x = side * 13
      return { x, z, height: (coastal ? 2.2 : desert ? 0.55 : highlands ? 2.4 : 1.8) + random() * (coastal ? 1 : desert ? 0.35 : highlands ? 2.1 : 1.1), rotation: random() * Math.PI * 2 }
    })
  }, [coastal, desert, highlands, kind, seed, urban])

  const buildings = useMemo(() => {
    const random = seededRandom(seed ^ 0x51f15e)
    const colors = urban
      ? ['#777a76', '#777c7c', '#858276', '#606c70', '#777068']
      : ['#797c70', '#6a756f', '#8a8678', '#666b65']
    const positions = urban
      ? Array.from({ length: 22 }, (_, index) => {
          const side = index % 2 === 0 ? -1 : 1
          const row = Math.floor(index / 2)
          return { x: side * (15 + random() * 7), z: -28 + row * 5.2 }
        })
      : Array.from({ length: industrial ? 5 : kind === 'border' ? 3 : 4 }, (_, index) => ({
          x: (index - 2) * (industrial ? 8 : 12) + (random() - 0.5) * 2,
          z: industrial ? -22 - (index % 2) * 6 : -17 - (index % 2) * 5,
        }))
    return positions.map((position, index) => ({
      ...position,
      width: urban ? 3.1 + random() * 3.7 : industrial ? 6 + random() * 2.5 : 2.4 + random() * 1.3,
      depth: urban ? 3 + random() * 4 : industrial ? 6 + random() * 2 : 3 + random() * 2,
      height: urban ? 3.5 + random() * 10 : industrial ? 3 + random() * 2 : 2 + random() * 1.4,
      color: colors[index % colors.length],
      roof: index % 3,
    }))
  }, [industrial, kind, seed, urban])

  const dunes = useMemo(() => {
    const random = seededRandom(seed ^ 0x2d3c4b)
    return Array.from({ length: 10 }, (_, index) => {
      const row = Math.floor(index / 5)
      const column = index % 5
      return {
        x: -18 + column * 9 + row * 2,
        z: -43 + row * 10 + (random() - 0.5) * 3,
        width: 22 + random() * 7,
        depth: 13 + random() * 4,
        height: 2.4 + random() * 1.8,
        phase: random() * Math.PI * 2,
        color: (row + column) % 2 ? '#9e895f' : '#b19a6c',
      }
    })
  }, [seed])

  const roadways = useMemo(() => {
    if (highlands) return [
      { points: [[-25, 28], [-20, 21], [-22, 15], [-16, 9], [-18, 2], [-12, -8], [-16, -20], [-21, -31]] as [number, number][], width: 2.8, color: '#545650' },
      { points: [[-4, -28], [-7, -22], [-8, -16], [-3, -10], [-1, -3], [6, 3], [11, 8]] as [number, number][], width: 1.15, color: '#796c53' },
    ]
    if (desert) return [{ points: [[29, 30], [18, 20], [23, 10], [13, 0], [19, -12], [8, -22], [11, -32]] as [number, number][], width: 3, color: '#8b7856' }]
    if (coastal) return [{ points: [[-42, -17], [-22, -15.5], [0, -17], [22, -15.5], [42, -17]] as [number, number][], width: 3.5, color: '#5d6259' }]
    if (urban) return [
      { points: [[-46, -24], [-23, -24], [0, -24], [23, -24], [46, -24]] as [number, number][], width: 4, color: '#474c4d' },
      { points: [[-46, -8], [-24, -8], [0, -8], [24, -8], [46, -8]] as [number, number][], width: 3.5, color: '#474c4d' },
      { points: [[-31, -34], [-31, -18], [-31, 2]] as [number, number][], width: 3.2, color: '#474c4d' },
      { points: [[31, -34], [31, -18], [31, 2]] as [number, number][], width: 3.2, color: '#474c4d' },
    ]
    if (industrial) return [{ points: [[-42, -16], [-20, -16], [0, -16], [20, -16], [42, -16]] as [number, number][], width: 4.2, color: '#535853' }]
    if (kind === 'border') return [{ points: [[-40, 23], [-20, 20], [0, 22], [20, 19], [40, 21]] as [number, number][], width: 3, color: '#605c4f' }]
    return [{ points: [[-38, 24], [-23, 19], [-8, 21], [9, 12], [23, 14], [39, 5]] as [number, number][], width: 2.7, color: '#665f4e' }]
  }, [coastal, desert, highlands, industrial, kind, urban])

  return (
    <>
      <color attach="background" args={[atmosphericColor]} />
      <ambientLight intensity={night || blackout ? 0.58 : lowLight ? 0.66 : dusk ? 0.72 : dawn ? 0.9 : 0.95} color={night || blackout ? '#9eb4cc' : /snow/.test(visibilityCondition) ? '#d7e2e7' : dawn && highlands ? '#edf4fa' : dawn ? '#e8c5a2' : dusk ? '#d8a995' : '#e4e6d8'} />
      <hemisphereLight args={[night || blackout ? '#8da6c8' : dawn || dusk ? '#e6c5ad' : '#dbe5e2', desert ? '#8c7655' : highlands ? '#454740' : '#394238', night || blackout ? 0.62 : 0.78]} />
      <directionalLight
        position={night || blackout ? [-12, 16, -8] : dawn || dusk ? [-10, 8, 8] : [-10, 19, 8]}
        intensity={night || blackout ? 1 : dusk ? 1.15 : 1.8}
        color={night || blackout ? '#abc4e5' : dawn && highlands ? '#f3e8d8' : dawn || dusk ? '#efbb91' : '#fff0cf'}
      />
      <mesh geometry={groundGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} emissive={night || blackout ? '#151b1d' : '#000000'} emissiveIntensity={night || blackout ? 0.22 : 0} />
      </mesh>
      <mesh position={[0, -1.05, 0]} receiveShadow>
        <boxGeometry args={[116, 0.65, 116]} />
        <meshStandardMaterial color={baseMaterial} roughness={1} />
      </mesh>

      {highlands && (
        <>
          <MountainRange z={-59} height={15} seed={seed + 1} color="#edf5ff" />
          <MountainRange z={-52} height={11} seed={seed + 2} color="#dfeaf7" />
          <MountainRange z={-44} height={8} seed={seed + 3} color="#c7d5df" />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 31, 0, -7]} rotation={[0, side * -0.15, side * 0.08]}>
              {himalayanVisuals ? <HimalayanPeak seed={seed + side * 1777} width={10} height={15} /> : (
                <>
                  <mesh position={[0, 7.4, 0]} castShadow>
                    <coneGeometry args={[10, 15, 6]} />
                    <meshStandardMaterial color="#62686a" roughness={1} flatShading />
                  </mesh>
                  <mesh position={[0, 12.1, 0]} castShadow>
                    <coneGeometry args={[5.9, 8.2, 6]} />
                    <meshStandardMaterial color="#e5edf1" roughness={1} flatShading />
                  </mesh>
                </>
              )}
            </group>
          ))}
        </>
      )}

      {desert && (
        <>
          {dunes.map((dune, index) => <DunePatch key={index} {...dune} />)}
          {[-26, -19, 19, 27].map((x, index) => (
            <mesh key={x} position={[x, -0.05, -12 + (index % 2) * 8]} rotation={[0.2, index * 0.6, 0.1]} castShadow>
              <dodecahedronGeometry args={[1.1 + (index % 2) * 0.45, 0]} />
              <meshStandardMaterial color="#716752" roughness={1} flatShading />
            </mesh>
          ))}
        </>
      )}

      {coastal && (
        <>
          <mesh position={[0, -0.35, -46]} receiveShadow>
            <boxGeometry args={[120, 0.16, 42]} />
            <meshStandardMaterial color={night ? '#294857' : '#397889'} roughness={0.34} metalness={0.12} />
          </mesh>
          <mesh position={[0, -0.24, -23]} receiveShadow>
            <boxGeometry args={[120, 0.13, 4.3]} />
            <meshStandardMaterial color="#b2a07c" roughness={1} />
          </mesh>
          <mesh position={[0, -0.2, -18]} receiveShadow>
            <boxGeometry args={[120, 0.1, 3.1]} />
            <meshStandardMaterial color="#817a66" roughness={1} />
          </mesh>
        </>
      )}

      {urban && (
        <>
          <mesh position={[0, -0.27, -13]} receiveShadow>
            <boxGeometry args={[110, 0.08, 1.8]} />
            <meshStandardMaterial color="#878476" roughness={1} />
          </mesh>
          {buildings.map((building, index) => (
            <group key={index} position={[building.x, groundHeight(kind, building.x, building.z) - 0.45, building.z]} rotation={[0, (index % 4) * 0.08, 0]}>
              <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[building.width, building.height, building.depth]} />
                <meshStandardMaterial color={building.color} roughness={0.88} />
              </mesh>
              {building.roof === 0 ? (
                <mesh position={[0, building.height + 0.13, 0]} castShadow>
                  <boxGeometry args={[building.width * 0.72, 0.28, building.depth * 0.76]} />
                  <meshStandardMaterial color="#4c5553" roughness={0.84} />
                </mesh>
              ) : (
                <mesh position={[0, building.height + 0.07, 0]}>
                  <boxGeometry args={[building.width * 1.02, 0.14, building.depth * 1.02]} />
                  <meshStandardMaterial color="#4c5553" roughness={0.84} />
                </mesh>
              )}
              {Array.from({ length: 3 }, (_, window) => (
                <mesh key={window} position={[-building.width * 0.27 + window * building.width * 0.27, building.height * 0.58, building.depth / 2 + 0.012]}>
                  <boxGeometry args={[Math.max(0.22, building.width * 0.12), Math.max(0.32, building.height * 0.12), 0.025]} />
                  <meshStandardMaterial color={night ? '#b0a87c' : '#53666a'} emissive={night ? '#8a7844' : '#24383b'} emissiveIntensity={night ? 0.2 : 0.04} roughness={0.38} />
                </mesh>
              ))}
            </group>
          ))}
          {[-33, 33].map((x) => (
            <mesh key={x} position={[x, -0.3, 4]} receiveShadow>
              <boxGeometry args={[3.2, 0.08, 48]} />
              <meshStandardMaterial color="#918e81" roughness={1} />
            </mesh>
          ))}
        </>
      )}

      {industrial && (
        <>
          {buildings.map((building, index) => (
            <group key={index} position={[building.x, groundHeight(kind, building.x, building.z) - 0.45, building.z]}>
              <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[building.width, building.height, building.depth]} />
                <meshStandardMaterial color={building.color} roughness={0.9} />
              </mesh>
              <mesh position={[0, building.height + 0.32, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.16, 0.16, building.width * 0.88, 8]} />
                <meshStandardMaterial color="#82847b" metalness={0.22} roughness={0.64} />
              </mesh>
            </group>
          ))}
          {[-17, -10, 10, 17].map((x, index) => (
            <mesh key={x} position={[x, 1.25, -24]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[1.05, 1.05, 4.8, 12]} />
              <meshStandardMaterial color={index % 2 ? '#85877d' : '#717870'} metalness={0.15} roughness={0.7} />
            </mesh>
          ))}
        </>
      )}

      {rural && (
        <>
          {[-25, -13, 13, 25].map((x, index) => (
            <mesh key={x} position={[x, -0.21, -20]} rotation={[0, (index % 2 ? 0.1 : -0.12), 0]} receiveShadow>
              <boxGeometry args={[9 + (index % 2) * 2, 0.045, 27]} />
              <meshStandardMaterial color={index % 2 ? '#777148' : '#63714c'} roughness={1} />
            </mesh>
          ))}
          {[-22, -11, 12, 23].map((x, index) => (
            <group key={x} position={[x, groundHeight(kind, x, -27) - 0.45, -27 + (index % 2) * 4]}>
              <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.8 + (index % 2) * 0.6, 1.6, 2.5]} />
                <meshStandardMaterial color={index % 2 ? '#8a8575' : '#787b70'} roughness={0.92} />
              </mesh>
              <mesh position={[0, 1.78, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[2.15, 0.85, 4]} />
                <meshStandardMaterial color="#5d5b50" roughness={1} />
              </mesh>
            </group>
          ))}
          <group position={[-17, -0.23, -21]}>
            <mesh position={[0, 0.75, 0]} castShadow>
              <boxGeometry args={[3.8, 1.5, 2.6]} />
              <meshStandardMaterial color="#8a8774" roughness={1} />
            </mesh>
            <mesh position={[0, 1.7, 0]} castShadow>
              <coneGeometry args={[2.65, 0.8, 4]} />
              <meshStandardMaterial color="#514f44" roughness={1} />
            </mesh>
          </group>
        </>
      )}

      {kind === 'border' && (
        <>
          <mesh position={[0, 0.035, -24]} receiveShadow>
            <boxGeometry args={[84, 0.06, 0.18]} />
            <meshStandardMaterial color="#77735f" roughness={1} />
          </mesh>
          {Array.from({ length: 18 }, (_, index) => (
            <mesh key={index} position={[-41 + index * 4.8, 0.62, -24]} castShadow>
              <cylinderGeometry args={[0.045, 0.06, 1.2, 5]} />
              <meshStandardMaterial color="#686d64" metalness={0.16} roughness={0.8} />
            </mesh>
          ))}
          <group position={[25, -0.22, -18]}>
            <mesh position={[0, 2.2, 0]} castShadow>
              <boxGeometry args={[0.25, 4.4, 0.25]} />
              <meshStandardMaterial color="#626860" />
            </mesh>
            <mesh position={[0, 4.45, 0]} castShadow>
              <boxGeometry args={[2, 0.2, 1.7]} />
              <meshStandardMaterial color="#74796e" />
            </mesh>
            <mesh position={[0, 4.9, 0]} castShadow>
              <boxGeometry args={[1.2, 0.7, 1.3]} />
              <meshStandardMaterial color="#5b625b" />
            </mesh>
          </group>
        </>
      )}

      {coastal && (
        <group position={[-3.5, -0.25, 9]}>
          <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[15, 0.16, 12]} /><meshStandardMaterial color="#827b65" roughness={1} /></mesh>
          <mesh position={[0, 0.85, 1]} castShadow receiveShadow><boxGeometry args={[3.8, 1.2, 2.7]} /><meshStandardMaterial color="#c0b499" roughness={0.84} /></mesh>
          <mesh position={[0, 1.52, 1]} castShadow><boxGeometry args={[4.05, 0.16, 2.95]} /><meshStandardMaterial color="#53615e" roughness={0.8} /></mesh>
          <mesh position={[-4.6, 0.95, -1.7]} castShadow receiveShadow><boxGeometry args={[3.4, 1.45, 2.4]} /><meshStandardMaterial color="#9b927e" roughness={0.9} /></mesh>
          <mesh position={[4.4, 1.03, -2.2]} castShadow receiveShadow><boxGeometry args={[4.1, 1.6, 3]} /><meshStandardMaterial color="#7a847b" roughness={0.85} /></mesh>
        </group>
      )}

      {!coastal && (
        <group position={[-3.5, -0.25, 9]}>
          <mesh position={[0, 0.02, 0]} receiveShadow>
            <boxGeometry args={[15, 0.16, 12]} />
            <meshStandardMaterial color={night ? '#4b5149' : baseMaterial} roughness={1} />
          </mesh>
          <mesh position={[0, 0.19, 1]} castShadow receiveShadow>
            <boxGeometry args={[3.8, 1.2, 2.7]} />
            <meshStandardMaterial color="#65706a" roughness={0.84} />
          </mesh>
          <mesh position={[0, 0.86, 1]} castShadow>
            <boxGeometry args={[4.05, 0.16, 2.95]} />
            <meshStandardMaterial color="#414d4b" roughness={0.8} />
          </mesh>
          <mesh position={[-4.6, 0.28, -1.7]} castShadow receiveShadow>
            <boxGeometry args={[3.4, 1.45, 2.4]} />
            <meshStandardMaterial color="#7a8270" roughness={0.9} />
          </mesh>
          <mesh position={[4.4, 0.36, -2.2]} castShadow receiveShadow>
            <boxGeometry args={[4.1, 1.6, 3]} />
            <meshStandardMaterial color="#56665f" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.34, 4.5]} castShadow>
            <cylinderGeometry args={[0.18, 0.24, 2.2, 8]} />
            <meshStandardMaterial color="#7c8983" metalness={0.25} roughness={0.64} />
          </mesh>
          <mesh position={[0, 1.45, 4.5]} castShadow>
            <cylinderGeometry args={[0.55, 0.38, 0.55, 8]} />
            <meshStandardMaterial color="#64756e" metalness={0.2} roughness={0.55} />
          </mesh>
        </group>
      )}

      {roadways.map((road, index) => (
        <Road key={index} points={road.points} width={road.width} color={road.color} kind={kind} />
      ))}
      {himalayanVisuals && <HimalayanTerrainDetails seed={seed} />}
      {highlands && <ProtectedSites />}
      <TerrainTrees kind={kind} trees={trees} />
    </>
  )
}

export function TrainingSimulationScene({
  contacts,
  terrain,
  time,
  visibility,
  himalayanVisuals = false,
  xrStore,
  xrActive = false,
  playbackSeconds,
  missionStartedAt,
  onThreatDetected,
  phoneControlEnabled = false,
  phoneMatchedView = false,
  phoneRecenterKey = 0,
  mobileOptimized = false,
  mobileStereo = false,
}: TrainingSimulationSceneProps) {
  const orbitControlsRef = useRef<OrbitControlHandle | null>(null)
  const night = time.toLowerCase() === 'night'
  const far = /fog/i.test(visibility) ? 72 : /blackout/i.test(visibility) ? 88 : /dust|snow/i.test(visibility) ? 94 : /degraded|haze|reduced|low light/i.test(visibility) ? 108 : 130
  const sceneContent = (
    <>
      {mobileOptimized && <MobileCanvasResize />}
      {mobileStereo && <MobileStereoRenderer />}
      <CameraRig
        phoneControlEnabled={phoneControlEnabled && !xrActive}
        phoneMatchedView={phoneMatchedView && !xrActive}
        phoneRecenterKey={phoneRecenterKey}
        orbitControlsRef={orbitControlsRef}
      />
      <Terrain terrain={terrain} time={time} visibility={visibility} himalayanVisuals={himalayanVisuals} />
      {himalayanVisuals && <Snowfall />}
      <fog
        attach="fog"
        args={[
          night ? '#18212b' : time.toLowerCase() === 'dusk' ? '#756c6a' : time.toLowerCase() === 'dawn' ? (himalayanVisuals ? '#b8c8d2' : '#96958c') : '#9ba7a1',
          /fog|blackout/i.test(visibility) ? 22 : /dust|snow/i.test(visibility) ? 28 : /degraded|haze|reduced|low light/i.test(visibility) ? 42 : 66,
          far,
        ]}
      />
      {contacts.map((contact) => (
        <group key={contact.id}>
          <Drone
            contact={contact}
            selected={contact.selected}
            playbackSeconds={playbackSeconds}
            missionStartedAt={missionStartedAt}
            onThreatDetected={onThreatDetected}
          />
        </group>
      ))}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enabled={!xrActive && !phoneControlEnabled}
        target={[0, 3, -8]}
        enableDamping
        dampingFactor={0.08}
        enablePan
        minDistance={12}
        maxDistance={45}
        maxPolarAngle={Math.PI / 2.03}
      />
    </>
  )

  return (
    <Canvas
      camera={{ position: [25, 25, 37], fov: 46, near: 0.1, far: 170 }}
      dpr={mobileOptimized ? [1, 1.1] : [1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {xrStore ? (
        <Suspense fallback={sceneContent}>
          <TrainingXRLayer store={xrStore}>{sceneContent}</TrainingXRLayer>
        </Suspense>
      ) : sceneContent}
    </Canvas>
  )
}
