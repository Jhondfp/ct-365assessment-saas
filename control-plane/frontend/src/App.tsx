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
import AcceptInvitation from '@/pages/AcceptInvitation'
import LicenseDashboard from '@/pages/LicenseDashboard'
import LicenseAnalysis from '@/pages/LicenseAnalysis'
import LicenseRecommendations from '@/pages/LicenseRecommendations'
import GovernanceDashboard from '@/pages/GovernanceDashboard'
import TrashAudit from '@/pages/TrashAudit'
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
        <Route path="/clientes/:clientId/licenses" element={<LicenseDashboard />} />
        <Route path="/clientes/:clientId/licenses/analysis" element={<LicenseAnalysis />} />
        <Route path="/clientes/:clientId/licenses/recommendations" element={<LicenseRecommendations />} />
        <Route path="/clientes/:clientId/governance" element={<GovernanceDashboard />} />
        <Route path="/clientes/:clientId/governance/trash" element={<TrashAudit />} />
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
