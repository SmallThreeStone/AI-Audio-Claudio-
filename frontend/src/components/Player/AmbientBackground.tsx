import { useStore } from '../../store'

export default function AmbientBackground() {
  const lowFreqEnergy = useStore((s) => s.lowFreqEnergy)
  const isPlaying = useStore((s) => s.isPlaying)

  // Shift gradient position with bass energy when playing
  const bassShift = isPlaying ? lowFreqEnergy * 15 : 0

  return (
    <div className="fixed inset-0 pointer-events-none ambient-bg" style={{ zIndex: -1 }}>
      <div
        className="ambient-gradient"
        style={{
          background: `
            radial-gradient(ellipse at ${50 - bassShift}% 30%, rgba(233, 69, 96, 0.06) 0%, transparent 55%),
            radial-gradient(ellipse at ${50 + bassShift}% 70%, rgba(240, 192, 96, 0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(100, 100, 255, 0.02) 0%, transparent 60%)
          `,
        }}
      />
    </div>
  )
}
