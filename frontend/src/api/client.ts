import axios from 'axios'
import { getClientId } from '../utils/clientId'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// Inject X-Client-Id header on every request for multi-user isolation
api.interceptors.request.use((config) => {
  config.headers['X-Client-Id'] = getClientId()
  return config
})

export default api
