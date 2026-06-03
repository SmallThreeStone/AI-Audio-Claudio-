import { useState, useEffect } from 'react'

const ONBOARDING_KEY = 'claudio_onboarding_completed_v2'

const STEPS = [
  {
    title: '先建立找歌素材',
    desc: 'AI DJ 会优先从你的素材池里匹配艺人、心情和场景，也可以随时搜索补歌。',
    selector: '[data-onboarding="sync"]',
    position: 'left',
  },
  {
    title: '说一句想听什么',
    desc: '可以点名艺人，也可以说“少说话多放歌”“不够就补相近风格”。',
    selector: '[data-onboarding="chat"]',
    position: 'top',
  },
  {
    title: '看 AI 怎么调度',
    desc: '节目单会显示命中、补齐、可播和待重试状态，方便你判断曲库质量。',
    selector: '[data-onboarding="queue"]',
    position: 'top',
  },
]

export default function OnboardingOverlay() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(ONBOARDING_KEY)) return
    const timer = setTimeout(() => setVisible(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  const current = STEPS[step]

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setVisible(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      finish()
    }
  }

  return (
    <div className="onboarding-toast">
      <div className="onboarding-toast__card animate-in">
        <div className="flex gap-1 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[var(--color-radio-accent)]' : 'bg-[var(--color-radio-border)]'}`}
            />
          ))}
        </div>

        <h3 className="text-sm font-semibold text-[var(--color-radio-text)] mb-1">
          {current.title}
        </h3>
        <p className="text-xs text-[var(--color-radio-muted)] mb-4">
          {current.desc}
        </p>

        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
          >
            跳过
          </button>
          <span className="text-[10px] text-[var(--color-radio-muted)]">
            {step + 1}/{STEPS.length}
          </span>
          <button
            onClick={next}
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--color-radio-accent)] text-white hover:opacity-90 transition-opacity"
          >
            {step < STEPS.length - 1 ? '下一步' : '完成'}
          </button>
        </div>
      </div>
    </div>
  )
}
