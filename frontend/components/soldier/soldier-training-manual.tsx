'use client'

import { Activity, AlertTriangle, BookOpenCheck, Crosshair, Eye, Gamepad2, Headphones, Mic, MousePointer2, Radio, Shield, Target } from 'lucide-react'
import type { Scenario } from '@/lib/types'
import { getDetectionWindowMs, type AttackMode, type TrainingDifficulty } from '@/lib/training-session'
import { VR_COMMAND_GROUPS } from '@/lib/vr-commands'
import styles from './soldier-training-manual.module.css'

const attackModeLabels: Record<AttackMode, string> = {
  single: 'Single threat',
  multiple: 'Multiple threats',
  swarm: 'Swarm attack',
  mixed: 'Mixed scenario',
}

const stages = [
  { number: '01', title: 'DETECT', icon: Eye, description: 'Select an available contact in the scene or contact list. Detection records your action; it does not represent a real sensor alert.' },
  { number: '02', title: 'CLASSIFY', icon: Crosshair, description: 'Review the simulated evidence, then choose Friendly, Unknown, or Hostile for the selected contact.' },
  { number: '03', title: 'PRIORITIZE', icon: Activity, description: 'Assess urgency separately from identity using the visible movement and scenario context.' },
  { number: '04', title: 'RESPOND', icon: Radio, description: 'Choose the response that matches the simulator’s illustrative priority rubric.' },
] as const

