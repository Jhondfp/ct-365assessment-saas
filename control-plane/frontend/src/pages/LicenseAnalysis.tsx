import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, Users, Clock, TrendingDown, AlertTriangle } from 'lucide-react';

interface UnusedLicense {
  id: string;
  user_email: string;
  sku_name: string;
  dias_inativo: number;
  utilizacao_percentual: number;
  preco_unitario_brl: number;
  prioridade: string;
}

interface DowngradeOpportunity {
  user_email: string;
  sku_name: string;
  servicos_utilizados: number;
  total_servicos_disponiveis: number;
  utilizacao_percentual: number;
  economia_potencial: number;
}

export default function LicenseAnalysis() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'unused' | 'downgrade' | 'utilization'>('unused');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [unusedLicenses, setUnusedLicenses] = useState<any>(null);
  const [downgradeOpportunities, setDowngradeOpportunities] = useState<any>(null);
  const [utilization, setUtilization] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [unusedRes, downgradeRes, utilizationRes] = await Promise.all([
        fetch(`/api/licenses/clients/${clientId}/unused?daysInactive=30`),
        fetch(`/api/licenses/clients/${clientId}/downgrade-opportunities`),
        fetch(`/api/licenses/clients/${clientId}/utilization`),
      ]);

      if (!unusedRes.ok || !downgradeRes.ok || !utilizationRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [unusedData, downgradeData, utilizationData] = await Promise.all([
        unusedRes.json(),
        downgradeRes.json(),
        utilizationRes.json(),
      ]);

      setUnusedLicenses(unusedData);
      setDowngradeOpportunities(downgradeData);
      setUtilization(utilizationData);
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Análise de Utilização</h1>
            <p className="text-gray-600">Detalhamento de licenças não utilizadas e oportunidades de otimização</p>
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

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('unused')}
                className={`px-6 py-4 font-medium border-b-2 transition ${
                  activeTab === 'unused'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-4 h-4 inline mr-2" />
                Licenças Não Utilizadas ({unusedLicenses?.summary?.total || 0})
              </button>
              <button
                onClick={() => setActiveTab('downgrade')}
                className={`px-6 py-4 font-medium border-b-2 transition ${
                  activeTab === 'downgrade'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <TrendingDown className="w-4 h-4 inline mr-2" />
                Downgrade Oportunidades ({downgradeOpportunities?.summary?.total || 0})
              </button>
              <button
                onClick={() => setActiveTab('utilization')}
                className={`px-6 py-4 font-medium border-b-2 transition ${
                  activeTab === 'utilization'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Utilização Geral
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'unused' && unusedLicenses && (
              <div className="space-y-4">
                {unusedLicenses.summary && (
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-red-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total Crítico</p>
                      <p className="text-2xl font-bold text-red-600">{unusedLicenses.summary.critical || 0}</p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total Alto</p>
                      <p className="text-2xl font-bold text-orange-600">{unusedLicenses.summary.high || 0}</p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total Médio</p>
                      <p className="text-2xl font-bold text-yellow-600">{unusedLicenses.summary.medium || 0}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Economia Potencial</p>
                      <p className="text-2xl font-bold text-green-600">
                        R$ {(unusedLicenses.summary.potentialSavings || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email do Usuário</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Licença</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Dias Inativo</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Utilização</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Custo/Mês</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Prioridade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {unusedLicenses.items?.slice(0, 50).map((license: UnusedLicense, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">{license.user_email}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{license.sku_name}</td>
                          <td className="px-6 py-4 text-sm font-medium">
                            <span className="text-red-600">{license.dias_inativo} dias</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-2 bg-gray-200 rounded-full">
                                <div
                                  className="h-2 bg-red-500 rounded-full"
                                  style={{ width: `${license.utilizacao_percentual}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600">{license.utilizacao_percentual?.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">R$ {license.preco_unitario_brl?.toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                license.prioridade === 'Critical'
                                  ? 'bg-red-100 text-red-800'
                                  : license.prioridade === 'High'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {license.prioridade}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'downgrade' && downgradeOpportunities && (
              <div className="space-y-4">
                {downgradeOpportunities.summary && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total de Oportunidades</p>
                      <p className="text-2xl font-bold text-blue-600">{downgradeOpportunities.summary.total || 0}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Economia Mensal</p>
                      <p className="text-2xl font-bold text-green-600">
                        R$ {(downgradeOpportunities.summary.potentialMonthlySavings || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Economia Anual</p>
                      <p className="text-2xl font-bold text-purple-600">
                        R$ {(downgradeOpportunities.summary.potentialAnnualSavings || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email do Usuário</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Licença Atual</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Serviços Utilizados</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Utilização</th>
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Economia/Mês</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {downgradeOpportunities.items?.slice(0, 50).map((opp: DowngradeOpportunity, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">{opp.user_email}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{opp.sku_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {opp.servicos_utilizados} de {opp.total_servicos_disponiveis}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-2 bg-gray-200 rounded-full">
                                <div
                                  className="h-2 bg-yellow-500 rounded-full"
                                  style={{ width: `${opp.utilizacao_percentual}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600">{opp.utilizacao_percentual?.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">
                            R$ {opp.economia_potencial?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'utilization' && utilization && (
              <div className="space-y-6">
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total de Usuários</p>
                    <p className="text-2xl font-bold text-blue-600">{utilization.statistics.totalRecords}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Ativos 30 dias</p>
                    <p className="text-2xl font-bold text-green-600">{utilization.statistics.activeUsers30Days}</p>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Ativos 90 dias</p>
                    <p className="text-2xl font-bold text-yellow-600">{utilization.statistics.activeUsers90Days}</p>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Ativos 180 dias</p>
                    <p className="text-2xl font-bold text-orange-600">{utilization.statistics.activeUsers180Days}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Inativos 90+ dias</p>
                    <p className="text-2xl font-bold text-red-600">{utilization.statistics.inactiveUsers}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Utilização Média: {utilization.statistics.averageUtilization?.toFixed(1)}%
                  </h3>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="h-4 bg-blue-600 rounded-full"
                      style={{ width: `${utilization.statistics.averageUtilization}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
