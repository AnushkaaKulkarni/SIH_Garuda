'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Headphones, Mic, ScanEye, ShieldCheck } from 'lucide-react'
import { PageHeader, PortalShell } from '@/components/common/portal-shell'
import { scenarios } from '@/lib/types'
import { resolveMissionConfiguration } from '@/lib/training-session'
import { getTrainingNavigation } from '@/lib/training-navigation'
import { SoldierTrainingManual } from './soldier-training-manual'
import styles from './training-vr-briefing.module.css'

export function VRTrainingBriefing({
  scenarioId,
  requestedDifficulty,
  requestedAttackMode,
}: {
  scenarioId: string
  requestedDifficulty?: string
  requestedAttackMode?: string
}) {
  const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[0]
  const { difficulty, attackMode } = resolveMissionConfiguration(scenario, {
    difficulty: requestedDifficulty,
    attackMode: requestedAttackMode,
  })
  const navigation = getTrainingNavigation(scenario.id, difficulty, attackMode)

  return (
    <PortalShell role="soldier">
      <main className={`page-content ${styles.vrPage}`}>
        <PageHeader
          eyebrow="TRAINING GUIDE / VR-READY MODE"
          title={scenario.name}
          subtitle="Review the mission workflow before starting the existing training session."
        />

        <section className={styles.hero}>
          <p className="eyebrow">SAME SCENARIO / SAME TRAINING SESSION</p>
          <h2>{scenario.name.toUpperCase()} — VR-READY TRAINING</h2>
          <p className={styles.heroLead}>Mission guide · {difficulty} · {attackMode.replace('-', ' ')}</p>
          <p className={styles.heroCopy}>
            This guide uses the selected mission and configuration. Starting continues into the same simulation and AAR workflow; VR-ready mode keeps its optional phone pairing, voice controls, and supported WebXR features.
          </p>
          <div className={styles.deviceNotice}>
            <ShieldCheck size={15} /> Training simulation only. WebXR, voice recognition, phone sensors, and controllers depend on device and browser support.
          </div>
        </section>

        <SoldierTrainingManual scenario={scenario} difficulty={difficulty} attackMode={attackMode} />

        <section className={styles.section} aria-labelledby="vr-options">
          <div className={styles.sectionHeading}><h2 id="vr-options">OPTIONAL VR-READY INPUTS</h2><small>Availability depends on this device and browser</small></div>
          <div className={styles.interactionGrid}>
            <article className={styles.interactionCard}>
              <h3><ScanEye size={16} /> HEADSET VIEW</h3>
              <p>Head tracking controls the view only during a real immersive WebXR session.</p>
              <small>Headset entry is offered only when WebXR reports support.</small>
            </article>
            <article className={styles.interactionCard}>
              <h3><Mic size={16} /> VOICE</h3>
              <p>Enable Voice in the simulation to map supported short commands to the existing training actions.</p>
              <small>Speech support and microphone permission are required; voice is optional.</small>
            </article>
            <article className={styles.interactionCard}>
              <h3><Headphones size={16} /> PHONE / CONTROLLER</h3>
              <p>Pair a phone for camera orientation control, or use a supported WebXR controller to select contacts.</p>
              <small>Phone motion access requires browser permission in a secure context.</small>
            </article>
          </div>
        </section>

        <footer className={styles.actions}>
          <Link href={navigation.briefingHref} className="button button-outline">
            <ArrowLeft size={15} /> Back to Scenario Briefing
          </Link>
          <Link href={navigation.vrSimulationHref} className="button">
            START VR-READY SIMULATION <ArrowRight size={15} />
          </Link>
        </footer>
      </main>
    </PortalShell>
  )
}
