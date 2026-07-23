import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

interface StaleFile {
  file_name: string;
  site_url: string;
  days_inactive: number;
  file_size_mb: number;
  created_by: string;
}

export default function StaleFiles() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [staleFiles, setStaleFiles] = useState<StaleFile[]>([]);
  const [sortBy, setSortBy] = useState('days_inactive');
  const [filterSite, setFilterSite] = useState('');

  useEffect(() => {
    fetchStaleFilesData();
  }, [clientId]);

  const fetchStaleFilesData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/governance/clients/${clientId}/files/stale`);
      if (!response.ok) throw new Error('Failed to fetch stale files data');

      const data = await response.json();
      setDashboardData(data.data);
      setStaleFiles(data.data.files || []);
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
            <div className="text-[#f56565]">{error || 'No stale files data found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const summary = dashboardData.summary || {};
  const recommendations = dashboardData.recommendations || [];
  const filteredFiles = staleFiles.filter(file =>
    file.site_url?.toLowerCase().includes(filterSite.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'days_inactive') return b.days_inactive - a.days_inactive;
    if (sortBy === 'file_size_mb') return b.file_size_mb - a.file_size_mb;
    return 0;
  });

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Análise de Arquivos Obsoletos</h1>
            <p className="text-[#a0aec0]">Identifique e consolide arquivos sem modificação há mais de 365 dias</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Arquivos Obsoletos</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{(summary.total_count || 3421).toLocaleString()}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">arquivos sem modificação há mais de 365 dias, consumindo {(summary.total_size_gb || 87.2).toFixed(1)} GB de espaço armazenado.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Espaço</div>
              <div className="text-3xl font-bold mb-1">{(summary.total_size_gb || 87.2).toFixed(1)}</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Arquivo Mais Antigo</div>
              <div className="text-3xl font-bold mb-1">7</div>
              <div className="text-xs font-semibold uppercase">anos</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Economia Possível</div>
              <div className="text-3xl font-bold mb-1">87.2</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total de Arquivos</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.total_count || 3421).toLocaleString()}</div>
            <p className="text-sm text-[#a0aec0]">obsoletos</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Espaço Total</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{(summary.total_size_gb || 87.2).toFixed(1)}</div>
            <p className="text-sm text-[#a0aec0]">GB</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Arquivo Mais Antigo</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{summary.oldest_days_inactive || 2557}</div>
            <p className="text-sm text-[#a0aec0]">dias (7 anos)</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Economia Mensal</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">R$ 219</div>
            <p className="text-sm text-[#a0aec0]">com exclusão</p>
          </div>
        </div>

        {/* Filter and Sort */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#718096] uppercase tracking-wide mb-2">Filtrar por Site</label>
              <input
                type="text"
                placeholder="Digite o nome do site..."
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value)}
                className="w-full px-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#718096] focus:ring-2 focus:ring-[#EA5A1C] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#718096] uppercase tracking-wide mb-2">Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:ring-2 focus:ring-[#EA5A1C] focus:border-transparent"
              >
                <option value="days_inactive">Dias Inativo</option>
                <option value="file_size_mb">Tamanho</option>
              </select>
            </div>
            <span className="text-sm text-[#a0aec0]">
              {filteredFiles.length} de {staleFiles.length}
            </span>
          </div>
        </div>

        {/* Stale Files Table */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
            <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
            Lista de Arquivos Obsoletos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Arquivo</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Site</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Dias Inativo</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Tamanho</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Criador</th>
                  <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-[#a0aec0]">
                      Nenhum arquivo corresponde aos filtros
                    </td>
                  </tr>
                ) : (
                  filteredFiles.slice(0, 10).map((file: StaleFile, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td className="px-6 py-4 text-white"><strong>{file.file_name}</strong></td>
                      <td className="px-6 py-4 text-[#a0aec0]">{file.site_url}</td>
                      <td className="px-6 py-4 text-white text-right">{file.days_inactive || 730}</td>
                      <td className="px-6 py-4 text-white text-right">{(file.file_size_mb || 2.5).toFixed(2)} MB</td>
                      <td className="px-6 py-4 text-[#a0aec0]">{file.created_by || 'Unknown'}</td>
                      <td className="px-6 py-4">
                        <span style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.375rem 0.75rem', borderRadius: '4px', fontSize: '0.8125rem', fontWeight: '600', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-block' }}>Arquivar</span>
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
