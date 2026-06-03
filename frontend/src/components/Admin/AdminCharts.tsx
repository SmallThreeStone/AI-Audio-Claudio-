import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AdminTrend, AdminHourly, AdminUser } from '../../api/admin'

const CHART_COLORS = { accent: '#18f6d2', gold: '#e2ad58', pink: '#e258a4', grid: '#18f6d214', text: '#8aa4a0' }

function formatDate(v: unknown) {
  if (typeof v !== 'string') return String(v ?? '')
  const d = new Date(v)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function TrendChart({ data }: { data: AdminTrend[] }) {
  if (data.length === 0 || data.every((d) => d.sessions === 0 && d.listens === 0)) {
    return <ChartEmpty title="暂无趋势数据" detail="产生会话或播放后自动绘制 7 日趋势。" />
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={formatDate} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#061010', border: '1px solid rgba(24,246,210,.18)', borderRadius: 8, fontSize: 12 }}
          labelFormatter={formatDate}
        />
        <Line type="monotone" dataKey="sessions" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} name="会话" />
        <Line type="monotone" dataKey="listens" stroke={CHART_COLORS.gold} strokeWidth={2} dot={false} name="播放" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function HourlyChart({ data }: { data: AdminHourly[] }) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return <ChartEmpty title="暂无时段数据" detail="用户播放歌曲后会显示活跃时段。" />
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="hour" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(h: number) => `${h}时`} />
        <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#061010', border: '1px solid rgba(24,246,210,.18)', borderRadius: 8, fontSize: 12 }}
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
  if (top.length === 0 || top.every((u) => u.listens === 0)) {
    return <ChartEmpty title="暂无用户活跃数据" detail="播放事件会用于计算用户活跃度。" />
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 28)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} width={80} />
        <Tooltip
          contentStyle={{ background: '#061010', border: '1px solid rgba(24,246,210,.18)', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="listens" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} name="播放次数" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="admin-chart-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
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
      <div className="admin-chart-card admin-chart-card--wide">
        <div className="admin-chart-card__head">
          <span>过去 7 天</span>
          <h3>会话与播放趋势</h3>
        </div>
        <TrendChart data={trends} />
      </div>
      <div className="admin-chart-card">
        <div className="admin-chart-card__head">
          <span>全天 24 小时</span>
          <h3>播放时段分布</h3>
        </div>
        <HourlyChart data={hourly} />
      </div>
      <div className="admin-chart-card">
        <div className="admin-chart-card__head">
          <span>Top 10</span>
          <h3>用户活跃排行</h3>
        </div>
        <UserActivityChart users={users} />
      </div>
    </>
  )
}
