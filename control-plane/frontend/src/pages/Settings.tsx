import { useAuth } from '@/hooks/useAuth'

export default function Settings() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-gray-600 dark:text-gray-400">Gerencie suas preferências e dados</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Perfil do Usuário
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
            <p className="text-gray-900 dark:text-white mt-1">{user?.nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <p className="text-gray-900 dark:text-white mt-1">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Papel</label>
            <p className="text-gray-900 dark:text-white mt-1">{user?.papel}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
