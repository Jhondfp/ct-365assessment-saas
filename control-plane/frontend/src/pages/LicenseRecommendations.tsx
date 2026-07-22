import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, TrendingUp, DollarSign, CheckCircle, Filter } from 'lucide-react';

interface Recommendation {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  descricao: string;
  economia_potencial_brl: number;
  usuarios_afetados: number;
  sku_id_afetado: string;
  data_criacao: string;
  resolvido: boolean;
}

export default function LicenseRecommendations() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendations, setRecommendations] = useState<any>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, [clientId]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/licenses/clients/${clientId}/recommendations`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');

      const data = await response.json();
      setRecommendations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveRecommendation = async (recommendationId: string) => {
    setResolving(recommendationId);
    try {
      const response = await fetch(`/api/licenses/recommendations/${recommendationId}/resolve`, {
        method: 'PATCH',
      });

      if (!response.ok) throw new Error('Failed to resolve recommendation');

      await fetchRecommendations();
    } catch (err) {
      console.error('Error resolving recommendation:', err);
    } finally {
      setResolving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!recommendations) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error || 'Nenhuma recomendação encontrada'}</div>
          </div>
        </div>
      </div>
    );
  }

  const allRecommendations = recommendations.recommendations || [];
  const filteredRecommendations = allRecommendations.filter((rec: Recommendation) => {
    if (filterSeverity !== 'all' && rec.severidade !== filterSeverity) return false;
    if (filterType !== 'all' && rec.tipo !== filterType) return false;
    return true;
  });

  const totalPotentialSavings = allRecommendations.reduce(
    (sum: number, rec: Recommendation) => sum + (rec.economia_potencial_brl || 0),
    0
  );

  const typeLabels: Record<string, string> = {
    unused_license: 'Licença Não Utilizada',
    downgrade_opportunity: 'Oportunidade de Downgrade',
    upgrade_opportunity: 'Oportunidade de Upgrade',
    service_disabled: 'Serviço Desabilitado',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Recomendações de Otimização</h1>
            <p className="text-gray-600">Ações sugeridas para otimizar suas licenças Microsoft 365</p>
          </div>
          <button
            onClick={() => navigate(`/clients/${clientId}/licenses`)}
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
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Total de Recomendações</h3>
              <AlertCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{allRecommendations.length}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Economia Potencial</h3>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-600">
              R$ {totalPotentialSavings.toFixed(2)}/mês
            </div>
            <p className="text-sm text-gray-500 mt-2">
              R$ {(totalPotentialSavings * 12).toFixed(2)}/ano
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Taxa de Implementação</h3>
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {allRecommendations.length > 0
                ? (((allRecommendations.filter((r: Recommendation) => r.resolvido).length) / allRecommendations.length) * 100).toFixed(0)
                : 0}
              %
            </div>
            <p className="text-sm text-gray-500 mt-2">Recomendações implementadas</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Severidade</label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todas</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="unused_license">Licenças Não Utilizadas</option>
                <option value="downgrade_opportunity">Downgrade</option>
                <option value="upgrade_opportunity">Upgrade</option>
                <option value="service_disabled">Serviço Desabilitado</option>
              </select>
            </div>

            <div className="ml-auto pt-6">
              <p className="text-sm text-gray-600">
                Mostrando <span className="font-semibold">{filteredRecommendations.length}</span> de{' '}
                <span className="font-semibold">{allRecommendations.length}</span> recomendações
              </p>
            </div>
          </div>
        </div>

        {/* Recommendations List */}
        <div className="space-y-4">
          {filteredRecommendations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">Nenhuma recomendação correspondente aos filtros</p>
            </div>
          ) : (
            filteredRecommendations.map((rec: Recommendation) => (
              <div key={rec.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-4 mb-3">
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          rec.severidade === 'high'
                            ? 'bg-red-100 text-red-800'
                            : rec.severidade === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {rec.severidade.toUpperCase()}
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          rec.tipo === 'unused_license'
                            ? 'bg-gray-100 text-gray-800'
                            : rec.tipo === 'downgrade_opportunity'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {typeLabels[rec.tipo] || rec.tipo}
                      </div>
                      {rec.resolvido && (
                        <div className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          RESOLVIDO
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{rec.titulo}</h3>
                    <p className="text-gray-600 mb-4">{rec.descricao}</p>

                    <div className="grid grid-cols-4 gap-4 text-sm">
                      {rec.usuarios_afetados && (
                        <div>
                          <span className="text-gray-600">Usuários Afetados:</span>
                          <p className="font-semibold text-gray-900">{rec.usuarios_afetados}</p>
                        </div>
                      )}
                      {rec.economia_potencial_brl && (
                        <div>
                          <span className="text-gray-600">Economia/Mês:</span>
                          <p className="font-semibold text-green-600">R$ {rec.economia_potencial_brl.toFixed(2)}</p>
                        </div>
                      )}
                      {rec.sku_id_afetado && (
                        <div>
                          <span className="text-gray-600">SKU Afetado:</span>
                          <p className="font-semibold text-gray-900">{rec.sku_id_afetado}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Criada em:</span>
                        <p className="font-semibold text-gray-900">
                          {new Date(rec.data_criacao).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {!rec.resolvido && (
                    <button
                      onClick={() => handleResolveRecommendation(rec.id)}
                      disabled={resolving === rec.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 whitespace-nowrap"
                    >
                      {resolving === rec.id ? 'Marcando...' : 'Marcar Resolvida'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
