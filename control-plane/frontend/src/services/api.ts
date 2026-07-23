import axios, { AxiosInstance } from 'axios'
import type {
  Client, Tenant, Execution, DashboardSummary, FinOpsData,
  ExecutionVersion, ExecutionSnapshot, ExecutionDelta, ExecutionTemplate,
  PdfReport
} from '@/types'

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

  // ======================================
  // Histórico de Execuções
  // ======================================
  async getExecutionVersions(executionId: string): Promise<ExecutionVersion[]> {
    const { data } = await this.client.get(`/executions/${executionId}/versions`)
    return data.data || []
  }

  async getExecutionSnapshot(executionId: string, version: number): Promise<ExecutionSnapshot> {
    const { data } = await this.client.get(`/executions/${executionId}/versions/${version}`)
    return data.data
  }

  async compareExecutionSnapshots(executionId: string, v1: number, v2: number): Promise<ExecutionDelta> {
    const { data } = await this.client.get(`/executions/${executionId}/diff`, {
      params: { v1, v2 }
    })
    return data.data
  }

  // ======================================
  // PDF Reports
  // ======================================
  async getPdfReport(executionId: string): Promise<PdfReport> {
    const { data } = await this.client.get(`/executions/${executionId}/report/pdf`)
    return data.data
  }

  // ======================================
  // Execution Templates
  // ======================================
  async createExecutionTemplate(tenantId: string, payload: any): Promise<ExecutionTemplate> {
    const { data } = await this.client.post('/execution-templates', {
      tenant_id: tenantId,
      ...payload
    })
    return data.data
  }

  async getExecutionTemplates(tenantId: string): Promise<ExecutionTemplate[]> {
    const { data } = await this.client.get(`/execution-templates/${tenantId}`)
    return data.data || []
  }

  async updateExecutionTemplate(templateId: string, payload: any): Promise<ExecutionTemplate> {
    const { data } = await this.client.put(`/execution-templates/${templateId}`, payload)
    return data.data
  }

  async deleteExecutionTemplate(templateId: string): Promise<void> {
    await this.client.delete(`/execution-templates/${templateId}`)
  }

  // ======================================
  // Email Queue (Admin)
  // ======================================
  async getEmailQueueStatus(): Promise<{ pending_count: number; items: any[] }> {
    const { data } = await this.client.get('/admin/email-queue')
    return data.data
  }

  // ======================================
  // Admin - Clients
  // ======================================
  async createClientAdmin(payload: any) {
    const { data } = await this.client.post('/admin/clients', payload)
    return data
  }

  async listClientsAdmin(skip = 0, take = 10) {
    const { data } = await this.client.get('/admin/clients', {
      params: { skip, take }
    })
    return data
  }

  async getClientAdmin(clientId: string) {
    const { data } = await this.client.get(`/admin/clients/${clientId}`)
    return data
  }

  async getClientStatsAdmin(clientId: string) {
    const { data } = await this.client.get(`/admin/clients/${clientId}/stats`)
    return data
  }

  async updateClientAdmin(clientId: string, payload: any) {
    const { data } = await this.client.put(`/admin/clients/${clientId}`, payload)
    return data
  }

  // ======================================
  // Admin - Tenants
  // ======================================
  async createTenantAdmin(clientId: string, payload: any) {
    const { data } = await this.client.post(`/admin/clients/${clientId}/tenants`, payload)
    return data
  }

  async listTenantsAdmin(clientId: string) {
    const { data } = await this.client.get(`/admin/clients/${clientId}/tenants`)
    return data
  }

  async getTenantAdmin(tenantId: string) {
    const { data } = await this.client.get(`/admin/tenants/${tenantId}`)
    return data
  }

  async createAppRegistration(tenantId: string, payload: any) {
    const { data } = await this.client.post(`/admin/tenants/${tenantId}/app-registration`, payload)
    return data
  }

  async addSharePointSite(tenantId: string, payload: any) {
    const { data } = await this.client.post(`/admin/tenants/${tenantId}/sharepoint-sites`, payload)
    return data
  }

  async listSharePointSites(tenantId: string) {
    const { data } = await this.client.get(`/admin/tenants/${tenantId}/sharepoint-sites`)
    return data
  }

  // ======================================
  // Admin - Users
  // ======================================
  async inviteUserAdmin(clientId: string, payload: any) {
    const { data } = await this.client.post(`/admin/clients/${clientId}/users/invite`, payload)
    return data
  }

  async listUsersAdmin(clientId: string, skip = 0, take = 10) {
    const { data } = await this.client.get(`/admin/clients/${clientId}/users`, {
      params: { skip, take }
    })
    return data
  }

  async listPendingInvitationsAdmin(clientId: string) {
    const { data } = await this.client.get(`/admin/clients/${clientId}/users/invitations`)
    return data
  }

  async cancelInvitationAdmin(clientId: string, inviteId: string) {
    await this.client.delete(`/admin/clients/${clientId}/users/invitations/${inviteId}`)
  }

  async getUserAdmin(userId: string) {
    const { data } = await this.client.get(`/admin/users/${userId}`)
    return data
  }

  async updateUserAdmin(userId: string, payload: any) {
    const { data } = await this.client.put(`/admin/users/${userId}`, payload)
    return data
  }

  // ======================================
  // Billing - Credit Plans
  // ======================================
  async getCreditPlans() {
    const { data } = await this.client.get('/billing/credit-plans')
    return data
  }

  // ======================================
  // Billing - Client Credits
  // ======================================
  async setupBilling(clientId: string, planId: string) {
    const { data } = await this.client.post(`/billing/clients/${clientId}/setup-billing`, {
      plan_id: planId
    })
    return data
  }

  async getClientCredits(clientId: string) {
    const { data } = await this.client.get(`/billing/clients/${clientId}/credits`)
    return data
  }

  async purchaseCredits(clientId: string, quantity: number, paymentMethod = 'credit_card') {
    const { data } = await this.client.post(`/billing/clients/${clientId}/credits/purchase`, {
      quantity,
      payment_method: paymentMethod
    })
    return data
  }

  async getCreditTransactionHistory(clientId: string, skip = 0, take = 20) {
    const { data } = await this.client.get(`/billing/clients/${clientId}/credits/transactions`, {
      params: { skip, take }
    })
    return data
  }

  async getBillingDashboard(clientId: string) {
    const { data } = await this.client.get(`/billing/clients/${clientId}/billing/dashboard`)
    return data
  }

  async listInvoices(clientId: string, skip = 0, take = 10) {
    const { data } = await this.client.get(`/billing/clients/${clientId}/invoices`, {
      params: { skip, take }
    })
    return data
  }

  async getInvoice(invoiceId: string) {
    const { data } = await this.client.get(`/billing/invoices/${invoiceId}`)
    return data
  }

  // ======================================
  // Auth - Invitation
  // ======================================
  async acceptInvitation(token: string, payload: any) {
    const { data } = await this.client.post('/auth/accept-invitation', {
      token,
      ...payload
    })
    return data
  }

  // ======================================
  // Licenses - Analysis
  // ======================================
  async getLicenseDashboard(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/dashboard`)
    return data
  }

  async getLicenseSummary(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/summary`)
    return data
  }

  async getLicenseUtilization(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/utilization`)
    return data
  }

  async getUnusedLicenses(clientId: string, daysInactive = 30) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/unused`, {
      params: { daysInactive }
    })
    return data
  }

  async getDowngradeOpportunities(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/downgrade-opportunities`)
    return data
  }

  async getLicenseCosts(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/costs`)
    return data
  }

  async getLicenseRecommendations(clientId: string, limit = 20) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/recommendations`, {
      params: { limit }
    })
    return data
  }

  async markRecommendationResolved(recommendationId: string) {
    const { data } = await this.client.patch(`/licenses/recommendations/${recommendationId}/resolve`)
    return data
  }

  async generateLicenseReport(clientId: string) {
    const { data } = await this.client.get(`/licenses/clients/${clientId}/report`)
    return data
  }

  async importLicenseData(clientId: string, licensesData: any) {
    const { data } = await this.client.post(`/licenses/clients/${clientId}/import`, licensesData)
    return data
  }

  // ======================================
  // Governance - Files & Trash Analysis
  // ======================================
  async getFilesDashboard(clientId: string) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/files/dashboard`)
    return data.data
  }

  async getStaleFiles(clientId: string, minYears: number = 1, limit: number = 100) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/files/stale`, {
      params: { minYears, limit }
    })
    return data.data
  }

  async getDuplicateFiles(clientId: string, limit: number = 50) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/files/duplicates`, {
      params: { limit }
    })
    return data.data
  }

  async getFilesByType(clientId: string) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/files/by-type`)
    return data.data
  }

  async getTrashDashboard(clientId: string) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/trash/dashboard`)
    return data.data
  }

  async getTrashItems(clientId: string, siteFilter?: string, limit: number = 500) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/trash/items`, {
      params: { siteFilter, limit }
    })
    return data.data
  }

  async getTrashBySite(clientId: string) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/trash/by-site`)
    return data.data
  }

  async getGovernanceRecommendations(clientId: string, type?: string, limit: number = 20) {
    const { data } = await this.client.get(`/governance/recommendations`, {
      params: { clientId, type, limit }
    })
    return data.data
  }

  async markGovernanceRecommendationResolved(recommendationId: string) {
    const { data } = await this.client.patch(`/governance/recommendations/${recommendationId}/resolve`)
    return data.data
  }

  async importFilesData(clientId: string, filesData: any) {
    const { data } = await this.client.post(`/governance/clients/${clientId}/import/files`, { filesData })
    return data.data
  }

  async importTrashData(clientId: string, trashData: any) {
    const { data } = await this.client.post(`/governance/clients/${clientId}/import/trash`, { trashData })
    return data.data
  }

  async getGovernanceReport(clientId: string) {
    const { data } = await this.client.get(`/governance/clients/${clientId}/report`)
    return data.data
  }
}

export const apiClient = new ApiClient()
