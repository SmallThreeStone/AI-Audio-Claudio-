import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'

// Module-level shared ref — useRadioPlayer writes the active <audio> element here,
// useAudioVisualizer reads it on each animation frame.
export const sharedAudioEl: { current: HTMLAudioElement | null } = { current: null }

export function useAudioVisualizer() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rafRef = useRef<number>(0)
  const attachedElRef = useRef<HTMLAudioElement | null>(null)
  const resumeAttemptedRef = useRef(false)
  const resumePromiseRef = useRef<Promise<void> | null>(null)  // F9: track pending resume
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)  // F19: idle stop
  const runningRef = useRef(false)  // F19: track if rAF loop is active

  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(128))
  const [lowFreqEnergy, setLowFreqEnergy] = useState(0)

  const isPlaying = useStore((s) => s.isPlaying)
  const isAudioLoading = useStore((s) => s.isAudioLoading)
  const currentItem = useStore((s) => s.currentItem)

  // Create AudioContext on mount, resume on first user interaction
  useEffect(() => {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = window.innerWidth <= 768 ? 128 : 256
    analyser.smoothingTimeConstant = 0.8
    analyser.connect(ctx.destination)
    audioCtxRef.current = ctx
    analyserRef.current = analyser

    // F9: Track pending resume promise to avoid createMediaElementSource race
    const doResume = () => {
      if (ctx.state === 'suspended' && !resumePromiseRef.current) {
        resumePromiseRef.current = ctx.resume().then(() => {
          resumePromiseRef.current = null
        }).catch(() => {
          resumePromiseRef.current = null
        })
      }
    }

    // Try to resume immediately (may work if there was prior user gesture)
    doResume()

    // Also resume on first user interaction (click / touch / key)
    const resumeOnInteraction = () => {
      doResume()
      if (ctx.state === 'running') {
        document.removeEventListener('click', resumeOnInteraction)
        document.removeEventListener('touchstart', resumeOnInteraction)
        document.removeEventListener('keydown', resumeOnInteraction)
        resumeAttemptedRef.current = true
      }
    }
    document.addEventListener('click', resumeOnInteraction)
    document.addEventListener('touchstart', resumeOnInteraction)
    document.addEventListener('keydown', resumeOnInteraction)

    return () => {
      document.removeEventListener('click', resumeOnInteraction)
      document.removeEventListener('touchstart', resumeOnInteraction)
      document.removeEventListener('keydown', resumeOnInteraction)
      cancelAnimationFrame(rafRef.current)
      ctx.close().catch(() => {})
      audioCtxRef.current = null
      analyserRef.current = null
      sourceRef.current = null
      sharedAudioEl.current = null
    }
  }, [])

  // Wire up audio element to analyser — only when AudioContext is running
  const tryAttach = useCallback(() => {
    const audioEl = sharedAudioEl.current
    if (!audioEl || audioEl === attachedElRef.current) return

    const ctx = audioCtxRef.current
    const analyser = analyserRef.current
    if (!ctx || !analyser) return

    // F9: If a resume is in progress, wait for it before trying to attach.
    // Otherwise createMediaElementSource may reroute audio through a suspended graph.
    if (ctx.state !== 'running') {
      if (resumePromiseRef.current) {
        resumePromiseRef.current.then(() => {
          // Retry on next frame after resume completes
        })
      } else {
        ctx.resume().catch(() => {})
      }
      return
    }

    if (audioEl.readyState < 2) return // Not enough data yet

    // Disconnect previous source
    if (sourceRef.current) {
      try { sourceRef.current.disconnect() } catch { /* ok */ }
      sourceRef.current = null
    }

    attachedElRef.current = audioEl

    try {
      const source = ctx.createMediaElementSource(audioEl)
      source.connect(analyser)
      sourceRef.current = source
    } catch (e) {
      // createMediaElementSource already called on this element (by a previous source).
      // The old chain still works — audio routes through it.
    }
  }, [])

  // Animation loop — F19: stops completely after 30s of idle (not playing/loading)
  const IDLE_STOP_MS = 30_000

  useEffect(() => {
    const analyser = analyserRef.current
    const bufferLength = analyser?.frequencyBinCount || 128

    let lastFrameTime = 0
    const IDLE_FPS = 4
    let idleSince = 0

    const startLoop = () => {
      if (runningRef.current) return
      runningRef.current = true

      const loop = (timestamp: number) => {
        // F19: Check if we should stop the loop entirely
        if (!isPlaying && !isAudioLoading) {
          if (!idleSince) idleSince = timestamp
          else if (timestamp - idleSince > IDLE_STOP_MS) {
            runningRef.current = false
            return // Stop loop completely
          }
        } else {
          idleSince = 0
        }

        tryAttach()

        if (analyser && audioCtxRef.current?.state === 'running') {
          const data = new Uint8Array(bufferLength)
          analyser.getByteFrequencyData(data)
          setFrequencyData(data)

          const lowBins = Math.floor(bufferLength / 4)
          let sum = 0
          for (let i = 0; i < lowBins; i++) sum += data[i]
          setLowFreqEnergy(sum / (lowBins * 255))
        }

        if (!isPlaying && !isAudioLoading) {
          if (timestamp - lastFrameTime < 1000 / IDLE_FPS) {
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          lastFrameTime = timestamp
        }

        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    startLoop()

    return () => {
      cancelAnimationFrame(rafRef.current)
      runningRef.current = false
    }
  }, [isPlaying, isAudioLoading, tryAttach])

  // Clear attachment when song changes
  useEffect(() => {
    attachedElRef.current = null
    if (sourceRef.current) {
      try { sourceRef.current.disconnect() } catch { /* ok */ }
      sourceRef.current = null
    }
  }, [currentItem?.id])

  return { frequencyData, lowFreqEnergy }
}
