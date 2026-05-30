import api from './client'
import { getClientId } from '../utils/clientId'

export async function trackEvent(eventName: string, payload?: Record<string, unknown>) {
  try {
    await api.post('/analytics/event', {
      event_name: eventName,
      payload: payload || null,
      client_id: getClientId(),
    })
  } catch {
    // fire-and-forget: silently ignore errors
  }
}

export async function getAnalyticsEvents() {
  const { data } = await api.get('/analytics/events')
  return data as {
    event_counts: { event_name: string; count: number }[]
    daily_events: { date: string; count: number }[]
    total_events: number
  }
}
