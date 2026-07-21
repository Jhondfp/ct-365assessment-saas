import { useEffect, useState } from 'react'
import { apiClient } from '@/services/api'
import { Users, Zap, TrendingUp, AlertCircle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null)
  const [finops, setFinops] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [summaryData, finopsData] = await Promise.all([
          apiClient.getDashboardSummary(),
          apiClient.getFinOpsData()
        ])
        setSummary(summaryData)
        setFinops(finopsData)
      } catch (error) {
        console.error('Failed to load dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Resumo operacional e FinOps</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clientes */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Clientes</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {summary?.clientes_totais || 0}
              </p>
            </div>
            <Users className="w-10 h-10 text-brand-primary opacity-20" />
          </div>
        </div>

        {/* Execuções (mês) */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Execuções (mês)</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {summary?.execucoes_mes_atual || 0}
              </p>
            </div>
            <Zap className="w-10 h-10 text-blue-500 opacity-20" />
          </div>
        </div>

        {/* Custo (mês) */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Custo (mês)</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                R$ {(summary?.custo_mes_atual || 0).toFixed(2)}
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-500 opacity-20" />
          </div>
        </div>

        {/* Em progresso */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Em progresso</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {summary?.execucoes_em_progresso || 0}
              </p>
            </div>
            <AlertCircle className="w-10 h-10 text-yellow-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {summary?.alertas_orcamento && summary.alertas_orcamento.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alertas</h2>
          {summary.alertas_orcamento.map((alert: any) => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border ${
                alert.tipo === 'warning'
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex gap-3">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                  alert.tipo === 'warning' ? 'text-yellow-600' : 'text-red-600'
                }`} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{alert.titulo}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{alert.descricao}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FinOps Section */}
      {finops && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">FinOps</h2>

          {/* Custo por cliente */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Custo por Cliente
            </h3>
            <div className="space-y-3">
              {finops.custo_por_cliente && finops.custo_por_cliente.map((item: any) => (
                <div key={item.client_id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{item.nome}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(item.custo / finops.custo_total * 100).toFixed(1)}% do total
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    R$ {item.custo.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Total</span>
                <span className="text-2xl font-bold text-brand-primary">
                  R$ {finops.custo_total.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Custo / GB</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  R$ {finops.custo_por_gb.toFixed(2)}/GB
                </span>
              </div>
            </div>
          </div>

          {/* Tendência */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Tendência de Custo
            </h3>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Tendência: <strong>{finops.tendencia}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