export function SoldierTrainingManual({
  scenario,
  difficulty,
  attackMode,
  compact = false,
}: {
  scenario: Scenario
  difficulty: TrainingDifficulty
  attackMode: AttackMode
  compact?: boolean
}) {
  return (
    <section className={`${styles.manual} ${compact ? styles.compact : ''}`} aria-labelledby="soldier-manual-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.icon}><BookOpenCheck size={17} /></span>
          <div><p className="panel-label">PRE-MISSION REFERENCE</p><h2 id="soldier-manual-title">Soldier Training Manual</h2></div>
        </div>
        <p className={styles.objective}><Target size={15} /><span><b>Objective</b> Detect, assess, and respond to each available contact, then review your decisions in the after-action review.</span></p>
        <div className={styles.chips} aria-label="Selected mission configuration">
          <span><b>SCENARIO</b>{scenario.name}</span>
          <span><b>DIFFICULTY</b>{difficulty}</span>
          <span><b>ATTACK MODE</b>{attackModeLabels[attackMode]}</span>
        </div>
        <p className={styles.trainingNotice}><Shield size={15} /> Training simulation only. Evidence and sensor estimates are simulated; this interface does not provide operational guidance.</p>
      </header>

      <section className={styles.section} aria-labelledby="manual-workflow">
        <div className={styles.sectionTitle}><span>A</span><h3 id="manual-workflow">Four-stage workflow</h3></div>
        <div className={styles.stages}>
          {stages.map(({ number, title, icon: Icon, description }) => <article className={styles.stage} key={title}>
            <div className={styles.stageTop}><span>{number}</span><Icon size={17} aria-hidden="true" /></div>
            <h4>{title}</h4><p>{description}</p>
          </article>)}
        </div>
        <p className={styles.sectionLead}>Selecting one contact does not stop the others. Keep scanning the full training area while you work through the selected contact.</p>
      </section>

      <section className={styles.section} aria-labelledby="manual-evidence">
        <div className={styles.sectionTitle}><span>B</span><h3 id="manual-evidence">Evidence and decision guidance</h3></div>
        <div className={styles.evidenceGrid}>
          <article className={styles.infoCard}><span className={styles.infoIcon}><Activity size={16}/></span><div><h4>Signal estimate</h4><p>Review the simulated identity estimate and confidence shown for an available contact. The estimate may be uncertain.</p></div></article>
          <article className={styles.infoCard}><span className={styles.infoIcon}><Eye size={16}/></span><div><h4>Track and movement</h4><p>Use track quality, direction, speed, and movement trend where displayed. Contact appearance alone does not establish identity.</p></div></article>
          <article className={styles.infoCard}><span className={styles.infoIcon}><Target size={16}/></span><div><h4>Scenario context</h4><p>Consider {scenario.terrain.toLowerCase()} context, any protected-site cues shown in this scenario, and whether a contact is approaching or moving away.</p></div></article>
          <article className={styles.infoCard}><span className={styles.infoIcon}><AlertTriangle size={16}/></span><div><h4>Identity ≠ urgency</h4><p>Classification describes the evidence-based identity assessment. Priority describes the scenario’s assessed urgency; decide them separately.</p></div></article>
        </div>
        <div className={styles.safetyRules}>
          <h4>Classification rules for this exercise</h4>
          <ul>
            <li><b>Friendly</b> means the available evidence supports a friendly identity.</li>
            <li><b>Hostile</b> means the scenario evidence supports a hostile assessment.</li>
            <li><b>Unknown</b> means evidence is insufficient, conflicting, or inconclusive. Unknown does not automatically mean hostile.</li>
            <li>Unknown by itself does not set High priority; priority is a separate assessment of scenario urgency.</li>
          </ul>
          <p>Hidden ground truth and expected answers stay concealed until you submit your decision. Use the evidence presented for the contact; appearance alone is not proof. The result appears after submission.</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="manual-responses">
        <div className={styles.sectionTitle}><span>C</span><h3 id="manual-responses">Simulated response choices</h3></div>
        <p className={styles.sectionLead}>These are training workflow actions, not real-world rules, commands, or weapon controls.</p>
        <div className={styles.responses}>
          <article><span className={styles.low}>LOW</span><div><h4>Continue monitoring</h4><p>Matches Low urgency in this scenario rubric.</p></div></article>
          <article><span className={styles.medium}>MED</span><div><h4>Track priority threat</h4><p>Matches Medium urgency in this scenario rubric.</p></div></article>
          <article><span className={styles.high}>HIGH</span><div><h4>Escalate alert</h4><p>Matches High urgency in this scenario rubric.</p></div></article>
        </div>
        <p className={styles.rubricNote}>The displayed rubric is illustrative and requires instructor and subject-matter review before any operational use.</p>
      </section>

      <section className={styles.section} aria-labelledby="manual-scoring">
        <div className={styles.sectionTitle}><span>D</span><h3 id="manual-scoring">Scoring and after-action review</h3></div>
        <div className={styles.scoreGrid}>
          {[['30', 'Detection'], ['30', 'Classification'], ['20', 'Prioritization'], ['20', 'Response']].map(([points, label]) => <article key={label}><strong>{points}<small>pts</small></strong><span>{label}</span></article>)}
        </div>
        <p className={styles.scoreNote}>Points are distributed evenly across contacts within each stage. Detection credit is based on time after a contact becomes available: (30 ÷ contact count) × max(0, 1 − 0.35 × elapsed ÷ detection window). The {difficulty} window is {getDetectionWindowMs(difficulty) / 1000} seconds. Pre-arrival detections do not count; missed or unanswered stages earn no points for that stage, with no extra penalty.</p>
        <div className={styles.reviewNote}><BookOpenCheck size={16}/><p><b>After the mission:</b> Review the stage breakdown, missed contacts, event timeline, Decision Replay, and any available one-event What-If analysis. Session history is stored locally in this browser.</p></div>
      </section>

      <section className={styles.section} aria-labelledby="manual-controls">
        <div className={styles.sectionTitle}><span>E</span><h3 id="manual-controls">Controls and practical tips</h3></div>
        <div className={styles.controlsGrid}>
          <article><MousePointer2 size={16}/><div><h4>Desktop</h4><p>Click a contact in the scene or list; use the on-screen stage buttons to submit each decision. Drag to orbit and scroll to zoom when mouse orbit is enabled.</p></div></article>
          <article><span className={styles.key}>W A S D</span><div><h4>Keyboard movement</h4><p>Move the camera with W/A/S/D during normal desktop control. Camera movement is paused while phone orientation control is active.</p></div></article>
          <article><Mic size={16}/><div><h4>Voice · optional</h4><p>Enable Voice in VR-ready mode. Recognition needs browser support and microphone permission; commands map to training actions. Camera movement commands pause during phone orientation control.</p></div></article>
          <article><Headphones size={16}/><div><h4>VR / phone · optional</h4><p>WebXR headset and controller input are available only on supported devices. A paired phone can control camera orientation; allow sensor permission over HTTPS and use Recenter as needed.</p></div></article>
        </div>
        <details className={styles.commandDetails}>
          <summary>View example voice commands</summary>
          <div className={styles.commandGrid}>{VR_COMMAND_GROUPS.map((group) => <div key={group.category}><b>{group.category}</b><p>{group.examples.join(' · ')}</p></div>)}</div>
        </details>
        <p className={styles.contextNote}>This scenario uses {scenario.time.toLowerCase()} conditions and {scenario.visibility.toLowerCase()} visibility cues. The simulator does not model real sensor range or intermittent sensor loss.</p>
      </section>
    </section>
  )
}
