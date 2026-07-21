import { useAuth } from '@/hooks/useAuth'
import { LogOut, Moon, Sun, Settings } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Header() {
  const { user, logout } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark'
    setTheme(current || 'light')
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
          CT
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">CT Assessment</h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
          title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          ) : (
            <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </button>

        {/* User menu */}
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-slate-700">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.nome}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user?.papel}</p>
          </div>

          {/* User avatar */}
          <div className="w-8 h-8 bg-brand-secondary rounded-full flex items-center justify-center text-white text-xs font-bold">
            {user?.nome?.charAt(0).toUpperCase()}
          </div>

          {/* Settings & Logout */}
          <div className="flex gap-1 ml-2">
            <a
              href="/configuracoes"
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
              title="Configurações"
            >
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </a>
            <button
              onClick={logout}
              className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition"
              title="Sair"
            >
              <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
