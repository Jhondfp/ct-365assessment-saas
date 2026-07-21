// ======================================
// Tipos de Autenticação
// ======================================
export interface User {
  id: string
  nome: string
  email: string
  papel: 'superadmin' | 'analista' | 'viewer' | 'viewer_cliente'
  ultimo_acesso?: string
}

export interface AuthResponse {
  id: string
  nome: string
  email: string
  papel: string
}

// ======================================
// Tipos de Negócio
// ======================================
export interface Client {
  id: string
  razao_social: string
  cnpj: string
  email_contato: string
  status: 'active' | 'suspended' | 'terminated'
  regiao: string
  criado_em: string
  atualizado_em: string
  encerrado_em?: string
}

export interface Tenant {
  id: string
  client_id: string
  m365_tenant_id: string
  spo_domain: string
  app_registration_id: string
  key_vault_uri: string
  sql_server: string
  sql_database: string
  regiao: string
  status: 'active' | 'provisioning' | 'suspended' | 'deprovisioning'
  sso_consentido_em?: string
  criado_em: string
  atualizado_em: string
  encerrado_em?: string
}

export interface Execution {
  id: string
  tenant_id: string
  client_id: string
  iniciado_em: string
  finalizado_em?: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  disparado_por: string
  mensagem_erro?: string
  custo_estimado?: number
  custo_real?: number
  tempo_execucao_segundos?: number
  tags_finops?: Record<string, any>
}

// ======================================
// Tipos de API
// ======================================
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  page: number
  limit: number
  data: T[]
}

// ======================================
// Tipos de Dashboard
// ======================================
export interface DashboardSummary {
  clientes_totais: number
  execucoes_mes_atual: number
  custo_mes_atual: number
  execucoes_em_progresso: number
  alertas_orcamento: Alert[]
}

export interface Alert {
  id: string
  tipo: 'warning' | 'error' | 'info'
  titulo: string
  descricao: string
  timestamp: string
}

export interface FinOpsData {
  custo_total: number
  custo_por_cliente: Array<{
    client_id: string
    nome: string
    custo: number
  }>
  custo_por_gb: number
  tendencia: 'crescente' | 'estável' | 'decrescente'
}
