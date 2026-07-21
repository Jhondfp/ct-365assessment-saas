import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate } from 'react-router-dom'

export default function Login() {
  const { user, login } = useAuth()

  useEffect(() => {
    // Se já autenticado, redirecionar
    if (user) {
      return
    }
  }, [user])

  if (user) {
    return <Navigate to="/" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-primary via-brand-secondary to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-brand-primary rounded-xl flex items-center justify-center text-white font-bold text-3xl shadow-lg">
              CT
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
            CT Assessment
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            Painel de Controle Multi-Tenant
          </p>

          {/* Login Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              ℹ️ Você será redirecionado para autenticar com sua conta Microsoft 365.
            </p>
          </div>

          {/* Login Button */}
          <button
            onClick={login}
            className="w-full btn-primary py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition"
          >
            Entrar com Microsoft
          </button>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Somente para usuários autorizados
            </p>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
              Versão 1.0.0 • Brasil
            </p>
          </div>
        </div>

        {/* Background decoration */}
        <div className="mt-8 text-center">
          <p className="text-white/60 text-sm">
            Plataforma segura de análise de compartilhamentos
          </p>
        </div>
      </div>
    </div>
  )
}
