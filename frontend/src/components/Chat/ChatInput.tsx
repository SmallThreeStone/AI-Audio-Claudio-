import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { requestRadio, getGreeting, getDemoStatus, adjustMood } from '../../api/radio'
import { trackEvent } from '../../api/analytics'
import { getClientId } from '../../utils/clientId'
import PersonaSelector from './PersonaSelector'
import VoiceInput from './VoiceInput'

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
  const [personalizedPrompts, setPersonalizedPrompts] = useState<string[]>([])
  const [demoAvailable, setDemoAvailable] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustMoodText, setAdjustMoodText] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const { setIsGenerating, isGenerating, selectedPersona, demoMode, setDemoMode, user, session } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getGreeting()
      .then((g) => {
        setGreeting(g.greeting_text)
        setSuggestedMood(g.suggested_mood)
        if (g.personalized_prompts?.length) setPersonalizedPrompts(g.personalized_prompts)
      })
      .catch((e) => { console.warn('Greeting fetch failed:', e) })
    getDemoStatus()
      .then((d) => { if (d.demo_available) setDemoAvailable(true) })
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
      trackEvent('session_start', { persona: selectedPersona, mood: trimmed })
      if (demoAvailable) setDemoMode(true)
    } catch (e) {
      console.error('Failed to request radio:', e)
      setIsGenerating(false)
    }

    setIsSubmitting(false)
  }

  const handleAdjustMood = async () => {
    const trimmed = adjustMoodText.trim()
    if (!trimmed || adjusting || !session) return
    setAdjusting(true)
    setIsGenerating(true)
    try {
      await adjustMood(session.id, trimmed, getClientId())
      setAdjustMoodText('')
      setShowAdjust(false)
    } catch (e) {
      console.error('Failed to adjust mood:', e)
      setIsGenerating(false)
    }
    setAdjusting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  const showIdle = !isGenerating && !isSubmitting
  const showDemoEntry = demoAvailable && !user && !demoMode

  return (
    <div className="w-full max-w-md">
      {/* Demo mode entry — shown when user has no songs */}
      {showDemoEntry && (
        <div className="mb-3 p-3 rounded-xl border border-[var(--color-radio-accent)]/30 bg-[var(--color-radio-accent)]/5 text-center">
          <p className="text-xs text-[var(--color-radio-text)] mb-2">
            你的曲库还是空的。先体验一下 AI DJ 吧
          </p>
          <button
            onClick={() => handleSubmit('来一首适合当前心情的歌')}
            className="text-xs px-4 py-1.5 rounded-full bg-[var(--color-radio-accent)] text-white hover:opacity-90 transition-opacity"
          >
            体验 Demo
          </button>
        </div>
      )}

      {/* Persona selector + Adjust mood */}
      <div className="flex justify-center items-center gap-2 mb-2">
        <PersonaSelector />
        {session && (session.status === 'ready' || session.status === 'playing') && (
          <button
            onClick={() => { setShowAdjust(!showAdjust); setAdjustMoodText('') }}
            className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-radio-accent)]/30 text-[var(--color-radio-accent)] hover:bg-[var(--color-radio-accent)]/10 transition-colors"
          >
            {showAdjust ? '取消' : '换心情'}
          </button>
        )}
      </div>

      {/* Adjust mood mini input */}
      {showAdjust && session && (
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={adjustMoodText}
            onChange={(e) => setAdjustMoodText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdjustMood() }}
            placeholder="想换什么心情？比如「想听更欢快的」..."
            disabled={adjusting}
            autoFocus
            className="flex-1 bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-radio-accent)] disabled:opacity-50"
          />
          <button
            onClick={handleAdjustMood}
            disabled={adjusting || !adjustMoodText.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-radio-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
          >
            {adjusting ? '...' : '换'}
          </button>
        </div>
      )}

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
        <VoiceInput onResult={(voiceText) => setText((prev) => prev ? `${prev} ${voiceText}` : voiceText)} />
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

      {/* Quick prompts — personalized when available */}
      {showIdle && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {(personalizedPrompts.length > 0 ? personalizedPrompts : QUICK_PROMPTS).map((prompt) => (
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
