import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { requestRadio, getGreeting } from '../../api/radio'
import { getClientId } from '../../utils/clientId'
import PersonaSelector from './PersonaSelector'

const QUICK_PROMPTS = [
  '深夜加班，来点能撑住的',
  '下雨天，想要氛围感音乐',
  '运动健身，来点燃的',
  '周末早晨，轻松慵懒的',
  '失恋了，需要治愈系',
]

export default function ChatInput() {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [greeting, setGreeting] = useState<string | null>(null)
  const [suggestedMood, setSuggestedMood] = useState<string | null>(null)
  const { setIsGenerating, isGenerating, selectedPersona } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getGreeting()
      .then((g) => {
        setGreeting(g.greeting_text)
        setSuggestedMood(g.suggested_mood)
      })
      .catch(() => {})
  }, [])

  // Keyboard avoidance for mobile
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const handleResize = () => {
      const keyboardHeight = window.innerHeight - viewport.height
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
      const input = inputRef.current
      if (keyboardHeight > 100 && input && input === document.activeElement) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    viewport.addEventListener('resize', handleResize)
    return () => viewport.removeEventListener('resize', handleResize)
  }, [])

  const handleSubmit = async (inputText?: string) => {
    const trimmed = (inputText || text).trim()
    if (!trimmed || isSubmitting || isGenerating) return

    setIsSubmitting(true)
    setIsGenerating(true)
    setText('')

    try {
      await requestRadio(trimmed, selectedPersona, getClientId())
    } catch (e) {
      console.error('Failed to request radio:', e)
      setIsGenerating(false)
    }

    setIsSubmitting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  const showIdle = !isGenerating && !isSubmitting

  return (
    <div className="w-full max-w-md">
      {/* Persona selector */}
      <div className="flex justify-center mb-2">
        <PersonaSelector />
      </div>

      <div className="flex items-center gap-2 bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-[var(--color-radio-accent)] transition-colors">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的心情或场景，比如「加班写代码到吐了，来点能撑住的」..."
          disabled={isSubmitting || isGenerating}
          className="flex-1 bg-transparent outline-none text-sm placeholder-[var(--color-radio-muted)] disabled:opacity-50"
        />
        <button
          onClick={() => handleSubmit()}
          disabled={isSubmitting || isGenerating || !text.trim()}
          className="w-8 h-8 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-[var(--color-radio-accent-dim)] transition-colors flex-shrink-0"
        >
          {isSubmitting || isGenerating ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Greeting banner */}
      {showIdle && greeting && (
        <button
          onClick={() => handleSubmit(suggestedMood || greeting)}
          className="w-full mt-3 text-xs text-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/5 border border-[var(--color-radio-accent)]/20 rounded-lg px-3 py-2 hover:bg-[var(--color-radio-accent)]/10 transition-colors text-left"
        >
          <span className="opacity-60">AI DJ: </span>
          {greeting}
        </button>
      )}

      {/* Quick prompts */}
      {showIdle && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSubmit(prompt)}
              className="text-xs px-3 py-1.5 rounded-full border border-[var(--color-radio-border)] hover:border-[var(--color-radio-accent)] hover:bg-[var(--color-radio-accent)]/10 text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
