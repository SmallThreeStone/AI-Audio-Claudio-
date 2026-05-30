import { useState, useEffect } from 'react'

const ONBOARDING_KEY = 'claudio_onboarding_completed'

const STEPS = [
  {
    title: '登录网易云账号',
    desc: '扫码或手机登录，导入你的私人歌单',
    selector: '[data-onboarding="login"]',
    position: 'bottom',
  },
  {
    title: '导入你的歌单',
    desc: '同步网易云歌单后，AI DJ 才能为你选歌',
    selector: '[data-onboarding="sync"]',
    position: 'left',
  },
  {
    title: '告诉 DJ 你的心情',
    desc: '描述你此刻的心情或场景，AI DJ 为你量身选歌',
    selector: '[data-onboarding="chat"]',
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={finish} />

      {/* Tooltip card */}
      <div className="relative z-10 mx-4 mb-24 sm:mb-0 w-full max-w-xs bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-5 shadow-2xl pointer-events-auto animate-in">
        {/* Step indicator */}
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
