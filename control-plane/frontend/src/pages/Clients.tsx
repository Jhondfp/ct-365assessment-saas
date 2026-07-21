import { useEffect, useState } from 'react'
import { apiClient } from '@/services/api'
import { Plus, Search, ExternalLink } from 'lucide-react'
import type { Client } from '@/types'

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true)
        const data = await apiClient.listClients()
        setClients(data.data || [])
      } catch (error) {
        console.error('Failed to load clients:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchClients()
  }, [])

  const filtered = clients.filter(c =>
    c.razao_social.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clientes</h1>
          <p className="text-gray-600 dark:text-gray-400">Gerencie os clientes da plataforma</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum cliente encontrado</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  Nome
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  CNPJ
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  Email
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {client.razao_social}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {client.cnpj}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {client.email_contato}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`badge ${
                      client.status === 'active'
                        ? 'badge-success'
                        : client.status === 'suspended'
                        ? 'badge-warning'
                        : 'badge-danger'
                    }`}>
                      {client.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <a href={`/clientes/${client.id}`} className="text-brand-primary hover:underline inline-flex items-center gap-1">
                      Abrir <ExternalLink className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
