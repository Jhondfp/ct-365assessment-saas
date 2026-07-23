import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, TrendingDown, Database, FileText, Trash2, AlertTriangle } from 'lucide-react';

export default function GovernanceDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    fetchGovernanceData();
  }, [clientId]);

  const fetchGovernanceData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/governance/clients/${clientId}/files/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch governance data');

      const data = await response.json();
      setDashboardData(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error || 'No governance data found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData.summary || {};
  const fileTypes = dashboardData.fileTypes || [];
  const recommendations = dashboardData.topRecommendations || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Governança de Dados</h1>
            <p className="text-gray-600">Análise completa de arquivos e otimização de armazenamento</p>
          </div>
          <button
            onClick={() => navigate(`/clientes/${clientId}`)}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
          >
            ← Voltar
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Total de Arquivos</h3>
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.total_files || 0}</div>
            <p className="text-sm text-gray-500 mt-2">{summary.total_size_gb?.toFixed(2) || 0} GB</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Arquivos Stale</h3>
              <TrendingDown className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{summary.stale_count || 0}</div>
            <p className="text-sm text-gray-500 mt-2">Não modificados >1 ano</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Tipos de Arquivo</h3>
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-600">{summary.unique_file_types || 0}</div>
            <p className="text-sm text-gray-500 mt-2">Extensões únicas</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Sites Analisados</h3>
              <AlertTriangle className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-purple-600">{summary.total_sites || 0}</div>
            <p className="text-sm text-gray-500 mt-2">Com arquivos</p>
          </div>
        </div>

        {/* File Types Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Distribuição por Tipo</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tipo</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Quantidade</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tamanho (GB)</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Idade Média</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Stale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fileTypes.map((type: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono">.{type.file_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{type.count}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{type.size_gb?.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{type.avg_age_years?.toFixed(1)} anos</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        type.stale_count > 0
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {type.stale_count || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Recomendações Principais</h2>
            <div className="space-y-4">
              {recommendations.map((rec: any) => (
                <div key={rec.id} className="border border-blue-200 bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          rec.severidade === 'high'
                            ? 'bg-red-100 text-red-800'
                            : rec.severidade === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {rec.severidade.toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {rec.tipo.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{rec.titulo}</h3>
                      <p className="text-gray-600 mt-2">{rec.descricao}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/stale-files`)}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 rounded-lg hover:shadow-lg transition"
          >
            <TrendingDown className="w-8 h-8 mb-2" />
            <h3 className="font-bold text-lg mb-1">Arquivos Stale</h3>
            <p className="text-sm opacity-90">Identifique dados antigos para limpeza</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/duplicates`)}
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-lg hover:shadow-lg transition"
          >
            <Database className="w-8 h-8 mb-2" />
            <h3 className="font-bold text-lg mb-1">Duplicatas</h3>
            <p className="text-sm opacity-90">Encontre cópias de arquivos</p>
          </button>
        </div>
      </div>
    </div>
  );
}
