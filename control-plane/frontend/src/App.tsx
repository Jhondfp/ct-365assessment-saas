import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import PainelPrincipal from '@/pages/Dashboard'
import Clientes from '@/pages/Clients'
import DetalheCliente from '@/pages/ClientDetail'
import RegistroCliente from '@/pages/ClientRegistration'
import ProvisionamentoTenant from '@/pages/TenantProvisioning'
import Inquilinos from '@/pages/Tenants'
import Execucoes from '@/pages/Executions'
import Configuracoes from '@/pages/Settings'
import Login from '@/pages/Login'
import GerenciamentoUsuarios from '@/pages/UserManagement'
import PainelFaturamento from '@/pages/BillingDashboard'
import PainelCreditos from '@/pages/CreditDashboard'
import AceitarConvite from '@/pages/AcceptInvitation'
import PainelLicencas from '@/pages/LicenseDashboard'
import AnaliseeLicencas from '@/pages/LicenseAnalysis'
import RecomendacoesLicencas from '@/pages/LicenseRecommendations'
import PainelGovernanca from '@/pages/GovernanceDashboard'
import AuditoriaLixo from '@/pages/TrashAudit'
import ArquivosAntigos from '@/pages/StaleFiles'
import Analiseduplicatas from '@/pages/DuplicatesAnalysis'
import RecomendacoesGovernanca from '@/pages/GovernanceRecommendations'
import VisaoGeralGovernanca from '@/pages/GovernanceOverview'
import SegurancaGovernanca from '@/pages/GovernanceSecurity'
import SitesGovernanca from '@/pages/GovernanceSites'
import ArmazenamentoGovernanca from '@/pages/GovernanceStorage'
import CompartilhamentoGovernanca from '@/pages/GovernanceSharing'
import PermissoesGovernanca from '@/pages/GovernancePermissions'
import PainelTimes from '@/pages/TeamsDashboard'
import { useAuth } from '@/hooks/useAuth'

function RotasApp() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-muted">Carregando...</p>
        </div>
      </div>
    )
  }

  // Rotas públicas (sem autenticação)
  if (!user) {
    return (
      <Routes>
        <Route path="/aceitar-convite" element={<AceitarConvite />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PainelPrincipal />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/novo" element={<RegistroCliente />} />
        <Route path="/clientes/:clientId" element={<DetalheCliente />} />
        <Route path="/clientes/:clientId/provisionamento-tenant" element={<ProvisionamentoTenant />} />
        <Route path="/clientes/:clientId/usuarios" element={<GerenciamentoUsuarios />} />
        <Route path="/clientes/:clientId/faturamento" element={<PainelFaturamento />} />
        <Route path="/clientes/:clientId/creditos" element={<PainelCreditos />} />
        <Route path="/clientes/:clientId/licencas" element={<PainelLicencas />} />
        <Route path="/clientes/:clientId/licencas/analise" element={<AnaliseeLicencas />} />
        <Route path="/clientes/:clientId/licencas/recomendacoes" element={<RecomendacoesLicencas />} />
        <Route path="/clientes/:clientId/governanca" element={<PainelGovernanca />} />
        <Route path="/clientes/:clientId/governanca/visao-geral" element={<VisaoGeralGovernanca />} />
        <Route path="/clientes/:clientId/governanca/seguranca" element={<SegurancaGovernanca />} />
        <Route path="/clientes/:clientId/governanca/sites" element={<SitesGovernanca />} />
        <Route path="/clientes/:clientId/governanca/armazenamento" element={<ArmazenamentoGovernanca />} />
        <Route path="/clientes/:clientId/governanca/compartilhamento" element={<CompartilhamentoGovernanca />} />
        <Route path="/clientes/:clientId/governanca/permissoes" element={<PermissoesGovernanca />} />
        <Route path="/clientes/:clientId/governanca/times" element={<PainelTimes />} />
        <Route path="/clientes/:clientId/governanca/lixo" element={<AuditoriaLixo />} />
        <Route path="/clientes/:clientId/governanca/arquivos-antigos" element={<ArquivosAntigos />} />
        <Route path="/clientes/:clientId/governanca/duplicatas" element={<Analiseduplicatas />} />
        <Route path="/clientes/:clientId/governanca/recomendacoes" element={<RecomendacoesGovernanca />} />
        <Route path="/inquilinos" element={<Inquilinos />} />
        <Route path="/execucoes" element={<Execucoes />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/aceitar-convite" element={<AceitarConvite />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default function Aplicacao() {
  const [tema, setTema] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Detectar preferência do sistema
    const preferirEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches
    const salvo = localStorage.getItem('theme') as 'light' | 'dark' | null
    const inicial = salvo || (preferirEscuro ? 'dark' : 'light')

    setTema(inicial)
    document.documentElement.setAttribute('data-theme', inicial)
  }, [])

  const alternarTema = () => {
    const novoTema = tema === 'light' ? 'dark' : 'light'
    setTema(novoTema)
    localStorage.setItem('theme', novoTema)
    document.documentElement.setAttribute('data-theme', novoTema)
  }

  return (
    <Router>
      <RotasApp />
    </Router>
  )
}
