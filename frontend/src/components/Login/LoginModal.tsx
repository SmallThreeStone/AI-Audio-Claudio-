import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { sendCaptcha, phoneLogin as phoneLoginApi } from '../../api/auth'
import { startQrLogin, checkQrStatus } from '../../api/auth'

type LoginTab = 'phone' | 'qr'
type LoginMode = 'captcha' | 'password'

export default function LoginModal() {
  const { setQrInfo, clearQrInfo, setUser } = useStore()
  const [tab, setTab] = useState<LoginTab>('phone')

  return (
    <div className="flex flex-col items-center gap-6 p-8 w-full max-w-sm">
      <div className="text-center">
        <div className="w-16 h-16 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center mx-auto mb-4 glow-pulse">
          <span className="text-white text-2xl font-bold">C</span>
        </div>
        <h1 className="text-2xl font-bold tracking-wide mb-1">
          Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
        </h1>
        <p className="text-[var(--color-radio-muted)] text-sm">你的私人 AI 电台 DJ</p>
      </div>

      <div className="flex w-full bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-1">
        <button
          onClick={() => setTab('phone')}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
            tab === 'phone' ? 'bg-[var(--color-radio-accent)] text-white' : 'text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]'
          }`}
        >
          手机登录
        </button>
        <button
          onClick={() => setTab('qr')}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
            tab === 'qr' ? 'bg-[var(--color-radio-accent)] text-white' : 'text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]'
          }`}
        >
          扫码登录
        </button>
      </div>

      {tab === 'phone' ? <PhoneLogin setUser={setUser} /> : <QrLogin setQrInfo={setQrInfo} clearQrInfo={clearQrInfo} setUser={setUser} />}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhoneLogin({ setUser }: { setUser: (user: any) => void }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
        setError(result.message || '登录失败')
      }
    } catch {
      setError('网络异常，请检查后端服务是否启动')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-6 flex flex-col gap-4">
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

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-[var(--color-radio-accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-radio-accent-dim)] transition-colors disabled:opacity-50"
      >
        {loading ? '登录中...' : '登录'}
      </button>

      <button
        type="button"
        onClick={() => { setMode(mode === 'captcha' ? 'password' : 'captcha'); setError('') }}
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
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    startLogin()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const doPoll = (key: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    let consecutiveErrors = 0
    pollingRef.current = setInterval(async () => {
      try {
        const result = await checkQrStatus(key)
        consecutiveErrors = 0
        switch (result.code) {
          case 800:
            setStatusText('二维码已过期，请点击刷新')
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
            break
          case 801:
            setStatusText('等待扫码中...')
            break
          case 802:
            setStatusText('请在手机上确认登录')
            break
          case 803:
            setStatusText('登录成功！')
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = undefined }
            clearQrInfo()
            setUser({
              id: result.user_id || 0,
              client_id: result.client_id,
              nickname: result.nickname,
              avatar_url: result.avatar_url,
              login_status: 'logged_in',
              role: (result.role as 'admin' | 'user') || 'user',
            })
            break
        }
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 5) setStatusText('网络异常，正在重试...')
      }
    }, 2000)
  }

  const startLogin = async () => {
    setIsLoading(true)
    setStatusText('正在获取二维码...')
    try {
      const { qr_key, qr_url } = await startQrLogin()
      setQrInfo(qr_key, qr_url)
      setStatusText('请使用网易云音乐 APP 扫码登录')
      doPoll(qr_key)
    } catch {
      setStatusText('获取二维码失败，请确保后端服务已启动')
    }
    setIsLoading(false)
  }

  return (
    <div className="w-full bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-6 flex flex-col items-center gap-4">
      {isLoading ? (
        <div className="w-48 h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : qrUrl ? (
        <img src={qrUrl} alt="登录二维码" className="w-48 h-48 rounded-lg bg-white p-2" />
      ) : null}

      <p className="text-sm text-[var(--color-radio-muted)]">{statusText}</p>

      <button onClick={startLogin} className="text-xs text-[var(--color-radio-accent)] hover:text-[var(--color-radio-accent-dim)]">
        刷新二维码
      </button>

      <p className="text-xs text-[var(--color-radio-muted)] text-center">
        使用网易云音乐手机 APP 扫描二维码登录
      </p>
    </div>
  )
}
