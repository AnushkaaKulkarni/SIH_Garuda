'use client'

import type { ReactNode } from 'react'
import { XR, type XRStore } from '@react-three/xr'

export function TrainingXRLayer({ store, children }: { store: XRStore; children: ReactNode }) {
  return <XR store={store}>{children}</XR>
}