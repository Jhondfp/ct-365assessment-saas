import axios, { AxiosInstance } from 'axios'
import type { Client, Tenant, Execution, DashboardSummary, FinOpsData } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Interceptor para tratar erros
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          // Redirecionar para login
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  // ======================================
  // Autenticação
  // ======================================
  async getMe() {
    const { data } = await this.client.get('/auth/me')
    return data
  }

  async login() {
    window.location.href = `${API_BASE}/auth/login`
  }

  async logout() {
    await this.client.get('/auth/logout')
    window.location.href = '/'
  }

  async getCustomerConsent(clientId: string) {
    const { data } = await this.client.get('/auth/customer-consent', {
      params: { client_id: clientId }
    })
    return data
  }

  // ======================================
  // Clientes
  // ======================================
  async listClients(page = 0, limit = 20) {
    const { data } = await this.client.get('/clients', {
      params: { page, limit }
    })
    return data
  }

  async getClient(clientId: string) {
    const { data } = await this.client.get(`/clients/${clientId}`)
    return data
  }

  async createClient(payload: Partial<Client>) {
    const { data } = await this.client.post('/clients', payload)
    return data
  }

  async updateClient(clientId: string, payload: Partial<Client>) {
    const { data } = await this.client.patch(`/clients/${clientId}`, payload)
    return data
  }

  // ======================================
  // Tenants
  // ======================================
  async getTenant(tenantId: string) {
    const { data } = await this.client.get(`/tenants/${tenantId}`)
    return data
  }

  async recordTenantConsent(tenantId: string, payload: any) {
    const { data } = await this.client.post(`/tenants/${tenantId}/consent`, payload)
    return data
  }

  // ======================================
  // Execuções
  // ======================================
  async getExecution(executionId: string) {
    const { data } = await this.client.get(`/executions/${executionId}`)
    return data
  }

  async startExecution(payload: { tenant_id: string; client_id: string }) {
    const { data } = await this.client.post('/executions', payload)
    return data
  }

  // ======================================
  // Dashboard
  // ======================================
  async getDashboardSummary(): Promise<DashboardSummary> {
    const { data } = await this.client.get('/dashboard/summary')
    return data
  }

  async getDashboardExecutions() {
    const { data } = await this.client.get('/dashboard/executions')
    return data
  }

  async getFinOpsData(): Promise<FinOpsData> {
    const { data } = await this.client.get('/dashboard/finops')
    return data
  }
}

export const apiClient = new ApiClient()
