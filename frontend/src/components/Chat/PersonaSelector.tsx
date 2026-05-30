import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { getPersonas } from '../../api/radio'
import type { DJPersona } from '../../types'

export default function PersonaSelector() {
  const { selectedPersona, setSelectedPersona, isGenerating } = useStore()
  const [personas, setPersonas] = useState<DJPersona[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getPersonas().then(setPersonas).catch((e) => { console.warn('Personas fetch failed:', e) })
  }, [])

  const current = personas.find((p) => p.id === selectedPersona) || personas[0]

  if (personas.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isGenerating}
        className="flex items-center gap-1.5 text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors disabled:opacity-50"
      >
        <span className="text-sm">{current?.emoji || '🎵'}</span>
        <span>{current?.name || 'DJ'}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-56 bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl shadow-xl overflow-hidden">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPersona(p.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2.5 hover:bg-[var(--color-radio-surface)] transition-colors ${
                  p.id === selectedPersona ? 'bg-[var(--color-radio-accent)]/10' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{p.emoji}</span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-[var(--color-radio-muted)]">{p.tagline}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
