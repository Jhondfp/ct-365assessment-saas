import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '@/services/api'
import type { ExecutionVersion, ExecutionSnapshot, ExecutionDelta } from '@/types'

export default function ExecutionHistory() {
  const { executionId } = useParams<{ executionId: string }>()
  const [versions, setVersions] = useState<ExecutionVersion[]>([])
  const [selectedV1, setSelectedV1] = useState<number | null>(null)
  const [selectedV2, setSelectedV2] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null)
  const [delta, setDelta] = useState<ExecutionDelta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'compare'>('list')

  useEffect(() => {
    const loadVersions = async () => {
      try {
        if (!executionId) return
        const data = await apiClient.getExecutionVersions(executionId)
        setVersions(data)
        if (data.length > 0) {
          setSelectedV1(data[0].version_number)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar histórico')
      } finally {
        setLoading(false)
      }
    }

    loadVersions()
  }, [executionId])

  const handleViewSnapshot = async (version: number) => {
    try {
      if (!executionId) return
      setLoading(true)
      const data = await apiClient.getExecutionSnapshot(executionId, version)
      setSnapshot(data)
      setViewMode('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar snapshot')
    } finally {
      setLoading(false)
    }
  }

  const handleCompareSnapshots = async () => {
    try {
      if (!executionId || !selectedV1 || !selectedV2) return
      setLoading(true)
      const data = await apiClient.compareExecutionSnapshots(executionId, selectedV1, selectedV2)
      setDelta(data)
      setViewMode('compare')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar versões')
    } finally {
      setLoading(false)
    }
  }

  if (loading && versions.length === 0) {
    return <div className="p-8 text-center">Carregando histórico...</div>
  }

  if (error) {
    return <div className="p-8 text-red-600">Erro: {error}</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Histórico de Execução</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sidebar: Lista de versões */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Versões</h2>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.version_number}
                  onClick={() => handleViewSnapshot(v.version_number)}
                  className={`w-full text-left px-4 py-3 rounded border transition ${
                    snapshot?.version_number === v.version_number
                      ? 'bg-orange-50 dark:bg-orange-900 border-orange-400'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium text-sm">v{v.version_number}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(v.criado_em).toLocaleString('pt-BR')}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 rounded border border-blue-200 dark:border-blue-700">
              <h3 className="font-medium mb-3 text-sm text-blue-900 dark:text-blue-100">Comparar Versões</h3>
              <div className="space-y-2">
                <select
                  value={selectedV1 || ''}
                  onChange={(e) => setSelectedV1(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-blue-300 rounded text-sm"
                >
                  <option value="">Versão 1</option>
                  {versions.map((v) => (
                    <option key={v.version_number} value={v.version_number}>
                      v{v.version_number}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedV2 || ''}
                  onChange={(e) => setSelectedV2(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-blue-300 rounded text-sm"
                >
                  <option value="">Versão 2</option>
                  {versions.map((v) => (
                    <option key={v.version_number} value={v.version_number}>
                      v{v.version_number}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleCompareSnapshots}
                  disabled={!selectedV1 || !selectedV2 || selectedV1 === selectedV2}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded font-medium text-sm transition"
                >
                  Comparar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-2">
          {viewMode === 'list' && snapshot && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Snapshot v{snapshot.version_number}
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Versão</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    v{snapshot.version_number}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Data/Hora</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {new Date(snapshot.criado_em).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono">
                  {JSON.stringify(snapshot.snapshot_data, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {viewMode === 'compare' && delta && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Comparação: v{delta.v1_version} vs v{delta.v2_version}
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded border border-blue-200 dark:border-blue-700">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Versão {delta.v1_version}</div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    {new Date(delta.v1_created).toLocaleString('pt-BR')}
                  </div>
                  {delta.findings_count_v1 && (
                    <div className="mt-2 text-lg font-bold text-blue-900 dark:text-blue-100">
                      {delta.findings_count_v1} achados
                    </div>
                  )}
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-900 rounded border border-green-200 dark:border-green-700">
                  <div className="text-sm font-medium text-green-900 dark:text-green-100">Versão {delta.v2_version}</div>
                  <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                    {new Date(delta.v2_created).toLocaleString('pt-BR')}
                  </div>
                  {delta.findings_count_v2 && (
                    <div className="mt-2 text-lg font-bold text-green-900 dark:text-green-100">
                      {delta.findings_count_v2} achados
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {delta.findings_added.length > 0 && (
                  <div>
                    <h3 className="font-medium text-green-700 dark:text-green-300 mb-2">
                      ✓ Novos achados ({delta.findings_added.length})
                    </h3>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {delta.findings_added.slice(0, 5).map((f, i) => (
                        <li key={i} className="flex items-start">
                          <span className="text-green-600 dark:text-green-400 mr-2">+</span>
                          <span>{JSON.stringify(f)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {delta.findings_removed.length > 0 && (
                  <div>
                    <h3 className="font-medium text-red-700 dark:text-red-300 mb-2">
                      ✗ Achados resolvidos ({delta.findings_removed.length})
                    </h3>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {delta.findings_removed.slice(0, 5).map((f, i) => (
                        <li key={i} className="flex items-start">
                          <span className="text-red-600 dark:text-red-400 mr-2">-</span>
                          <span>{JSON.stringify(f)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {delta.findings_added.length === 0 && delta.findings_removed.length === 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma mudança detectada nos achados.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
