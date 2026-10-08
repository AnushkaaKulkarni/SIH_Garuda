'use client'

import { useState } from 'react'
import { Mic, MicOff, Radio, X } from 'lucide-react'
import { parseVRCommand, VR_COMMAND_GROUPS } from '@/lib/vr-commands'
import { useVoiceCommands } from './use-voice-commands'
import styles from './training-vr-controls.module.css'

type TrainingVRControlsProps = {
  threatIds: string[]
  webXrSupported: boolean | null
  xrReady: boolean
  immersiveActive: boolean
  xrError: string
  onCommand: (transcript: string) => string
  onEnterVR: () => void
  onExitVR: () => void
}

export type VoiceLanguage = 'English' | 'Hindi' | 'Hinglish'

export function TrainingVRControls({
  threatIds,
  webXrSupported,
  xrReady,
  immersiveActive,
  xrError,
  onCommand,
  onEnterVR,
  onExitVR,
}: TrainingVRControlsProps) {
  const [commandHelpOpen, setCommandHelpOpen] = useState(false)
  const [lastAction, setLastAction] = useState('')
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('English')
  const voice = useVoiceCommands((transcript) => {
    setLastAction(onCommand(transcript))
  }, voiceLanguage)

  const webXrLabel = immersiveActive
    ? 'ACTIVE'
    : webXrSupported === null ? 'CHECKING' : webXrSupported ? 'READY' : 'NOT DETECTED'
  const voiceLabel = voice.isListening ? 'LISTENING' : voice.isSupported === null ? 'CHECKING' : voice.isSupported ? 'AVAILABLE' : 'UNAVAILABLE'

  return (
    <section className={styles.controls} aria-label="VR input controls">
      <div className={styles.statusRow}>
        <span>VR MODE <b>{immersiveActive ? 'IMMERSIVE' : 'PREVIEW'}</b></span>
        <span>VOICE <b className={voice.isListening ? styles.listening : ''}>{voiceLabel}</b></span>
        <span>WEBXR <b>{webXrLabel}</b></span>
      </div>
      <div className={styles.actions}>
        <label className="terrain-chip" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Language
          <select
            aria-label="Voice command language"
            value={voiceLanguage}
            onChange={(event) => setVoiceLanguage(event.target.value as VoiceLanguage)}
          >
            <option value="English">English</option>
            <option value="Hindi">Hindi</option>
            <option value="Hinglish">Hinglish</option>
          </select>
        </label>
        {voice.isListening ? (
          <button className="table-action" onClick={voice.stopListening}><MicOff size={13} /> STOP VOICE</button>
        ) : (
          <button className="table-action" onClick={voice.startListening} disabled={!voice.isSupported} title={voice.isSupported ? 'Microphone permission is requested when enabled' : 'Browser speech recognition is unavailable'}>
            <Mic size={13} /> ENABLE VOICE
          </button>
        )}
        {immersiveActive ? (
          <button className="table-action" onClick={onExitVR}><Radio size={13} /> EXIT IMMERSIVE VR</button>
        ) : (
          <button className="table-action" onClick={onEnterVR} disabled={!xrReady} title={webXrSupported ? 'Start an actual immersive WebXR session' : 'Immersive VR is not available on this device'}>
            <Radio size={13} /> ENTER IMMERSIVE VR
          </button>
        )}
        <button className="table-action" onClick={() => setCommandHelpOpen((open) => !open)} aria-expanded={commandHelpOpen}>
          VOICE COMMANDS
        </button>
      </div>
      <div className={styles.feedback} aria-live="polite">
        {voice.isSupported === false && <span>Browser voice recognition is unavailable. Use mouse/keyboard controls.</span>}
        {voice.isSupported === true && !voice.isListening && !voice.error && <span>Microphone permission is required. Speech is not stored or uploaded.</span>}
        {webXrSupported === false && !xrError && <span>Immersive VR hardware not detected. VR Preview Mode remains available.</span>}
        {voice.transcript && <span>Last command: “{voice.transcript}”{lastAction ? ` · ${lastAction}` : ''}</span>}
        {voice.error && <span role="status">{voice.error}</span>}
        {xrError && <span role="status">{xrError}</span>}
      </div>
      {commandHelpOpen && (
        <div className={styles.commandHelp}>
          <div className={styles.helpHeader}><strong>VOICE COMMANDS</strong><button onClick={() => setCommandHelpOpen(false)} aria-label="Close voice command help"><X size={14} /></button></div>
          <div className={styles.helpGrid}>
            {VR_COMMAND_GROUPS.map((group) => (
              <div key={group.category}><b>{group.category}</b><span>{group.examples.slice(0, 2).map((example) => `“${example}”`).join(' · ')}</span></div>
            ))}
          </div>
          <small>Allowed classifications: Friendly, Unknown, Hostile. Unsupported labels are rejected.</small>
          <small>Active targets: {threatIds.map((id) => id.replace('-', '')).join(', ')}</small>
        </div>
      )}
    </section>
  )
}
