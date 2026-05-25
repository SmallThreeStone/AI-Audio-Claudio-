import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AdminTrend, AdminHourly, AdminUser } from '../../api/admin'

const CHART_COLORS = { accent: '#818cf8', gold: '#f59e0b', grid: '#ffffff10', text: '#9ca3af' }

function formatDate(v: unknown) {
  if (typeof v !== 'string') return String(v ?? '')
  const d = new Date(v)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function TrendChart({ data }: { data: AdminTrend[] }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-[var(--color-radio-muted)]">暂无数据</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={formatDate} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={formatDate}
        />
        <Line type="monotone" dataKey="sessions" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} name="会话" />
        <Line type="monotone" dataKey="listens" stroke={CHART_COLORS.gold} strokeWidth={2} dot={false} name="播放" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function HourlyChart({ data }: { data: AdminHourly[] }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-[var(--color-radio-muted)]">暂无数据</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="hour" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(h: number) => `${h}时`} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(h) => `${h}:00`}
        />
        <Bar dataKey="count" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} name="播放次数" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function UserActivityChart({ users }: { users: AdminUser[] }) {
  const top = [...users]
    .sort((a, b) => b.listen_count - a.listen_count)
    .slice(0, 10)
    .map(u => ({ name: u.nickname || `#${u.id}`, listens: u.listen_count }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 28)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} width={80} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="listens" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} name="播放次数" />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Wrapper for lazy loading — keeps recharts out of the main bundle
export default function ChartsSection({ trends, hourly, users }: {
  trends: AdminTrend[]
  hourly: AdminHourly[]
  users: AdminUser[]
}) {
  return (
    <>
      <div className="bg-[var(--color-radio-card)] rounded-xl p-4 border border-[var(--color-radio-border)]">
        <h3 className="text-xs font-bold text-[var(--color-radio-muted)] uppercase tracking-wider mb-3">7 日趋势</h3>
        <TrendChart data={trends} />
      </div>
      <div className="bg-[var(--color-radio-card)] rounded-xl p-4 border border-[var(--color-radio-border)]">
        <h3 className="text-xs font-bold text-[var(--color-radio-muted)] uppercase tracking-wider mb-3">时段分布</h3>
        <HourlyChart data={hourly} />
      </div>
      <div className="bg-[var(--color-radio-card)] rounded-xl p-4 border border-[var(--color-radio-border)]">
        <h3 className="text-xs font-bold text-[var(--color-radio-muted)] uppercase tracking-wider mb-3">用户活跃</h3>
        <UserActivityChart users={users} />
      </div>
    </>
  )
}
