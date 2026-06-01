import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'

export const sharedAudioEl: { current: HTMLAudioElement | null } = { current: null }

// F35: Module-level singletons survive React StrictMode double-mount.
// createMediaElementSource can only be called ONCE per audio element globally.
// Closing the AudioContext or disconnecting the source destroys audio output.
let _ctx: AudioContext | null = null
let _analyser: AnalyserNode | null = null
let _source: MediaElementAudioSourceNode | null = null
const _captured = new WeakSet<HTMLAudioElement>()  // track elements already captured

export function useAudioVisualizer() {
  const rafRef = useRef<number>(0)
  const resumeAttemptedRef = useRef(false)
  const resumePromiseRef = useRef<Promise<void> | null>(null)
  const runningRef = useRef(false)

  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(128))
  const [lowFreqEnergy, setLowFreqEnergy] = useState(0)

  const isPlaying = useStore((s) => s.isPlaying)
  const isAudioLoading = useStore((s) => s.isAudioLoading)
  const currentItem = useStore((s) => s.currentItem)

  // One-time setup: AudioContext + Analyser
  useEffect(() => {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new AudioContext()
    }
    if (!_analyser) {
      _analyser = _ctx.createAnalyser()
      _analyser.fftSize = window.innerWidth <= 768 ? 128 : 256
      _analyser.smoothingTimeConstant = 0.8
      _analyser.connect(_ctx.destination)
    }

    const doResume = () => {
      if (_ctx!.state === 'suspended' && !resumePromiseRef.current) {
        resumePromiseRef.current = _ctx!.resume().then(() => {
          resumePromiseRef.current = null
        }).catch(() => { resumePromiseRef.current = null })
      }
    }
    doResume()

    const onInteraction = () => {
      doResume()
      if (_ctx!.state === 'running') {
        document.removeEventListener('click', onInteraction)
        document.removeEventListener('touchstart', onInteraction)
        document.removeEventListener('keydown', onInteraction)
      }
    }
    document.addEventListener('click', onInteraction)
    document.addEventListener('touchstart', onInteraction)
    document.addEventListener('keydown', onInteraction)

    return () => {
      document.removeEventListener('click', onInteraction)
      document.removeEventListener('touchstart', onInteraction)
      document.removeEventListener('keydown', onInteraction)
    }
  }, [])

  // Wire audio element to analyser
  const tryAttach = useCallback(() => {
    const audioEl = sharedAudioEl.current
    if (!audioEl) return
    if (!_ctx || !_analyser) return
    if (_ctx.state !== 'running') return
    if (audioEl.readyState < 2) return

    // Already captured by a previous StrictMode mount
    if (_captured.has(audioEl)) {
      // Reconnect the existing source to the current analyser
      if (_source) {
        try { _source.disconnect() } catch {}
        _source.connect(_analyser)
      }
      return
    }

    // First time capturing this element
    try {
      _source = _ctx.createMediaElementSource(audioEl)
      _source.connect(_analyser)
      _captured.add(audioEl)
    } catch {
      // Element already captured by a previous lifecycle — add to set and skip
      _captured.add(audioEl)
    }
  }, [])

  // Animation loop
  useEffect(() => {
    const analyser = _analyser
    const bufferLength = analyser?.frequencyBinCount || 128
    const IDLE_STOP_MS = 30_000
    let lastFrameTime = 0
    const IDLE_FPS = 4
    let idleSince = 0

    const startLoop = () => {
      if (runningRef.current) return
      runningRef.current = true
      const loop = (timestamp: number) => {
        if (!isPlaying && !isAudioLoading) {
          if (!idleSince) idleSince = timestamp
          else if (timestamp - idleSince > IDLE_STOP_MS) { runningRef.current = false; return }
        } else { idleSince = 0 }

        tryAttach()

        if (analyser && _ctx?.state === 'running') {
          const data = new Uint8Array(bufferLength)
          analyser.getByteFrequencyData(data)
          setFrequencyData(data)
          const lowBins = Math.floor(bufferLength / 4)
          let sum = 0
          for (let i = 0; i < lowBins; i++) sum += data[i]
          setLowFreqEnergy(sum / (lowBins * 255))
        }

        if (!isPlaying && !isAudioLoading && timestamp - lastFrameTime < 1000 / IDLE_FPS) {
          rafRef.current = requestAnimationFrame(loop); return
        }
        lastFrameTime = timestamp
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    startLoop()
    return () => { cancelAnimationFrame(rafRef.current); runningRef.current = false }
  }, [isPlaying, isAudioLoading, tryAttach])

  // Clear on track change — disconnect source so it stops reading old element
  useEffect(() => {
    if (_source) {
      try { _source.disconnect() } catch {}
      _source = null
    }
  }, [currentItem?.id])

  return { frequencyData, lowFreqEnergy }
}
