import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'

// Module-level shared refs — useRadioPlayer writes the active <audio> element here,
// useAudioVisualizer reads it on each animation frame.
// F32: sourceRef & ctxRef promoted to module-level so destroyHowl can synchronously
// disconnect the old MediaElementAudioSourceNode before creating a new Howl.
export const sharedAudioEl: { current: HTMLAudioElement | null } = { current: null }
export const visualizerSource: { current: MediaElementAudioSourceNode | null } = { current: null }
export const visualizerCtx: { current: AudioContext | null } = { current: null }

export function useAudioVisualizer() {
  const analyserRef = useRef<AnalyserNode | null>(null)
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

  // F34: Single AudioContext, survives React StrictMode double-mount.
  // createMediaElementSource can only be called ONCE per audio element across
  // the entire lifetime of all AudioContexts. StrictMode's first mount→unmount→remount
  // cycle would close the first AudioContext, leaving the element permanently bound
  // to a dead context. Module-level visualizerCtx prevents this.
  useEffect(() => {
    // Reuse existing ctx from previous StrictMode mount, or create new one
    let ctx = visualizerCtx.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
      visualizerCtx.current = ctx
    }

    const analyser = ctx.createAnalyser()
    analyser.fftSize = window.innerWidth <= 768 ? 128 : 256
    analyser.smoothingTimeConstant = 0.8
    analyser.connect(ctx.destination)
    analyserRef.current = analyser

    const doResume = () => {
      if (ctx!.state === 'suspended' && !resumePromiseRef.current) {
        resumePromiseRef.current = ctx!.resume().then(() => {
          resumePromiseRef.current = null
        }).catch(() => {
          resumePromiseRef.current = null
        })
      }
    }

    doResume()

    const resumeOnInteraction = () => {
      doResume()
      if (ctx!.state === 'running') {
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
      // F34: Do NOT close the AudioContext — it would break createMediaElementSource
      // bindings in StrictMode. Only disconnect sources and reset refs.
      if (visualizerSource.current) {
        try { visualizerSource.current.disconnect() } catch { /* ok */ }
        visualizerSource.current = null
      }
      analyserRef.current = null
      attachedElRef.current = null
    }
  }, [])

  // Wire up audio element to analyser — only when AudioContext is running
  const tryAttach = useCallback(() => {
    const audioEl = sharedAudioEl.current
    if (!audioEl || audioEl === attachedElRef.current) return

    const ctx = visualizerCtx.current
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
    if (visualizerSource.current) {
      try { visualizerSource.current.disconnect() } catch { /* ok */ }
      visualizerSource.current = null
    }

    attachedElRef.current = audioEl

    try {
      const source = ctx.createMediaElementSource(audioEl)
      source.connect(analyser)
      visualizerSource.current = source
    } catch (e) {
      // F34: createMediaElementSource already called on this element (React StrictMode
      // double-mount, or HMR). Fall back to captureStream() which has no such limit.
      try {
        const stream = (audioEl as any).captureStream?.() || (audioEl as any).mozCaptureStream?.()
        if (stream) {
          const streamSource = ctx.createMediaStreamSource(stream)
          streamSource.connect(analyser)
          visualizerSource.current = streamSource as any
        }
      } catch { /* both approaches failed, audio plays without visualizer */ }
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

        if (analyser && visualizerCtx.current?.state === 'running') {
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
    if (visualizerSource.current) {
      try { visualizerSource.current.disconnect() } catch { /* ok */ }
      visualizerSource.current = null
    }
  }, [currentItem?.id])

  return { frequencyData, lowFreqEnergy }
}
