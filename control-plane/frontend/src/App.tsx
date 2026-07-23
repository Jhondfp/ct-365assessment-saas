import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Clients from '@/pages/Clients'
import ClientDetail from '@/pages/ClientDetail'
import ClientRegistration from '@/pages/ClientRegistration'
import TenantProvisioning from '@/pages/TenantProvisioning'
import Tenants from '@/pages/Tenants'
import Executions from '@/pages/Executions'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'
import UserManagement from '@/pages/UserManagement'
import BillingDashboard from '@/pages/BillingDashboard'
import CreditDashboard from '@/pages/CreditDashboard'
import AcceptInvitation from '@/pages/AcceptInvitation'
import LicenseDashboard from '@/pages/LicenseDashboard'
import LicenseAnalysis from '@/pages/LicenseAnalysis'
import LicenseRecommendations from '@/pages/LicenseRecommendations'
import GovernanceDashboard from '@/pages/GovernanceDashboard'
import TrashAudit from '@/pages/TrashAudit'
import StaleFiles from '@/pages/StaleFiles'
import DuplicatesAnalysis from '@/pages/DuplicatesAnalysis'
import GovernanceRecommendations from '@/pages/GovernanceRecommendations'
import GovernanceOverview from '@/pages/GovernanceOverview'
import GovernanceSecurity from '@/pages/GovernanceSecurity'
import GovernanceSites from '@/pages/GovernanceSites'
import GovernanceStorage from '@/pages/GovernanceStorage'
import GovernanceSharing from '@/pages/GovernanceSharing'
import GovernancePermissions from '@/pages/GovernancePermissions'
import { useAuth } from '@/hooks/useAuth'

function AppRoutes() {
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

  // Public routes (no authentication required)
  if (!user) {
    return (
      <Routes>
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/clientes/novo" element={<ClientRegistration />} />
        <Route path="/clientes/:clientId" element={<ClientDetail />} />
        <Route path="/clientes/:clientId/tenant-provisioning" element={<TenantProvisioning />} />
        <Route path="/clientes/:clientId/users" element={<UserManagement />} />
        <Route path="/clientes/:clientId/billing" element={<BillingDashboard />} />
        <Route path="/clientes/:clientId/credits" element={<CreditDashboard />} />
        <Route path="/clientes/:clientId/licenses" element={<LicenseDashboard />} />
        <Route path="/clientes/:clientId/licenses/analysis" element={<LicenseAnalysis />} />
        <Route path="/clientes/:clientId/licenses/recommendations" element={<LicenseRecommendations />} />
        <Route path="/clientes/:clientId/governance" element={<GovernanceDashboard />} />
        <Route path="/clientes/:clientId/governance/overview" element={<GovernanceOverview />} />
        <Route path="/clientes/:clientId/governance/security" element={<GovernanceSecurity />} />
        <Route path="/clientes/:clientId/governance/sites" element={<GovernanceSites />} />
        <Route path="/clientes/:clientId/governance/storage" element={<GovernanceStorage />} />
        <Route path="/clientes/:clientId/governance/sharing" element={<GovernanceSharing />} />
        <Route path="/clientes/:clientId/governance/permissions" element={<GovernancePermissions />} />
        <Route path="/clientes/:clientId/governance/trash" element={<TrashAudit />} />
        <Route path="/clientes/:clientId/governance/stale-files" element={<StaleFiles />} />
        <Route path="/clientes/:clientId/governance/duplicates" element={<DuplicatesAnalysis />} />
        <Route path="/clientes/:clientId/governance/recommendations" element={<GovernanceRecommendations />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/execucoes" element={<Executions />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Detectar preferência do sistema
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const initial = saved || (prefersDark ? 'dark' : 'light')

    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}
