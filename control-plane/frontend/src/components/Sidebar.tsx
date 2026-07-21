import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  Users,
  Database,
  Zap,
  BarChart3,
  FileText
} from 'lucide-react'

export default function Sidebar() {
  const { user } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin', 'analista', 'viewer'] },
    { path: '/clientes', label: 'Clientes', icon: Users, roles: ['superadmin', 'analista'] },
    { path: '/tenants', label: 'Tenants', icon: Database, roles: ['superadmin', 'analista'] },
    { path: '/execucoes', label: 'Execuções', icon: Zap, roles: ['superadmin', 'analista'] },
    { path: '/finops', label: 'FinOps', icon: BarChart3, roles: ['superadmin', 'analista'] },
    { path: '/relatorios', label: 'Relatórios', icon: FileText, roles: ['superadmin', 'analista'] },
  ]

  const visibleItems = menuItems.filter(item =>
    item.roles.includes(user?.papel || '')
  )

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-slate-700">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition">
          <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center text-white font-bold">
            CT
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">CT Assessment</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Control Plane</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-2">
          {visibleItems.map(item => {
            const Icon = item.icon
            const active = isActive(item.path)

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  active
                    ? 'bg-brand-primary text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Versão 1.0.0
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          © 2026 CT Assessment
        </p>
      </div>
    </aside>
  )
}
