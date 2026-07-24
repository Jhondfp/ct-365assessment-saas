import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, ChevronRight } from 'lucide-react';
import { apiClient } from '@/services/api';

export default function PainelTimes() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [resumo, setResumo] = useState<any>(null);
  const [times, setTimes] = useState<any[]>([]);
  const [temasOrfaos, setTemasOrfaos] = useState<any[]>([]);
  const [temasInativos, setTemasInativos] = useState<any[]>([]);
  const [distribuicaoRisco, setDistribuicaoRisco] = useState<any[]>([]);
  const [recomendacoes, setRecomendacoes] = useState<any[]>([]);
  const [filtroRisco, setFiltroRisco] = useState('');

  useEffect(() => {
    if (clientId) {
      carregarDados();
    }
  }, [clientId]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError('');

      // Carregar todos os dados em paralelo
      const [
        resumoData,
        timesData,
        orfaosData,
        inatativosData,
        riscoData,
      ] = await Promise.all([
        apiClient.get(`/governanca/clients/${clientId}/times/resumo`),
        apiClient.get(`/governanca/clients/${clientId}/times`),
        apiClient.get(`/governanca/clients/${clientId}/times/orfaos`),
        apiClient.get(`/governanca/clients/${clientId}/times/inativos`),
        apiClient.get(`/governanca/clients/${clientId}/times/distribuicao/risco`),
      ]).catch(err => {
        // Se houver erro, retornar dados vazios
        return [
          { dados: [{ total_teams: 0, teams_orphaned: 0, teams_inactive: 0, teams_high_risk: 0, total_members: 0, total_guests: 0, total_channels: 0, total_storage_gb: 0 }] },
          { dados: [] },
          { dados: [] },
          { dados: [] },
          { dados: [] },
        ];
      });

      setResumo(resumoData?.dados?.[0] || {});
      setTimes(timesData?.dados || []);
      setTemasOrfaos(orfaosData?.dados || []);
      setTemasInativos(inatativosData?.dados || []);
      setDistribuicaoRisco(riscoData?.dados || []);

      // Carregar recomendações
      carregarRecomendacoes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de Times');
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const carregarRecomendacoes = async () => {
    try {
      const dados = await apiClient.get(`/governanca/clients/${clientId}/times`);
      const timesComRecomendacoes = dados?.dados || [];
      const recomendacoesAgregadas = timesComRecomendacoes.slice(0, 5);
      setRecomendacoes(recomendacoesAgregadas);
    } catch (err) {
      console.error('Erro ao carregar recomendações:', err);
    }
  };

  const obterCorRisco = (nivelRisco: string) => {
    switch (nivelRisco) {
      case 'Crítico':
        return '#f56565';
      case 'Alto':
        return '#ed8936';
      case 'Médio':
        return '#ecc94b';
      default:
        return '#48bb78';
    }
  };

  const timesFiltrados = filtroRisco
    ? times.filter(t => t.risk_level === filtroRisco)
    : times;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  const summary = resumo || {
    total_teams: 0,
    teams_orphaned: 0,
    teams_inactive: 0,
    teams_high_risk: 0,
    total_members: 0,
    total_guests: 0,
    total_channels: 0,
    total_storage_gb: 0,
  };

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Governança de Times</h1>
            <p className="text-[#a0aec0]">Análise completa de times, canais, membros e conformidade do Microsoft Teams</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Resumo de Times</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{summary.total_teams || 0}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">
              times analisados com {summary.total_members || 0} membros e {summary.total_guests || 0} convidados externos.
            </p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Orfãos</div>
              <div className="text-3xl font-bold mb-1">{summary.teams_orphaned || 0}</div>
              <div className="text-xs font-semibold uppercase">sem dono</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Inativos</div>
              <div className="text-3xl font-bold mb-1">{summary.teams_inactive || 0}</div>
              <div className="text-xs font-semibold uppercase">&gt;180 dias</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Alto Risco</div>
              <div className="text-3xl font-bold mb-1">{summary.teams_high_risk || 0}</div>
              <div className="text-xs font-semibold uppercase">pontuação</div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total de Times</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{summary.total_teams || 0}</div>
            <p className="text-sm text-[#a0aec0]">times ativos</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Times Orfãos</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2 leading-tight">{summary.teams_orphaned || 0}</div>
            <p className="text-sm text-[#a0aec0]">sem proprietário</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Canais Totais</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{summary.total_channels || 0}</div>
            <p className="text-sm text-[#a0aec0]">em todos os times</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Espaço Total</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">
              {(summary.total_storage_gb || 0).toFixed(0)} GB
            </div>
            <p className="text-sm text-[#a0aec0]">armazenado</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[rgba(255,255,255,0.1)]">
          <div className="flex gap-8">
            {['visao-geral', 'risco', 'orfaos', 'inativos'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 font-medium text-sm uppercase tracking-wide border-b-2 transition ${
                  activeTab === tab
                    ? 'text-[#EA5A1C] border-[#EA5A1C]'
                    : 'text-[#718096] border-transparent hover:text-[#a0aec0]'
                }`}
              >
                {tab === 'visao-geral' && 'Visão Geral'}
                {tab === 'risco' && 'Por Risco'}
                {tab === 'orfaos' && 'Orfãos'}
                {tab === 'inativos' && 'Inativos'}
              </button>
            ))}
          </div>
        </div>

        {/* Content Tabs */}
        {activeTab === 'visao-geral' && (
          <div className="space-y-8">
            {/* Risk Distribution */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Distribuição de Risco
              </h3>
              <div className="grid grid-cols-4 gap-4">
                {distribuicaoRisco.map((item: any) => (
                  <div
                    key={item.risk_level}
                    className="p-4 bg-[#0f1219] rounded-lg border border-[rgba(255,255,255,0.05)] hover:border-[rgba(234,90,28,0.2)] transition"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: obterCorRisco(item.risk_level) }}
                      ></div>
                      <p className="font-medium text-[#a0aec0]">{item.risk_level}</p>
                    </div>
                    <p className="text-2xl font-bold text-white mb-1">{item.quantidade || 0}</p>
                    <p className="text-xs text-[#718096]">times</p>
                  </div>
                ))}
              </div>
            </div>

            {/* All Teams Table */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Todos os Times
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                        Nome
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                        Proprietário
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                        Membros
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                        Risco
                      </th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {timesFiltrados.slice(0, 10).map((time: any) => (
                      <tr
                        key={time.team_id}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                        className="hover:bg-[rgba(255,255,255,0.02)] transition"
                      >
                        <td className="px-6 py-4 text-white font-medium">{time.display_name}</td>
                        <td className="px-6 py-4 text-[#a0aec0]">{time.team_owner || 'Sem dono'}</td>
                        <td className="px-6 py-4 text-[#a0aec0]">{time.member_count || 0}</td>
                        <td className="px-6 py-4">
                          <span
                            className="px-3 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: `${obterCorRisco(time.risk_level)}20`,
                              color: obterCorRisco(time.risk_level),
                            }}
                          >
                            {time.risk_level} ({time.risk_score})
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() =>
                              navigate(
                                `/clientes/${clientId}/governanca/times/${time.team_id}`
                              )
                            }
                            className="text-[#EA5A1C] hover:text-[#ff7a3d] flex items-center gap-1 transition"
                          >
                            Ver <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'risco' && (
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
              <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
              Filtro por Risco
            </h3>
            <div className="mb-6 flex gap-3">
              {['Crítico', 'Alto', 'Médio', 'Baixo'].map(nivel => (
                <button
                  key={nivel}
                  onClick={() => setFiltroRisco(filtroRisco === nivel ? '' : nivel)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filtroRisco === nivel
                      ? 'bg-[#EA5A1C] text-white'
                      : 'bg-[rgba(255,255,255,0.1)] text-[#a0aec0] hover:bg-[rgba(255,255,255,0.15)]'
                  }`}
                >
                  {nivel}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Risco
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Motivo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {timesFiltrados.map((time: any) => (
                    <tr
                      key={time.team_id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <td className="px-6 py-4 text-white font-medium">{time.display_name}</td>
                      <td className="px-6 py-4">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: `${obterCorRisco(time.risk_level)}20`,
                            color: obterCorRisco(time.risk_level),
                          }}
                        >
                          {time.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#a0aec0] text-xs">
                        {time.team_owner ? '' : 'Sem dono'}{' '}
                        {time.is_public ? '| Público' : ''}{' '}
                        {time.days_inactive > 180 ? '| Inativo' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'orfaos' && (
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
              <span className="w-1 h-6 bg-[#f56565] rounded-sm"></span>
              Times Orfãos (Sem Proprietário)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Membros
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Convidados
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Risco
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {temasOrfaos.map((time: any) => (
                    <tr
                      key={time.team_id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <td className="px-6 py-4 text-white font-medium">{time.display_name}</td>
                      <td className="px-6 py-4 text-[#a0aec0]">{time.member_count || 0}</td>
                      <td className="px-6 py-4 text-[#a0aec0]">{time.guest_count || 0}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[rgba(245,101,101,0.2)] text-[#f56565]">
                          {time.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'inativos' && (
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
              <span className="w-1 h-6 bg-[#ed8936] rounded-sm"></span>
              Times Inativos (&gt;180 dias)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Proprietário
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Dias Inativo
                    </th>
                    <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase text-xs tracking-wide">
                      Última Atividade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {temasInativos.map((time: any) => (
                    <tr
                      key={time.team_id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <td className="px-6 py-4 text-white font-medium">{time.display_name}</td>
                      <td className="px-6 py-4 text-[#a0aec0]">{time.team_owner || 'N/A'}</td>
                      <td className="px-6 py-4 text-[#ed8936] font-medium">{time.days_inactive || 0}</td>
                      <td className="px-6 py-4 text-[#a0aec0] text-xs">
                        {time.last_activity
                          ? new Date(time.last_activity).toLocaleDateString('pt-BR')
                          : 'Desconhecido'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
