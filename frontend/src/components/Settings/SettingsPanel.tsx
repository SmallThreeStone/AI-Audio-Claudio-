import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { getVoices, getTtsProvider, setTtsProvider, getCalendarStatus } from '../../api/radio'

export default function SettingsPanel() {
  const { showSettings, setShowSettings } = useStore()
  const [activeSection, setActiveSection] = useState<'tts' | 'calendar'>('tts')

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSettings(false)}>
      <div
        className="bg-[var(--color-radio-surface)] rounded-2xl border border-[var(--color-radio-border)] w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-radio-border)]">
          <h2 className="text-lg font-bold">设置</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="w-8 h-8 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-muted)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-[var(--color-radio-border)]">
          {(['tts', 'calendar'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`flex-1 py-3 text-sm transition-colors ${
                activeSection === s
                  ? 'text-[var(--color-radio-accent)] border-b-2 border-[var(--color-radio-accent)]'
                  : 'text-[var(--color-radio-muted)]'
              }`}
            >
              {s === 'tts' ? '语音合成' : '日历集成'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeSection === 'tts' && <TTSSection />}
          {activeSection === 'calendar' && <CalendarSection />}
        </div>
      </div>
    </div>
  )
}

function TTSSection() {
  const { selectedPersona, setSelectedPersona } = useStore()
  const [voices, setVoices] = useState<{ id: string; name: string; gender: string; style: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [provider, setProvider] = useState<'edge' | 'fish'>('edge')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getVoices().then((data) => { setVoices(data || []); setLoaded(true) }).catch(() => {})
    getTtsProvider().then((p) => setProvider(p as 'edge' | 'fish')).catch(() => {})
  }, [])

  const handleProviderChange = useCallback(async (p: 'edge' | 'fish') => {
    setSaving(true)
    try {
      await setTtsProvider(p)
      setProvider(p)
    } catch { /* ignore */ }
    setSaving(false)
  }, [])

  const PERSONAS = [
    { id: 'xiaoyu', name: '小雨', voice: 'zh-CN-XiaoxiaoNeural', desc: '温暖治愈 · 知性陪伴' },
    { id: 'laowang', name: '老王', voice: 'zh-CN-YunjianNeural', desc: '摇滚老炮 · 激情澎湃' },
    { id: 'josie', name: '乔希', voice: 'zh-CN-XiaoyiNeural', desc: '爵士鉴赏 · 优雅格调' },
    { id: 'xiaoai', name: '小艾', voice: 'zh-CN-YunxiaNeural', desc: '电音玩家 · 前卫潮流' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">TTS 引擎</h3>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => handleProviderChange('edge')}
            disabled={saving}
            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
              provider === 'edge'
                ? 'border-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/5 text-[var(--color-radio-text)]'
                : 'border-[var(--color-radio-border)] text-[var(--color-radio-muted)] hover:border-[var(--color-radio-muted)]'
            }`}
          >
            Edge TTS（免费）
          </button>
          <button
            onClick={() => handleProviderChange('fish')}
            disabled={saving}
            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
              provider === 'fish'
                ? 'border-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/5 text-[var(--color-radio-text)]'
                : 'border-[var(--color-radio-border)] text-[var(--color-radio-muted)] hover:border-[var(--color-radio-muted)]'
            }`}
          >
            Fish Audio（情感语音）
          </button>
        </div>
        <p className="text-xs text-[var(--color-radio-muted)]">
          {provider === 'fish'
            ? 'Fish Audio 支持情感语音标签，需在 backend/.env 中配置 FISH_AUDIO_API_KEY。'
            : 'Edge TTS 免费使用，发音清晰自然。'}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">DJ 人设 & 语音</h3>
        <div className="space-y-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPersona(p.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                selectedPersona === p.id
                  ? 'border-[var(--color-radio-accent)] bg-[var(--color-radio-accent)]/5'
                  : 'border-[var(--color-radio-border)] hover:border-[var(--color-radio-muted)]'
              }`}
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-[var(--color-radio-muted)]">
                {p.desc} · 语音: {loaded ? (voices.find((v) => v.id === p.voice)?.name || p.voice) : p.voice}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarSection() {
  const [status, setStatus] = useState<{ connected: boolean; lastSync: string | null } | null>(null)

  useEffect(() => {
    getCalendarStatus().then((s) => setStatus(s ? { connected: s.connected, lastSync: s.last_sync } : null)).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">Google Calendar 集成</h3>
        <p className="text-xs text-[var(--color-radio-muted)] mb-3">
          连接 Google 日历后，AI DJ 会在问候中提及你即将到来的日程，选歌也会考虑日程氛围。
        </p>
      </div>

      {status?.connected && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-green-300">已连接 Google Calendar</span>
          {status.lastSync && (
            <span className="text-[10px] text-[var(--color-radio-muted)] ml-auto">
              最后同步: {new Date(status.lastSync).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div className="bg-[var(--color-radio-card)] rounded-xl p-4 border border-[var(--color-radio-border)]">
        <h4 className="text-xs font-bold text-[var(--color-radio-muted)] uppercase tracking-wider mb-3">配置步骤</h4>
        <ol className="text-xs text-[var(--color-radio-text)] space-y-2 list-decimal list-inside">
          <li>前往 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-[var(--color-radio-accent)] underline">Google Cloud Console</a> 创建 OAuth 2.0 客户端 ID</li>
          <li>选择"Web 应用"，添加授权重定向 URI：<code className="bg-white/10 px-1 rounded text-[10px]">http://localhost:8000/api/calendar/callback</code></li>
          <li>在 <code className="bg-white/10 px-1 rounded text-[10px]">backend/.env</code> 中设置：
            <pre className="bg-black/30 p-2 rounded mt-1 text-[10px] overflow-x-auto">
{`GOOGLE_CLIENT_ID=你的客户端ID
GOOGLE_CLIENT_SECRET=你的客户端密钥
CALENDAR_ENABLED=true`}</pre>
          </li>
          <li>重启后端，点击下方按钮连接</li>
        </ol>
      </div>

      <a
        href="/api/calendar/auth"
        target="_blank"
        rel="noopener"
        className="inline-block px-4 py-2 bg-[var(--color-radio-accent)] text-white text-sm rounded-lg hover:bg-[var(--color-radio-accent-dim)] transition-colors"
      >
        {status?.connected ? '重新连接 Google Calendar' : '连接 Google Calendar'}
      </a>
    </div>
  )
}
