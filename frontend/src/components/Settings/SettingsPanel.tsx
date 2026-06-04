import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { getVoices, getTtsProvider, getTtsStatus, setTtsProvider, getCalendarStatus } from '../../api/radio'

export default function SettingsPanel() {
  const { showSettings, setShowSettings } = useStore()
  const [activeSection, setActiveSection] = useState<'tts' | 'calendar'>('tts')

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowSettings(false)}>
      <div
        className="settings-modal fade-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-modal__header">
          <div>
            <span>系统偏好</span>
            <h2>设置</h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="settings-modal__close"
            aria-label="关闭设置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="settings-tabs">
          {(['tts', 'calendar'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={activeSection === s ? 'active' : ''}
            >
              {s === 'tts' ? '语音合成' : '日历集成'}
            </button>
          ))}
        </div>

        <div className="settings-modal__body">
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
  const [ttsStatus, setTtsStatus] = useState<{
    fish_configured: boolean
    fish_reference_voice: boolean
    effective_provider: 'edge' | 'fish'
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getVoices().then((data) => { setVoices(data || []); setLoaded(true) }).catch((e) => { console.warn('TTS voices fetch failed:', e) })
    getTtsProvider().then((p) => setProvider(p as 'edge' | 'fish')).catch((e) => { console.warn('TTS provider fetch failed:', e) })
    getTtsStatus().then((s) => {
      setProvider(s.provider)
      setTtsStatus({
        fish_configured: s.fish_configured,
        fish_reference_voice: s.fish_reference_voice,
        effective_provider: s.effective_provider,
      })
    }).catch((e) => { console.warn('TTS status fetch failed:', e) })
  }, [])

  const handleProviderChange = useCallback(async (p: 'edge' | 'fish') => {
    setSaving(true)
    try {
      await setTtsProvider(p)
      setProvider(p)
      const status = await getTtsStatus()
      setTtsStatus({
        fish_configured: status.fish_configured,
        fish_reference_voice: status.fish_reference_voice,
        effective_provider: status.effective_provider,
      })
    } catch (e) { console.warn('TTS provider switch failed:', e) }
    setSaving(false)
  }, [])

  const PERSONAS = [
    { id: 'xiaoyu', name: '小雨', voice: 'zh-CN-XiaoxiaoNeural', desc: '温暖治愈 · 知性陪伴' },
    { id: 'laowang', name: '老王', voice: 'zh-CN-YunjianNeural', desc: '摇滚老炮 · 激情澎湃' },
    { id: 'josie', name: '乔希', voice: 'zh-CN-XiaoyiNeural', desc: '爵士鉴赏 · 优雅格调' },
    { id: 'xiaoai', name: '小艾', voice: 'zh-CN-YunxiaNeural', desc: '电音玩家 · 前卫潮流' },
  ]

  return (
    <div className="settings-stack">
      <section className="settings-section">
        <div className="settings-section__head">
          <div>
            <span>播报引擎</span>
            <h3>TTS 引擎</h3>
          </div>
          {saving && <em>保存中</em>}
        </div>
        <div className="settings-option-grid">
          <button
            onClick={() => handleProviderChange('edge')}
            disabled={saving}
            className={provider === 'edge' ? 'settings-choice active' : 'settings-choice'}
          >
            <strong>稳定播报</strong>
            <span>Edge TTS · 生成快，适合日常连续收听</span>
          </button>
          <button
            onClick={() => handleProviderChange('fish')}
            disabled={saving}
            className={provider === 'fish' ? 'settings-choice active' : 'settings-choice'}
          >
            <strong>电台质感</strong>
            <span>Fish Audio · 适合更有情绪和主持感的 DJ 声线</span>
          </button>
        </div>
        <div className={ttsStatus?.effective_provider === 'fish' ? 'settings-voice-advice active' : 'settings-voice-advice'}>
          <div>
            <span>当前实际生效</span>
            <strong>{ttsStatus?.effective_provider === 'fish' ? 'Fish Audio 电台声线' : 'Edge TTS 稳定声线'}</strong>
          </div>
          <p>
            {provider === 'fish' && !ttsStatus?.fish_configured
              ? '已选择电台质感，但服务器还没有配置 FISH_AUDIO_API_KEY，本次会自动回到 Edge TTS，避免 DJ 报幕中断。'
              : provider === 'fish'
                ? ttsStatus?.fish_reference_voice
                  ? '已接入参考声线，DJ 报幕会更像固定主持人；适合马上到 6.0 后继续做品牌化声音。'
                  : 'Fish Audio 已可用；配置 FISH_AUDIO_REFERENCE_ID 后，DJ 声音会更稳定、更像一个固定主持人。'
                : '推荐生产默认保持稳定播报；当你想强化“AI 电台主持人”差异化时，再切换电台质感。'}
          </p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <div>
            <span>主持风格</span>
            <h3>DJ 人设 & 语音</h3>
          </div>
        </div>
        <div className="settings-persona-grid">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPersona(p.id)}
              className={selectedPersona === p.id ? 'settings-persona active' : 'settings-persona'}
            >
              <strong>{p.name}</strong>
              <span>{p.desc}</span>
              <em>{loaded ? (voices.find((v) => v.id === p.voice)?.name || p.voice) : p.voice}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CalendarSection() {
  const [status, setStatus] = useState<{ connected: boolean; lastSync: string | null } | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    getCalendarStatus().then((s) => setStatus(s ? { connected: s.connected, lastSync: s.last_sync } : null)).catch((e) => { console.warn('Calendar status fetch failed:', e) })
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const { default: api } = await import('../../api/client')
      const { data } = await api.get('/calendar/auth-url')
      if (data.auth_url) {
        window.location.href = data.auth_url
      }
    } catch (e) { console.warn('Calendar connect failed:', e) }
    setConnecting(false)
  }

  return (
    <div className="settings-stack">
      <section className="settings-section">
        <div className="settings-section__head">
          <div>
            <span>日程信号</span>
            <h3>Google Calendar 集成</h3>
          </div>
        </div>
        <p className="settings-note settings-note--roomy">
          连接 Google 日历后，AI DJ 会在问候中提及你即将到来的日程，选歌也会考虑日程氛围。
        </p>

        {status?.connected && (
          <div className="settings-connected">
            <div />
            <span>已连接 Google Calendar</span>
          {status.lastSync && (
            <em>
              最后同步: {new Date(status.lastSync).toLocaleString()}
            </em>
          )}
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <div>
            <span>接入步骤</span>
            <h3>配置 OAuth</h3>
          </div>
        </div>
        <ol className="calendar-steps">
          <li>
            <span>1</span>
            <p>前往 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a> 创建 OAuth 2.0 客户端 ID。</p>
          </li>
          <li>
            <span>2</span>
            <p>选择 Web 应用，添加授权重定向 URI：</p>
            <code>http://localhost:8000/api/calendar/callback</code>
          </li>
          <li>
            <span>3</span>
            <p>在 <code>backend/.env</code> 中设置：</p>
            <pre>
{`GOOGLE_CLIENT_ID=你的客户端ID
GOOGLE_CLIENT_SECRET=你的客户端密钥
CALENDAR_ENABLED=true`}</pre>
          </li>
          <li>
            <span>4</span>
            <p>重启后端，点击下方按钮连接。</p>
          </li>
        </ol>
      </section>

      <button
        onClick={handleConnect}
        disabled={connecting}
        className="settings-primary-button"
      >
        {connecting ? '获取授权链接...' : status?.connected ? '重新连接 Google Calendar' : '连接 Google Calendar'}
      </button>
    </div>
  )
}
