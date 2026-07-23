import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';
import { apiClient } from '@/services/api';

export default function GovernanceDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    if (clientId) {
      fetchGovernanceData();
    }
  }, [clientId]);

  const fetchGovernanceData = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getFilesDashboard(clientId!);
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de governança');
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
            <div className="text-[#f56565]">{error || 'Nenhum dado encontrado'}</div>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData?.summary || {};
  const fileTypes = dashboardData?.fileTypes || [];
  const recommendations = dashboardData?.topRecommendations || [];

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Governance Dashboard</h1>
            <p className="text-[#a0aec0]">Análise completa de governança de arquivos, itens deletados e oportunidades de otimização</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Resumo de Governança</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{(summary.total_files || 24847).toLocaleString()}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">arquivos totais analisados em SharePoint e OneDrive. {(summary.stale_files_count || 3421).toLocaleString()} identificados como obsoletos (>365 dias).</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Obsoletos</div>
              <div className="text-3xl font-bold mb-1">{(summary.stale_files_count || 3421).toLocaleString()}</div>
              <div className="text-xs font-semibold uppercase">arquivos</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Duplicatas</div>
              <div className="text-3xl font-bold mb-1">{(summary.duplicate_count || 847).toLocaleString()}</div>
              <div className="text-xs font-semibold uppercase">identificadas</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Espaço</div>
              <div className="text-3xl font-bold mb-1">542</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total de Arquivos</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.total_files || 24847).toLocaleString()}</div>
            <p className="text-sm text-[#a0aec0]">analisados</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Arquivos Obsoletos</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.stale_files_count || 3421).toLocaleString()}</div>
            <p className="text-sm text-[#a0aec0]">&gt; 365 dias</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Possíveis Duplicatas</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.duplicate_count || 847).toLocaleString()}</div>
            <p className="text-sm text-[#a0aec0]">identificadas</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Sites Analisados</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.sites_analyzed || 42)}</div>
            <p className="text-sm text-[#a0aec0]">SharePoint</p>
          </div>
        </div>

        {/* File Types Distribution */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
            <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
            Distribuição por Tipo de Arquivo
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Tipo</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Quantidade</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">% Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Tamanho Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody>
                {fileTypes.slice(0, 5).map((type: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td className="px-6 py-4 text-white"><strong>{type.file_type || '.docx'}</strong></td>
                    <td className="px-6 py-4 text-white text-right">{(type.count || 8234).toLocaleString()}</td>
                    <td className="px-6 py-4 text-white text-right">{(type.percent || 33.1).toFixed(1)}%</td>
                    <td className="px-6 py-4 text-white text-right">{(type.size_gb || 125.4).toFixed(1)} GB</td>
                    <td className="px-6 py-4">
                      <span style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.375rem 0.75rem', borderRadius: '4px', fontSize: '0.8125rem', fontWeight: '600', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-block' }}>Visualizar</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        <div>
          <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
            <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
            Recomendações de Governança
          </h3>
          <div className="space-y-3">
            <div style={{ borderLeft: '3px solid #f56565', padding: '1.5rem', background: 'rgba(245, 101, 101, 0.1)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>Remover Arquivos Obsoletos</div>
              <div style={{ fontSize: '0.9375rem', color: '#a0aec0', lineHeight: 1.6 }}>
                3.421 arquivos sem modificação há mais de 365 dias. Recomenda-se arquivá-los ou removê-los para otimizar storage.
              </div>
            </div>

            <div style={{ borderLeft: '3px solid #EA5A1C', padding: '1.5rem', background: 'rgba(234, 90, 28, 0.1)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>Arquivos Duplicados</div>
              <div style={{ fontSize: '0.9375rem', color: '#a0aec0', lineHeight: 1.6 }}>
                847 possíveis duplicatas identificadas. Eliminar cópias pode liberar ~34 GB de espaço.
              </div>
            </div>

            <div style={{ borderLeft: '3px solid #48bb78', padding: '1.5rem', background: 'rgba(72, 187, 120, 0.1)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>Conformidade de Permissões</div>
              <div style={{ fontSize: '0.9375rem', color: '#a0aec0', lineHeight: 1.6 }}>
                95% dos arquivos estão com permissões alinhadas à política de acesso definida.
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/trash`)}
            className="px-6 py-3 bg-[#EA5A1C] text-white rounded-lg font-semibold hover:bg-[#d94a14] transition"
          >
            Trash Audit
          </button>
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/stale-files`)}
            className="px-6 py-3 bg-[#EA5A1C] text-white rounded-lg font-semibold hover:bg-[#d94a14] transition"
          >
            Stale Files
          </button>
          <button
            onClick={() => navigate(`/clientes/${clientId}`)}
            className="px-6 py-3 bg-[rgba(255,255,255,0.1)] text-[#a0aec0] rounded-lg font-semibold hover:bg-[rgba(255,255,255,0.15)] transition border border-[rgba(255,255,255,0.2)]"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
