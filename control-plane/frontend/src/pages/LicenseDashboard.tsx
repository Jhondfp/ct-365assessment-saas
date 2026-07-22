import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Loader, TrendingUp, DollarSign, Users, Zap } from 'lucide-react';

interface LicenseSummary {
  sku_id: string;
  sku_name: string;
  categoria: string;
  total_usuarios: number;
  total_licencas: number;
  licencas_ativas: number;
  utilizacao_media: number;
  custo_mensal: number;
}

interface CostAnalysis {
  total_usuarios: number;
  total_licencas: number;
  custo_mensal_estimado_brl: number;
  custo_anual_estimado_brl: number;
  economia_potencial_mensal_brl: number;
  economia_potencial_anual_brl: number;
  taxa_utilizacao_media: number;
}

export default function LicenseDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);

  useEffect(() => {
    fetchDashboard();
  }, [clientId]);

  const fetchDashboard = async () => {
    try {
      const response = await fetch(`/api/licenses/clients/${clientId}/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch dashboard');

      const data = await response.json();
      setDashboard(data);
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

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error || 'Nenhum dado de licenças disponível'}</div>
          </div>
        </div>
      </div>
    );
  }

  const costAnalysis = dashboard.costAnalysis;
  const recommendations = dashboard.topRecommendations || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Análise de Licenças</h1>
          <p className="text-gray-600">Visão geral das licenças Microsoft 365 e oportunidades de otimização</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Key Metrics */}
        {costAnalysis && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-medium">Total de Licenças</h3>
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{costAnalysis.total_licencas}</div>
              <p className="text-sm text-gray-500 mt-2">
                {costAnalysis.total_usuarios} usuários
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-medium">Custo Mensal</h3>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                R$ {costAnalysis.custo_mensal_estimado_brl?.toFixed(2)}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                R$ {(costAnalysis.custo_mensal_estimado_brl / costAnalysis.total_usuarios)?.toFixed(2)}/usuário
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-medium">Taxa Utilização</h3>
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {costAnalysis.taxa_utilizacao_media?.toFixed(1)}%
              </div>
              <p className="text-sm text-gray-500 mt-2">Média de uso</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-medium">Economia Potencial</h3>
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-purple-600">
                R$ {costAnalysis.economia_potencial_mensal_brl?.toFixed(2)}
              </div>
              <p className="text-sm text-gray-500 mt-2">/mês potencial</p>
            </div>
          </div>
        )}

        {/* License Types */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Licenças por Tipo</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">SKU</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Categoria</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Usuários</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Total</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Ativas</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Utilização</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Custo/Mês</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {dashboard.licenseSummary.map((license: LicenseSummary, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{license.sku_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{license.categoria}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{license.total_usuarios}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{license.total_licencas}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{license.licencas_ativas}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-2 bg-gray-200 rounded-full">
                          <div
                            className="h-2 bg-green-500 rounded-full"
                            style={{ width: `${Math.min(license.utilizacao_media, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{license.utilizacao_media?.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-medium">
                      R$ {license.custo_mensal?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Principais Recomendações</h2>
            </div>

            <div className="divide-y divide-gray-200">
              {recommendations.slice(0, 5).map((rec, idx) => (
                <div key={idx} className="px-6 py-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        rec.severidade === 'high'
                          ? 'bg-red-100 text-red-800'
                          : rec.severidade === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {rec.severidade.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{rec.titulo}</h3>
                      <p className="text-sm text-gray-600 mt-1">{rec.descricao}</p>
                    </div>
                    {rec.economia_potencial_brl && (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-600">
                          R$ {rec.economia_potencial_brl.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">potencial</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
