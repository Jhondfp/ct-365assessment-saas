import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, Trash2, Filter } from 'lucide-react';

interface TrashItem {
  site_title: string;
  item_count: number;
  size_gb: number;
  avg_retention_days: number;
}

export default function TrashAudit() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [filterSite, setFilterSite] = useState('');

  useEffect(() => {
    fetchTrashData();
  }, [clientId]);

  const fetchTrashData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/governance/clients/${clientId}/trash/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch trash data');

      const data = await response.json();
      setDashboardData(data.data);
      setTrashItems(data.data.bySite || []);
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
            <div className="text-red-700">{error || 'No trash data found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData.summary || {};
  const recommendations = dashboardData.recommendations || [];
  const filteredItems = trashItems.filter(item =>
    item.site_title?.toLowerCase().includes(filterSite.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Auditoria de Lixeira</h1>
            <p className="text-gray-600">Análise de itens deletados e políticas de retenção</p>
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
              <h3 className="text-gray-600 font-medium">Total de Itens</h3>
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.total_items || 0}</div>
            <p className="text-sm text-gray-500 mt-2">na lixeira</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Tamanho Total</h3>
              <Trash2 className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{summary.total_size_gb?.toFixed(2) || 0} GB</div>
            <p className="text-sm text-gray-500 mt-2">armazenado</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Sites com Lixeira</h3>
              <Trash2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-blue-600">{summary.sites_with_trash || 0}</div>
            <p className="text-sm text-gray-500 mt-2">sites afetados</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Retenção Média</h3>
              <Trash2 className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-purple-600">{summary.avg_retention_days || 30}</div>
            <p className="text-sm text-gray-500 mt-2">dias</p>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrar por site..."
              value={filterSite}
              onChange={(e) => setFilterSite(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-600">
              Mostrando <span className="font-semibold">{filteredItems.length}</span> de{' '}
              <span className="font-semibold">{trashItems.length}</span> sites
            </span>
          </div>
        </div>

        {/* Trash Items by Site */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Lixeira por Site</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Site</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Quantidade de Itens</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tamanho (GB)</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Retenção Média (dias)</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-600">
                      Nenhum site corresponde aos filtros
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item: TrashItem, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{item.site_title}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          {item.item_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{item.size_gb?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.avg_retention_days} dias</td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-600 hover:text-blue-800 font-medium">
                          Visualizar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Recomendações de Políticas</h2>
            <div className="space-y-4">
              {recommendations.map((rec: any) => (
                <div key={rec.id} className="border border-yellow-200 bg-yellow-50 p-4 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          rec.severidade === 'high'
                            ? 'bg-red-100 text-red-800'
                            : rec.severidade === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {rec.severidade.toUpperCase()}
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

        {/* Timeline Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Período de Retenção</h3>
          <p className="text-blue-800 text-sm">
            Item mais antigo: {summary.oldest_item_date ? new Date(summary.oldest_item_date).toLocaleDateString('pt-BR') : 'N/A'} |
            Item mais recente: {summary.newest_item_date ? new Date(summary.newest_item_date).toLocaleDateString('pt-BR') : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
