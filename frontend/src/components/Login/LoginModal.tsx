import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { startQrLogin, checkQrStatus } from '../../api/auth'

export default function LoginModal() {
  const { qrKey, qrUrl, setQrInfo, clearQrInfo, setUser } = useStore()
  const [statusText, setStatusText] = useState('加载中...')
  const [isLoading, setIsLoading] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    startLogin()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const startLogin = async () => {
    setIsLoading(true)
    setStatusText('正在获取二维码...')
    try {
      const { qr_key, qr_url } = await startQrLogin()
      setQrInfo(qr_key, qr_url)
      setStatusText('请使用网易云音乐 APP 扫码登录')
      startPolling(qr_key)
    } catch {
      setStatusText('获取二维码失败，请确保后端服务已启动')
    }
    setIsLoading(false)
  }

  const startPolling = (key: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const result = await checkQrStatus(key)
        switch (result.code) {
          case 800:
            setStatusText('二维码已过期，正在刷新...')
            clearInterval(pollingRef.current)
            clearQrInfo()
            startLogin()
            break
          case 801:
            setStatusText('等待扫码中...')
            break
          case 802:
            setStatusText('请在手机上确认登录')
            break
          case 803:
            setStatusText('登录成功！')
            clearInterval(pollingRef.current)
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
        // silent
      }
    }, 2000)
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center mx-auto mb-4 glow-pulse">
          <span className="text-white text-2xl font-bold">C</span>
        </div>
        <h1 className="text-2xl font-bold tracking-wide mb-1">
          Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
        </h1>
        <p className="text-[var(--color-radio-muted)] text-sm">你的私人 AI 电台 DJ</p>
      </div>

      <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-6 flex flex-col items-center gap-4">
        {isLoading ? (
          <div className="w-48 h-48 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : qrUrl ? (
          <img
            src={qrUrl}
            alt="登录二维码"
            className="w-48 h-48 rounded-lg bg-white p-2"
          />
        ) : null}

        <p className="text-sm text-[var(--color-radio-muted)]">{statusText}</p>

        <button
          onClick={startLogin}
          className="text-xs text-[var(--color-radio-accent)] hover:text-[var(--color-radio-accent-dim)]"
        >
          刷新二维码
        </button>
      </div>

      <p className="text-xs text-[var(--color-radio-muted)]">
        使用网易云音乐手机 APP 扫描二维码登录
      </p>
    </div>
  )
}
