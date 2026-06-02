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
  const { setIsGenerating, isGenerating, generationMessage, generationStage, selectedPersona, demoMode, setDemoMode, user, session } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getGreeting()
      .then((g) => {
        setGreeting(g.greeting_text)
        setSuggestedMood(g.suggested_mood)
        // Prefer AI-generated prompts over template ones
        if (g.ai_prompts?.length) setPersonalizedPrompts(g.ai_prompts)
        else if (g.personalized_prompts?.length) setPersonalizedPrompts(g.personalized_prompts)
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
    <div className="dj-console-input">
      {/* Demo mode entry — shown when user has no songs */}
      {showDemoEntry && (
        <div className="mb-3 p-3 rounded-xl border border-[var(--color-radio-accent)]/30 bg-[var(--color-radio-accent)]/5 text-center">
          <p className="text-xs text-[var(--color-radio-text)] mb-2">
            你的曲库还是空的。先体验一下 深空探测 吧
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
      <div className="dj-persona-row">
        <PersonaSelector />
        {session && (session.status === 'ready' || session.status === 'playing') && (
          <button
            onClick={() => { setShowAdjust(!showAdjust); setAdjustMoodText('') }}
            className="signal-chip"
          >
            {showAdjust ? '取消' : '换心情'}
          </button>
        )}
      </div>

      {/* Adjust mood mini input */}
      {showAdjust && session && (
        <div className="dj-adjust-row">
          <input
            type="text"
            value={adjustMoodText}
            onChange={(e) => setAdjustMoodText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdjustMood() }}
            placeholder="想换什么心情？比如「想听更欢快的」..."
            disabled={adjusting}
            autoFocus
            className="dj-mini-input"
          />
          <button
            onClick={handleAdjustMood}
            disabled={adjusting || !adjustMoodText.trim()}
            className="dj-mini-submit"
          >
            {adjusting ? '...' : '换'}
          </button>
        </div>
      )}

      <div className="dj-command-bar">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述心情、天气、场景，AI DJ 会为你开播"
          disabled={isSubmitting || isGenerating}
          className="dj-command-input"
        />
        <VoiceInput onResult={(voiceText) => setText((prev) => prev ? `${prev} ${voiceText}` : voiceText)} />
        <button
          onClick={() => handleSubmit()}
          disabled={isSubmitting || isGenerating || !text.trim()}
          className="dj-command-submit"
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

      {isGenerating && (
        <div className="signal-generation-card">
          <div>
            <span>{generationStage ? '正在生成' : '正在调频'}</span>
            <strong>{generationMessage || 'AI DJ 正在理解你的心情'}</strong>
          </div>
          <div className="signal-generation-pulse">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {/* Greeting banner */}
      {showIdle && greeting && (
        <button
          onClick={() => handleSubmit(suggestedMood || greeting)}
          className="dj-greeting"
        >
          <span className="opacity-60">深空广播: </span>
          {greeting}
        </button>
      )}

      {/* Quick prompts — personalized when available */}
      {showIdle && (
        <div className="signal-suggestion-block">
          <div className="signal-suggestion-title">
            <span />
            <p>AI 推荐点播</p>
          </div>
          <div className="signal-chip-row">
            {(personalizedPrompts.length > 0 ? personalizedPrompts : QUICK_PROMPTS).map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSubmit(prompt)}
                className="signal-chip"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
