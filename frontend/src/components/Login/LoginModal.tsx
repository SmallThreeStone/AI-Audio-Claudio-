import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { sendCaptcha, phoneLogin as phoneLoginApi } from '../../api/auth'
import { startQrLogin, checkQrStatus } from '../../api/auth'
import { trackEvent } from '../../api/analytics'

type LoginTab = 'phone' | 'qr'
type LoginMode = 'captcha' | 'password'
const QR_LOGIN_CACHE_KEY = 'claudio_qr_login'
const QR_TTL_MS = 2.5 * 60 * 1000
const QR_HARD_EXPIRE_GRACE_MS = 20 * 1000

type CachedQrLogin = {
  key: string
  url: string
  createdAt: number
}

function readCachedQrLogin(): CachedQrLogin | null {
  try {
    const raw = localStorage.getItem(QR_LOGIN_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedQrLogin
    if (!cached.key || !cached.url || Date.now() - cached.createdAt > QR_TTL_MS) {
      localStorage.removeItem(QR_LOGIN_CACHE_KEY)
      return null
    }
    return cached
  } catch {
    localStorage.removeItem(QR_LOGIN_CACHE_KEY)
    return null
  }
}

function cacheQrLogin(key: string, url: string) {
  localStorage.setItem(QR_LOGIN_CACHE_KEY, JSON.stringify({ key, url, createdAt: Date.now() }))
}

function clearCachedQrLogin() {
  localStorage.removeItem(QR_LOGIN_CACHE_KEY)
}

export default function LoginModal() {
  const { setQrInfo, clearQrInfo, setUser } = useStore()
  const [tab, setTab] = useState<LoginTab>('phone')

  return (
    <div className="login-shell">
      <section className="login-brief">
        <div className="login-mark glow-pulse">
          <span>C</span>
        </div>
        <h1>
          Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
        </h1>
        <p>连接你的网易云歌单，让 AI DJ 按心情、场景和艺人偏好实时编排私人电台。</p>
        <div className="login-proof">
          <div>
            <strong>歌单优先</strong>
            <span>只从你的素材库开始匹配</span>
          </div>
          <div>
            <strong>AI 调度</strong>
            <span>解释命中、补齐和播放状态</span>
          </div>
          <div>
            <strong>DJ 串词</strong>
            <span>自动生成报幕和过渡</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__head">
          <span>网易云登录</span>
          <h2>建立你的 AI 电台素材库</h2>
        </div>

        <div className="login-tabs">
          <button
            onClick={() => setTab('phone')}
            className={tab === 'phone' ? 'active' : ''}
          >
            手机登录
          </button>
          <button
            onClick={() => setTab('qr')}
            className={tab === 'qr' ? 'active' : ''}
          >
            扫码登录
          </button>
        </div>

        {tab === 'phone' ? (
          <PhoneLogin setUser={setUser} onSwitchQr={() => setTab('qr')} />
        ) : (
          <QrLogin setQrInfo={setQrInfo} clearQrInfo={clearQrInfo} setUser={setUser} />
        )}
      </section>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhoneLogin({ setUser, onSwitchQr }: { setUser: (user: any) => void; onSwitchQr: () => void }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showQrFallback, setShowQrFallback] = useState(false)
  const [mode, setMode] = useState<LoginMode>('captcha')
  const [countdown, setCountdown] = useState(0)

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const handleSendCaptcha = useCallback(async () => {
    if (!phone.trim() || phone.trim().length < 11) {
      setError('请输入正确的手机号')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await sendCaptcha(phone.trim())
      if (result.code === 200) {
        setCountdown(60)
        setError('')
      } else {
        setError(result.message || '验证码发送失败')
      }
    } catch {
      setError('网络异常，请检查后端服务是否启动')
    }
    setLoading(false)
  }, [phone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone.trim()) {
      setError('请输入手机号')
      return
    }
    if (mode === 'captcha' && !captcha.trim()) {
      setError('请输入验证码')
      return
    }
    if (mode === 'password' && !password.trim()) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = mode === 'captcha'
        ? await phoneLoginApi(phone.trim(), '', undefined, captcha.trim())
        : await phoneLoginApi(phone.trim(), password.trim())
      if (result.code === 200) {
        setUser({
          id: result.user_id || 0,
          client_id: result.client_id,
          nickname: result.nickname || '',
          avatar_url: result.avatar_url || '',
          login_status: 'logged_in',
          role: (result.role as 'admin' | 'user') || 'user',
        })
      } else {
        setShowQrFallback(isRiskMessage(result.message || ''))
        setError(result.message || '登录失败')
      }
    } catch {
      setShowQrFallback(false)
      setError('网络异常，请检查后端服务是否启动')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div>
        <label className="block text-xs text-[var(--color-radio-muted)] mb-1.5">手机号</label>
        <div className="flex items-center bg-white/5 border border-[var(--color-radio-border)] rounded-lg overflow-hidden">
          <span className="pl-3 pr-1 text-sm text-[var(--color-radio-muted)]">+86</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="请输入手机号"
            className="flex-1 bg-transparent px-2 py-2.5 text-sm text-[var(--color-radio-text)] outline-none placeholder:text-white/20"
            autoComplete="tel"
          />
        </div>
      </div>

      {mode === 'captcha' ? (
        <div>
          <label className="block text-xs text-[var(--color-radio-muted)] mb-1.5">验证码</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="请输入验证码"
              className="flex-1 bg-white/5 border border-[var(--color-radio-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-radio-text)] outline-none placeholder:text-white/20"
              autoComplete="one-time-code"
            />
            <button
              type="button"
              onClick={handleSendCaptcha}
              disabled={countdown > 0 || loading}
              className="px-3 py-2.5 text-xs bg-white/10 text-[var(--color-radio-text)] rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40 shrink-0"
            >
              {countdown > 0 ? `${countdown}s` : '发送验证码'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs text-[var(--color-radio-muted)] mb-1.5">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full bg-white/5 border border-[var(--color-radio-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-radio-text)] outline-none placeholder:text-white/20"
            autoComplete="current-password"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showQrFallback && (
        <button
          type="button"
          onClick={onSwitchQr}
          className="login-secondary-button"
        >
          改用稳定扫码登录
        </button>
      )}

      <p className="login-helper-note">
        手机端优先使用验证码登录；如果网易云提示环境风险，切到扫码登录更稳。
      </p>

      <button
        type="submit"
        disabled={loading}
        className="login-primary-button"
      >
        {loading ? '登录中...' : '登录'}
      </button>

      <button
        type="button"
        onClick={() => { setMode(mode === 'captcha' ? 'password' : 'captcha'); setError(''); setShowQrFallback(false) }}
        className="text-xs text-[var(--color-radio-accent)] hover:text-[var(--color-radio-accent-dim)]"
      >
        {mode === 'captcha' ? '使用密码登录' : '使用验证码登录'}
      </button>
    </form>
  )
}

function QrLogin({
  setQrInfo,
  clearQrInfo,
  setUser,
}: {
  setQrInfo: (key: string, url: string) => void
  clearQrInfo: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setUser: (user: any) => void
}) {
  const { qrKey, qrUrl } = useStore()
  const [statusText, setStatusText] = useState('加载中...')
  const [isLoading, setIsLoading] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const statusKeyRef = useRef<string | null>(null)
  const expiresAtRef = useRef<number | null>(null)

  useEffect(() => {
    startLogin(false)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  useEffect(() => {
    if (!expiresAt) return
    expiresAtRef.current = expiresAt
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])

  useEffect(() => {
    const handleVisibility = () => {
      const key = statusKeyRef.current
      if (document.visibilityState === 'hidden') {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
        return
      }
      if (document.visibilityState === 'visible' && key) {
        setNowTick(Date.now())
        if (!isQrHardExpired()) setStatusText('正在确认扫码结果...')
        checkOnce(key).catch(() => {})
        if (!pollingRef.current && !isQrHardExpired()) doPoll(key)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const isQrHardExpired = () => {
    return !!expiresAtRef.current && Date.now() > expiresAtRef.current + QR_HARD_EXPIRE_GRACE_MS
  }

  const applyQrResult = async (result: Awaited<ReturnType<typeof checkQrStatus>>) => {
    switch (result.code) {
      case 800:
        if (isQrHardExpired()) {
          setStatusText('二维码已过期，请点击刷新')
          clearCachedQrLogin()
          setExpiresAt(null)
          expiresAtRef.current = null
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
          statusKeyRef.current = null
        } else {
          setStatusText('正在确认扫码结果...')
        }
        break
      case 801:
        setStatusText('等待扫码中...')
        break
      case 802:
        setStatusText('请在手机上确认登录')
        break
      case 803:
        trackEvent('login_success', { method: 'qr' })
        setStatusText(result.auto_sync ? '登录成功，正在扫描你的星系...' : '登录成功！')
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
        statusKeyRef.current = null
        clearCachedQrLogin()
        clearQrInfo()
        setUser({
          id: result.user_id || 0,
          client_id: result.client_id,
          nickname: result.nickname,
          avatar_url: result.avatar_url,
          login_status: 'logged_in',
          role: (result.role as 'admin' | 'user') || 'user',
        })
        if (result.auto_sync) {
          import('../../api/playlists').then(({ syncPlaylists }) => {
            syncPlaylists().then(() => {
              import('../../api/playlists').then(({ getPlaylists }) => {
                getPlaylists().then((pls) => {
                  useStore.getState().setPlaylists(pls)
                }).catch(() => {})
              })
            }).catch(() => {})
          })
        }
        break
    }
  }

  const checkOnce = async (key: string) => {
    const result = await checkQrStatus(key)
    await applyQrResult(result)
  }

  const doPoll = (key: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    statusKeyRef.current = key
    let consecutiveErrors = 0
    pollingRef.current = setInterval(async () => {
      try {
        const result = await checkQrStatus(key)
        consecutiveErrors = 0
        await applyQrResult(result)
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 5) setStatusText('网络异常，正在重试...')
      }
    }, 2000)
  }

  const startLogin = async (forceRefresh = true) => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
    if (!forceRefresh) {
      const cached = readCachedQrLogin()
      if (cached) {
        setQrInfo(cached.key, cached.url)
        const cachedExpiresAt = cached.createdAt + QR_TTL_MS
        setExpiresAt(cachedExpiresAt)
        expiresAtRef.current = cachedExpiresAt
        setStatusText('二维码已锁定，请用网易云音乐扫码或从相册识别')
        doPoll(cached.key)
        return
      }
    } else {
      clearCachedQrLogin()
      clearQrInfo()
      setExpiresAt(null)
      expiresAtRef.current = null
    }
    setIsLoading(true)
    setStatusText('正在获取二维码...')
    try {
      const { qr_key, qr_url } = await startQrLogin()
      trackEvent('login_start', { method: 'qr' })
      setQrInfo(qr_key, qr_url)
      cacheQrLogin(qr_key, qr_url)
      const nextExpiresAt = Date.now() + QR_TTL_MS
      setExpiresAt(nextExpiresAt)
      expiresAtRef.current = nextExpiresAt
      setStatusText('二维码已锁定，请用网易云音乐扫码或从相册识别')
      doPoll(qr_key)
    } catch {
      clearCachedQrLogin()
      setExpiresAt(null)
      expiresAtRef.current = null
      setStatusText('获取二维码失败，请确保后端服务已启动')
    }
    setIsLoading(false)
  }

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - nowTick) / 1000)) : 0

  return (
    <div className="login-form login-form--qr">
      {isLoading ? (
        <div className="w-48 h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : qrUrl ? (
        <div className="login-qr-card">
          <img src={qrUrl} alt="登录二维码" className="login-qr-image" />
          {secondsLeft > 0 && <span>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>}
        </div>
      ) : null}

      <p className="text-sm text-[var(--color-radio-muted)]">{statusText}</p>

      <button onClick={() => startLogin(true)} className="text-xs text-[var(--color-radio-accent)] hover:text-[var(--color-radio-accent-dim)]">
        刷新二维码
      </button>

      <p className="login-helper-note text-center">
        手机截图后去网易云识别图片即可；回到本页时不会自动更换二维码。
      </p>
    </div>
  )
}

function isRiskMessage(message: string) {
  return /风险|异常|安全|验证|频繁/.test(message)
}
