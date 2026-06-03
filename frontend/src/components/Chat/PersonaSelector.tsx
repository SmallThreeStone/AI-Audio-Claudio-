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
    <div className="persona-selector">
      <button
        onClick={() => setOpen(!open)}
        disabled={isGenerating}
        className="persona-trigger"
        title={`当前主持: ${current?.name || 'DJ'}`}
      >
        <span className="text-sm">{current?.emoji || '🎵'}</span>
        <span>当前主持</span>
        <strong>{current?.name || 'DJ'}</strong>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="persona-menu">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPersona(p.id)
                  setOpen(false)
                }}
                className={p.id === selectedPersona ? 'active' : ''}
              >
                <div>
                  <span>{p.emoji}</span>
                  <div>
                    <strong>{p.name}</strong>
                    <p>{p.tagline}</p>
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
