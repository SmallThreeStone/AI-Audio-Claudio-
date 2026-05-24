import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import {
  getAdminOverview, getAdminUsers, getAdminSessions, getAdminListening,
  type AdminOverview, type AdminUser, type AdminSession, type AdminListenEvent,
} from '../../api/admin'

type Tab = 'users' | 'sessions' | 'listening'

const statusBadge: Record<string, string> = {
  logged_in: 'bg-green-500/20 text-green-400',
  logged_out: 'bg-gray-500/20 text-gray-400',
  qr_pending: 'bg-yellow-500/20 text-yellow-400',
}

const sessionStatusBadge: Record<string, string> = {
  generating: 'bg-blue-500/20 text-blue-400',
  refilling: 'bg-blue-500/20 text-blue-400',
  ready: 'bg-green-500/20 text-green-400',
  playing: 'bg-green-500/20 text-green-400',
  completed: 'bg-gray-500/20 text-gray-400',
  error: 'bg-red-500/20 text-red-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
}

const eventBadge: Record<string, string> = {
  started: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-red-500/20 text-red-400',
}

export default function AdminDashboard() {
  const { setShowAdmin } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [events, setEvents] = useState<AdminListenEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAdminOverview(),
      getAdminUsers(),
      getAdminSessions(),
      getAdminListening(),
    ]).then(([ov, us, ss, ev]) => {
      setOverview(ov)
      setUsers(us)
      setSessions(ss)
      setEvents(ev)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="radio-bg min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: '用户管理' },
    { key: 'sessions', label: '会话记录' },
    { key: 'listening', label: '播放记录' },
  ]

  return (
    <div className="radio-bg min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-radio-border)] bg-[var(--color-radio-surface)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--color-radio-accent)] rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-bold tracking-wide">
              Claudio<span className="text-[var(--color-radio-muted)] font-normal"> FM</span>
              <span className="text-[var(--color-radio-gold)] text-sm ml-2">管理面板</span>
            </span>
          </div>
          <button
            onClick={() => setShowAdmin(false)}
            className="text-sm text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
          >
            返回电台
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="总用户" value={overview.total_users} sub={`${overview.active_users} 活跃`} />
            <Card label="总会话" value={overview.total_sessions} sub={`今日 ${overview.sessions_today}`} />
            <Card label="歌曲库" value={overview.total_songs} />
            <Card label="总播放" value={overview.total_listens} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-radio-card)] rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
                activeTab === t.key
                  ? 'bg-[var(--color-radio-accent)] text-white'
                  : 'text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl overflow-hidden">
          {activeTab === 'users' && <UsersTable users={users} />}
          {activeTab === 'sessions' && <SessionsTable sessions={sessions} />}
          {activeTab === 'listening' && <ListeningTable events={events} />}
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl p-4">
      <div className="text-[var(--color-radio-muted)] text-xs mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--color-radio-text)]">{value}</div>
      {sub && <div className="text-xs text-[var(--color-radio-muted)] mt-0.5">{sub}</div>}
    </div>
  )
}

function UsersTable({ users }: { users: AdminUser[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">角色</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">状态</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">会话</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">播放</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">注册时间</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {u.avatar_url && <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />}
                  <span className="text-[var(--color-radio-text)]">{u.nickname || `#${u.id}`}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  u.role === 'admin' ? 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[u.login_status] || ''}`}>
                  {u.login_status === 'logged_in' ? '在线' : u.login_status === 'qr_pending' ? '待登录' : '离线'}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">{u.session_count}</td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">{u.listen_count}</td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SessionsTable({ sessions }: { sessions: AdminSession[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">请求</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">主题</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">状态</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">进度</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3 text-[var(--color-radio-text)]">{s.user_nickname}</td>
              <td className="px-4 py-3 text-[var(--color-radio-text)] max-w-[200px] truncate">{s.user_request}</td>
              <td className="px-4 py-3 text-[var(--color-radio-muted)] max-w-[160px] truncate">{s.session_theme || '-'}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${sessionStatusBadge[s.status] || ''}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)]">
                {s.played_items}/{s.total_items}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {s.created_at ? new Date(s.created_at).toLocaleString('zh-CN') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListeningTable({ events }: { events: AdminListenEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-radio-border)]">
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">用户</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">歌曲</th>
            <th className="text-left px-4 py-3 text-[var(--color-radio-muted)] font-medium">事件</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">完播率</th>
            <th className="text-right px-4 py-3 text-[var(--color-radio-muted)] font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id} className="border-b border-[var(--color-radio-border)]/50 hover:bg-white/5">
              <td className="px-4 py-3 text-[var(--color-radio-text)]">{e.user_nickname}</td>
              <td className="px-4 py-3 text-[var(--color-radio-text)] max-w-[200px] truncate">{e.song_name}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${eventBadge[e.event] || ''}`}>
                  {e.event === 'started' ? '开始' : e.event === 'completed' ? '完播' : e.event === 'skipped' ? '跳过' : e.event}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-text)]">
                {e.completion_rate != null ? `${Math.round(e.completion_rate * 100)}%` : '-'}
              </td>
              <td className="px-4 py-3 text-right text-[var(--color-radio-muted)] text-xs">
                {e.listened_at ? new Date(e.listened_at).toLocaleString('zh-CN') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
