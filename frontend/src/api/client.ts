import axios from 'axios'
import { getClientId } from '../utils/clientId'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// Inject X-Client-Id header on every request for multi-user isolation
api.interceptors.request.use((config) => {
  config.headers['X-Client-Id'] = getClientId()
  const adminToken = window.sessionStorage.getItem('claudio_admin_token')
  if (adminToken) config.headers['X-Admin-Token'] = adminToken
  return config
})

export default api
