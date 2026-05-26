import { useRef, useEffect } from 'react'
import { useAudioVisualizer } from '../../hooks/useAudioVisualizer'
import { useStore } from '../../store'

export default function AudioWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { frequencyData, lowFreqEnergy } = useAudioVisualizer()
  const isPlaying = useStore((s) => s.isPlaying)
  const isAudioLoading = useStore((s) => s.isAudioLoading)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const cx = rect.width / 2
    const cy = rect.height / 2
    const maxRadius = Math.min(cx, cy) * 0.9

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height)

    const data = frequencyData
    const binCount = data.length
    if (binCount === 0) return

    // Divide spectrum into 3 bands for 3 concentric rings
    const bandSize = Math.floor(binCount / 3)

    const drawRing = (
      startBin: number,
      endBin: number,
      baseRadius: number,
      amplitude: number,
      color: string,
    ) => {
      const steps = 180 // angular resolution
      const range = endBin - startBin
      const values: number[] = []

      // Sample frequency bins around the circle
      for (let i = 0; i < steps; i++) {
        const binIdx = startBin + Math.floor((i / steps) * range)
        values.push(data[Math.min(binIdx, binCount - 1)] / 255)
      }

      // Smooth the values for organic look
      const smoothed: number[] = []
      const windowSize = 5
      for (let i = 0; i < values.length; i++) {
        let sum = 0
        let count = 0
        for (let j = -windowSize; j <= windowSize; j++) {
          const idx = (i + j + values.length) % values.length
          sum += values[idx]
          count++
        }
        smoothed.push(sum / count)
      }

      const active = isPlaying && !isAudioLoading

      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const idx = i % steps
        const val = smoothed[idx]
        const mod = active ? val * amplitude : Math.sin(Date.now() / 2000 + i * 0.1) * 0.03 + 0.02
        const r = baseRadius + mod
        const angle = (i / steps) * Math.PI * 2 - Math.PI / 2
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = color
      ctx.lineWidth = active ? 2.5 : 1.5
      ctx.shadowBlur = active ? 12 : 6
      ctx.shadowColor = color
      ctx.stroke()
    }

    // === DRAW ===
    // Responsive ring count: single on small screens, dual on medium, triple on large
    const screenW = window.innerWidth

    if (screenW <= 400) {
      // Single ring — bass only, fuller
      drawRing(0, binCount, maxRadius * 0.85, 24, '#e94560')
    } else if (screenW <= 768) {
      // Dual ring — bass + mids
      drawRing(0, Math.floor(binCount / 2), maxRadius * 0.86, 22, '#e94560')
      drawRing(Math.floor(binCount / 2), binCount, maxRadius * 0.76, 16, '#f0c060')
    } else {
      // Triple ring — full spectrum
      drawRing(0, bandSize, maxRadius * 0.88, 22, '#e94560')
      drawRing(bandSize, bandSize * 2, maxRadius * 0.78, 18, '#f0c060')
      drawRing(bandSize * 2, binCount, maxRadius * 0.68, 14, '#ffe8c0')
    }

    // Center glow
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.55)
    glowGrad.addColorStop(0, 'rgba(233,69,96,0.12)')
    glowGrad.addColorStop(0.5, 'rgba(240,192,96,0.04)')
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Reset shadow
    ctx.shadowBlur = 0
  }, [frequencyData, isPlaying, isAudioLoading, lowFreqEnergy])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
