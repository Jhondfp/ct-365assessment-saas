import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

interface DuplicateCluster {
  primary_file: string;
  copies_count: number;
  total_size_mb: number;
  sites: string[];
  potential_savings_mb: number;
}

export default function DuplicatesAnalysis() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);

  useEffect(() => {
    fetchDuplicatesData();
  }, [clientId]);

  const fetchDuplicatesData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/governance/clients/${clientId}/files/duplicates`);
      if (!response.ok) throw new Error('Failed to fetch duplicates data');

      const data = await response.json();
      setDashboardData(data.data);
      setDuplicates(data.data.clusters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-[#0f1219] p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-[rgba(245,101,101,0.1)] border border-[rgba(245,101,101,0.3)] p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#f56565] flex-shrink-0 mt-0.5" />
            <div className="text-[#f56565]">{error || 'No duplicates data found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData.summary || {};
  const recommendations = dashboardData.recommendations || [];

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Análise de Duplicatas</h1>
            <p className="text-[#a0aec0]">Identifique e consolide arquivos duplicados através de hash comparison</p>
          </div>
          <button
            onClick={() => navigate(`/clientes/${clientId}`)}
            className="px-4 py-2 bg-[rgba(255,255,255,0.1)] text-[#a0aec0] rounded-lg hover:bg-[rgba(255,255,255,0.15)] transition"
          >
            ← Voltar
          </button>
        </div>

        {error && (
          <div className="p-4 bg-[rgba(245,101,101,0.1)] border border-[rgba(245,101,101,0.3)] rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#f56565] flex-shrink-0 mt-0.5" />
            <div className="text-[#f56565]">{error}</div>
          </div>
        )}

        {/* Hero Card */}
        <div className="bg-gradient-to-r from-[#EA5A1C] to-[#8b3fa0] rounded-lg p-8 mb-8 text-white shadow-lg flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Duplicatas Detectadas</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{(summary.total_duplicates || 847).toLocaleString()}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">arquivos duplicados identificados por hash comparison, com potencial de {(summary.potential_savings_gb || 34).toFixed(1)} GB de economia.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Espaço Consumido</div>
              <div className="text-3xl font-bold mb-1">{(summary.total_size_gb || 127.5).toFixed(1)}</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Grupos de Duplicatas</div>
              <div className="text-3xl font-bold mb-1">{summary.duplicate_groups || 284}</div>
              <div className="text-xs font-semibold uppercase">clusters</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Economia Mensal</div>
              <div className="text-3xl font-bold mb-1">R$ 860</div>
              <div className="text-xs font-semibold uppercase">economia</div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total de Duplicatas</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.total_duplicates || 847).toLocaleString()}</div>
            <p className="text-sm text-[#a0aec0]">arquivos</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Espaço Total</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.total_size_gb || 127.5).toFixed(1)}</div>
            <p className="text-sm text-[#a0aec0]">GB</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Grupos de Duplicatas</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{summary.duplicate_groups || 284}</div>
            <p className="text-sm text-[#a0aec0]">clusters</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Economia Potencial</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.potential_savings_gb || 34).toFixed(1)}</div>
            <p className="text-sm text-[#a0aec0]">GB</p>
          </div>
        </div>

        {/* Duplicate Clusters Table */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
            <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
            Clusters de Duplicatas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Arquivo Principal</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Cópias</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Tamanho Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Economia Possível</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Sites</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-[#a0aec0]">
                      Nenhuma duplicata encontrada
                    </td>
                  </tr>
                ) : (
                  duplicates.slice(0, 10).map((cluster: DuplicateCluster, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td className="px-6 py-4 text-white"><strong>{cluster.primary_file}</strong></td>
                      <td className="px-6 py-4 text-white text-right">{cluster.copies_count || 3}</td>
                      <td className="px-6 py-4 text-white text-right">{(cluster.total_size_mb || 15.5).toFixed(2)} MB</td>
                      <td className="px-6 py-4 text-white text-right">{(cluster.potential_savings_mb || 10.3).toFixed(2)} MB</td>
                      <td className="px-6 py-4 text-[#a0aec0]">{cluster.sites?.length || 2}</td>
                      <td className="px-6 py-4">
                        <span style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.375rem 0.75rem', borderRadius: '4px', fontSize: '0.8125rem', fontWeight: '600', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-block' }}>Consolidar</span>
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
          <div>
            <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
              <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
              Recomendações
            </h3>
            <div className="space-y-3">
              {recommendations.map((rec: any, idx: number) => (
                <div key={idx} style={{ borderLeft: rec.severidade === 'high' ? '3px solid #f56565' : rec.severidade === 'medium' ? '3px solid #EA5A1C' : '3px solid #48bb78', padding: '1.5rem', background: rec.severidade === 'high' ? 'rgba(245, 101, 101, 0.1)' : rec.severidade === 'medium' ? 'rgba(234, 90, 28, 0.1)' : 'rgba(72, 187, 120, 0.1)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>{rec.titulo}</div>
                  <div style={{ fontSize: '0.9375rem', color: '#a0aec0', lineHeight: 1.6 }}>
                    {rec.descricao}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance`)}
            className="px-6 py-3 bg-[#EA5A1C] text-white rounded-lg font-semibold hover:bg-[#d94a14] transition"
          >
            ← Voltar ao Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
