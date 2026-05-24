import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false)
    }
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-radio-text)]">安装 Claudio FM</p>
            <p className="text-xs text-[var(--color-radio-muted)] mt-1">添加到主屏幕，随时随地收听</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPrompt(false)}
              className="text-xs text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] px-3 py-1.5"
            >
              以后
            </button>
            <button
              onClick={handleInstall}
              className="text-xs bg-[var(--color-radio-accent)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--color-radio-accent-dim)] transition-colors"
            >
              安装
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
