'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Headphones, Mic, ScanEye, ShieldCheck } from 'lucide-react'
import { PageHeader, PortalShell } from '@/components/common/portal-shell'
import { VR_COMMAND_GROUPS } from '@/lib/vr-commands'
import styles from './training-vr-briefing.module.css'

const missionSteps = [
  ['LOOK / SCAN', 'Search the Himalayan valley for moving drone contacts.'],
  ['IDENTIFY', 'Use your view to locate and observe suspicious contacts.'],
  ['DETECT', 'Select or identify a contact to record detection.'],
  ['CLASSIFY', 'Determine the type or category of the detected drone.'],
  ['PRIORITIZE', 'Decide which threat requires attention first.'],
  ['RESPOND', 'Choose the appropriate training response.'],
  ['KEEP WATCHING', 'Other drones continue moving while you work on one target.'],
  ['COMPLETE', 'Finish the mission and review performance in the existing AAR.'],
] as const

export function VRTrainingBriefing() {
  return (
    <PortalShell role="soldier">
      <main className={`page-content ${styles.vrPage}`}>
        <PageHeader
          eyebrow="TRAINING BRIEFING / VR-READY MODE"
          title="Himalayan Shield"
          subtitle="Immersive Drone Threat Recognition & Response"
        />

        <section className={styles.hero}>
          <p className="eyebrow">SAME WORLD / DIFFERENT INPUT MODE</p>
          <h2>HIMALAYAN SHIELD — VR TRAINING</h2>
          <p className={styles.heroLead}>Immersive Drone Threat Recognition &amp; Response</p>
          <p className={styles.heroCopy}>
            This is the same Himalayan Shield training environment, threats, and mission logic used in desktop mode. Voice commands work in browsers that support speech recognition after you enable the microphone. Immersive headset mode is offered only when WebXR reports real device support.
          </p>
          <div className={styles.deviceNotice}>
            <ShieldCheck size={15} /> VR-ready browser mode · Microphone permission is requested only when you enable voice. Headset status is detected from WebXR, never simulated.
          </div>
        </section>

        <section className={styles.section} aria-labelledby="vr-mission-steps">
          <div className={styles.sectionHeading}>
            <h2 id="vr-mission-steps">HOW TO PLAY</h2>
            <small>Training only · Existing GARUDA session and AAR</small>
          </div>
          <div className={styles.stepsGrid}>
            {missionSteps.map(([title, description], index) => (
              <article className={styles.step} key={title}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div><strong>{title}</strong><p>{description}</p></div>
              </article>
            ))}
          </div>
          <div className={styles.coreRule}>
            Selecting one drone does NOT stop the other drones.
            <span>Keep watching the entire training area.</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="vr-interaction">
          <div className={styles.sectionHeading}><h2 id="vr-interaction">VR INTERACTION</h2></div>
          <div className={styles.interactionGrid}>
            <article className={styles.interactionCard}>
              <h3><ScanEye size={16} /> HEADSET VIEW</h3>
              <p>During an actual immersive WebXR session, headset orientation controls the view as you scan the valley.</p>
              <small>Head tracking is active only while a real WebXR session is running.</small>
            </article>
            <article className={styles.interactionCard}>
              <h3><Mic size={16} /> VOICE</h3>
              <p>Enable voice in the simulation to map short commands to the existing training actions.</p>
              <small>Supported browsers ask for microphone permission; no audio is stored or uploaded by GARUDA.</small>
            </article>
            <article className={styles.interactionCard}>
              <h3><Headphones size={16} /> CONTROLLER</h3>
              <p>Supported WebXR controllers can point to and select the existing moving contacts.</p>
              <small>No controller is simulated as connected in preview mode.</small>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="vr-voice-commands">
          <div className={styles.sectionHeading}><h2 id="vr-voice-commands">VOICE COMMANDS</h2></div>
          <p className={styles.voiceNotice}>Enable Voice in the simulation, then speak a short command. Recognition requires browser support and microphone permission.</p>
          <div className={styles.voiceGrid}>
            {VR_COMMAND_GROUPS.map((group) => (
              <article className={styles.voiceCard} key={group.category}>
                <h3>{group.category}</h3>
                <ul>{group.examples.map((example) => <li key={example}>“{example}”</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.actions}>
          <Link href="/soldier/training/himalayan-shield/briefing" className="button button-outline">
            <ArrowLeft size={15} /> Back to Scenario
          </Link>
          <Link href="/soldier/training/himalayan-shield/simulation?mode=vr" className="button">
            START VR SIMULATION <ArrowRight size={15} />
          </Link>
        </footer>
      </main>
    </PortalShell>
  )
}
