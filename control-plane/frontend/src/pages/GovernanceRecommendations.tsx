import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

interface Recommendation {
  id: string;
  titulo: string;
  descricao: string;
  severidade: 'high' | 'medium' | 'low';
  impacto_potencial: string;
  status: string;
}

export default function GovernanceRecommendations() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchRecommendations();
  }, [clientId]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/governance/recommendations?clientId=${clientId}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');

      const data = await response.json();
      setRecommendations(data.data || []);
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

  const criticalRecs = recommendations.filter(r => r.severidade === 'high');
  const warningRecs = recommendations.filter(r => r.severidade === 'medium');
  const successRecs = recommendations.filter(r => r.severidade === 'low');

  const totalPotentialSavings = recommendations.length * 2.3; // Mock calculation

  const filteredRecommendations = filterType === 'all'
    ? recommendations
    : filterType === 'critical'
    ? criticalRecs
    : filterType === 'warning'
    ? warningRecs
    : successRecs;

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Recomendações de Governança</h1>
            <p className="text-[#a0aec0]">Visão abrangente de todas as recomendações de otimização e conformidade</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Recomendações Totais</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{recommendations.length}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">recomendações de governança identificadas em seu ambiente, com potencial de {totalPotentialSavings.toFixed(1)} GB de economia anual.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Críticas</div>
              <div className="text-3xl font-bold mb-1">{criticalRecs.length}</div>
              <div className="text-xs font-semibold uppercase">alta</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Atenção</div>
              <div className="text-3xl font-bold mb-1">{warningRecs.length}</div>
              <div className="text-xs font-semibold uppercase">média</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Boas Práticas</div>
              <div className="text-3xl font-bold mb-1">{successRecs.length}</div>
              <div className="text-xs font-semibold uppercase">baixa</div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Recomendações Críticas</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2 leading-tight">{criticalRecs.length}</div>
            <p className="text-sm text-[#a0aec0]">requerem ação imediata</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Recomendações de Atenção</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{warningRecs.length}</div>
            <p className="text-sm text-[#a0aec0]">devem ser avaliadas</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Boas Práticas</div>
            <div className="text-3xl font-bold text-[#48bb78] mb-2 leading-tight">{successRecs.length}</div>
            <p className="text-sm text-[#a0aec0]">melhorias opcionais</p>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <label className="block text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Filtrar Recomendações</label>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${filterType === 'all' ? 'bg-[#EA5A1C] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[#a0aec0] hover:bg-[rgba(255,255,255,0.1)]'}`}
            >
              Todas ({recommendations.length})
            </button>
            <button
              onClick={() => setFilterType('critical')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${filterType === 'critical' ? 'bg-[#f56565] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[#a0aec0] hover:bg-[rgba(255,255,255,0.1)]'}`}
            >
              Críticas ({criticalRecs.length})
            </button>
            <button
              onClick={() => setFilterType('warning')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${filterType === 'warning' ? 'bg-[#EA5A1C] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[#a0aec0] hover:bg-[rgba(255,255,255,0.1)]'}`}
            >
              Atenção ({warningRecs.length})
            </button>
            <button
              onClick={() => setFilterType('success')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${filterType === 'success' ? 'bg-[#48bb78] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[#a0aec0] hover:bg-[rgba(255,255,255,0.1)]'}`}
            >
              Boas Práticas ({successRecs.length})
            </button>
          </div>
        </div>

        {/* Recommendations List */}
        <div>
          <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
            <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
            {filterType === 'all' ? 'Todas as Recomendações' : filterType === 'critical' ? 'Recomendações Críticas' : filterType === 'warning' ? 'Recomendações de Atenção' : 'Boas Práticas'}
          </h3>
          <div className="space-y-3">
            {filteredRecommendations.length === 0 ? (
              <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 text-center">
                <p className="text-[#a0aec0]">Nenhuma recomendação nesta categoria</p>
              </div>
            ) : (
              filteredRecommendations.map((rec: Recommendation) => (
                <div key={rec.id} style={{ borderLeft: rec.severidade === 'high' ? '3px solid #f56565' : rec.severidade === 'medium' ? '3px solid #EA5A1C' : '3px solid #48bb78', padding: '1.5rem', background: rec.severidade === 'high' ? 'rgba(245, 101, 101, 0.1)' : rec.severidade === 'medium' ? 'rgba(234, 90, 28, 0.1)' : 'rgba(72, 187, 120, 0.1)', borderRadius: '6px' }}>
                  <div className="flex justify-between items-start mb-2">
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>{rec.titulo}</div>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <span style={{ background: rec.severidade === 'high' ? 'rgba(245, 101, 101, 0.3)' : rec.severidade === 'medium' ? 'rgba(234, 90, 28, 0.3)' : 'rgba(72, 187, 120, 0.3)', color: rec.severidade === 'high' ? '#f56565' : rec.severidade === 'medium' ? '#EA5A1C' : '#48bb78', padding: '0.25rem 0.75rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {rec.severidade === 'high' ? 'Crítica' : rec.severidade === 'medium' ? 'Atenção' : 'Boa Prática'}
                      </span>
                      <span style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.25rem 0.75rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {rec.status || 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.9375rem', color: '#a0aec0', lineHeight: 1.6, marginBottom: '1rem' }}>
                    {rec.descricao}
                  </div>
                  <div className="flex justify-between items-end">
                    <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                      Impacto potencial: <span style={{ color: '#a0aec0', fontWeight: '600' }}>{rec.impacto_potencial}</span>
                    </div>
                    <button style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.375rem 1rem', borderRadius: '4px', fontSize: '0.8125rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', border: 'none', cursor: 'pointer', transition: 'all 0.3s' }}>
                      Revisar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

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
