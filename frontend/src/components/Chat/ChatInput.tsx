import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { requestRadio, getGreeting, getDemoStatus, adjustMood } from '../../api/radio'
import { trackEvent } from '../../api/analytics'
import { getClientId } from '../../utils/clientId'
import PersonaSelector from './PersonaSelector'
import VoiceInput from './VoiceInput'

const QUICK_PROMPTS = [
  '来几首梁博，适合晚上开车',
  '少说话多放歌，来点民谣摇滚',
  '下雨天，想要有空间感的歌',
  '运动健身，节奏要更燃一点',
  '深夜加班，别太吵但要撑得住',
]

const CONTROL_CHIPS = [
  '只听这个艺人',
  '少说话多放歌',
  '优先我的歌单',
  '不够就补相近风格',
]

export default function ChatInput() {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [greeting, setGreeting] = useState<string | null>(null)
  const [suggestedMood, setSuggestedMood] = useState<string | null>(null)
  const [personalizedPrompts, setPersonalizedPrompts] = useState<string[]>([])
  const [promptSource, setPromptSource] = useState<'ai' | 'context' | 'static' | 'loading'>('loading')
  const [contextBadges, setContextBadges] = useState<string[]>([])
  const [promptsLoaded, setPromptsLoaded] = useState(false)
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
        setPromptSource(g.prompt_source || (g.ai_prompts?.length ? 'ai' : 'context'))
        setContextBadges(g.context_badges || [])
        // Prefer AI-generated prompts over template ones
        if (g.ai_prompts?.length) setPersonalizedPrompts(g.ai_prompts)
        else if (g.personalized_prompts?.length) setPersonalizedPrompts(g.personalized_prompts)
        else {
          setPersonalizedPrompts(QUICK_PROMPTS)
          setPromptSource('static')
        }
        setPromptsLoaded(true)
      })
      .catch((e) => {
        console.warn('Greeting fetch failed:', e)
        setPersonalizedPrompts(QUICK_PROMPTS)
        setPromptSource('static')
        setPromptsLoaded(true)
      })
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

  const appendControl = (chip: string) => {
    setText((prev) => {
      const base = prev.trim()
      if (!base) return chip
      if (base.includes(chip)) return base
      return `${base}，${chip}`
    })
    inputRef.current?.focus()
  }

  const showIdle = !isGenerating && !isSubmitting
  const isBound = user?.login_status === 'logged_in'
  const showDemoEntry = demoAvailable && !isBound && !demoMode
  const promptTitle = promptSource === 'ai' ? 'AI 场景指令' : promptSource === 'context' ? '场景指令' : promptSource === 'loading' ? '正在生成场景指令' : '可直接交给 DJ 的指令'
  const promptHint = promptSource === 'ai' ? '已读取时间、天气和你的曲库偏好' : promptSource === 'context' ? '根据当前场景和曲库生成' : promptSource === 'loading' ? '读取时间、天气和曲库信号' : '先用这些开播，随后会学习你的偏好'

  return (
    <div className="dj-console-input">
      {/* Demo mode entry — shown when user has no songs */}
      {showDemoEntry && (
        <div className="mb-3 p-3 rounded-xl border border-[var(--color-radio-accent)]/30 bg-[var(--color-radio-accent)]/5 text-center">
          <p className="text-xs text-[var(--color-radio-text)] mb-2">
            可先免登录开播；绑定网易云后会同步你的私人歌单。
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
          placeholder="例如：来几首梁博，别太吵，适合晚上开车"
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

      <div className="dj-control-strip">
        {CONTROL_CHIPS.map((chip) => (
          <button key={chip} onClick={() => appendControl(chip)}>
            {chip}
          </button>
        ))}
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
        <div className={`signal-suggestion-block ${promptsLoaded ? '' : 'signal-suggestion-block--loading'}`}>
          <div className="signal-suggestion-title">
            <span />
            <div>
              <p>{promptTitle}</p>
              <em>{promptHint}</em>
            </div>
          </div>
          {contextBadges.length > 0 && (
            <div className="signal-context-row">
              {contextBadges.map((badge) => (
                <span key={badge}>{badge}</span>
              ))}
            </div>
          )}
          {promptsLoaded ? (
            <div className="signal-chip-row">
              {personalizedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="signal-chip"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : (
            <div className="signal-loading-row" aria-label="正在生成场景指令">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
