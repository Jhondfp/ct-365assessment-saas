import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { apiClient } from '@/services/api';

export default function PainelPurview() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('visao-geral');

  // Data Map
  const [dataMap, setDataMap] = useState<any>(null);
  const [tiposDados, setTiposDados] = useState<any[]>([]);
  const [localizacoes, setLocalizacoes] = useState<any[]>([]);

  // DLP
  const [politicasDLP, setPoliticasDLP] = useState<any[]>([]);
  const [violacoesDLP, setViolacoesDLP] = useState<any[]>([]);
  const [resumoViolacoes, setResumoViolacoes] = useState<any[]>([]);

  // Compliance
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [postura, setPostura] = useState<any>(null);

  // Risk
  const [risco, setRisco] = useState<any>(null);
  const [recomendacoes, setRecomendacoes] = useState<any[]>([]);

  // Resumo geral
  const [resumo, setResumo] = useState<any>(null);

  useEffect(() => {
    if (clientId) {
      carregarDados();
    }
  }, [clientId]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError('');

      const [
        dataMapData,
        tiposDadosData,
        localizacoesData,
        politicasData,
        violacoesData,
        resumoViolData,
        frameworksData,
        posturaData,
        riscoData,
        recomendacoesData,
        resumoData,
      ] = await Promise.all([
        apiClient.get(`/governanca/clients/${clientId}/purview/data-map`).catch(() => ({ dados: {} })),
        apiClient.get(`/governanca/clients/${clientId}/purview/sensitive-types`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/sensitive-locations`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/dlp-policies`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/dlp-violations`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/dlp-violations/resumo`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/compliance-frameworks`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/compliance-posture`).catch(() => ({ dados: {} })),
        apiClient.get(`/governanca/clients/${clientId}/purview/data-risk-assessment`).catch(() => ({ dados: {} })),
        apiClient.get(`/governanca/clients/${clientId}/purview/recommendations`).catch(() => ({ dados: [] })),
        apiClient.get(`/governanca/clients/${clientId}/purview/summary`).catch(() => ({ dados: {} })),
      ]);

      setDataMap(dataMapData?.dados || {});
      setTiposDados(tiposDadosData?.dados || []);
      setLocalizacoes(localizacoesData?.dados || []);
      setPoliticasDLP(politicasData?.dados || []);
      setViolacoesDLP(violacoesData?.dados || []);
      setResumoViolacoes(resumoViolData?.dados || []);
      setFrameworks(frameworksData?.dados || []);
      setPostura(posturaData?.dados || {});
      setRisco(riscoData?.dados || {});
      setRecomendacoes(recomendacoesData?.dados || []);
      setResumo(resumoData?.dados || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de Purview');
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const obterCorRisco = (nivel: string) => {
    switch (nivel) {
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

  const obterCorConformidade = (status: string) => {
    switch (status) {
      case 'Compliant':
        return '#48bb78';
      case 'Não Compliant':
        return '#f56565';
      default:
        return '#ed8936';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Microsoft Purview - Governança de Dados</h1>
            <p className="text-[#a0aec0]">Classificação de dados, DLP, conformidade e avaliação de risco</p>
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

        {/* Hero Cards - KPIs principais */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Cobertura de Classificação</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{resumo?.classification_coverage || 0}%</div>
            <p className="text-sm text-[#a0aec0]">dados classificados</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Políticas DLP Ativas</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{resumo?.active_dlp_policies || 0}</div>
            <p className="text-sm text-[#a0aec0]">políticas implementadas</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Score de Conformidade</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{postura?.overall_score || 0}/100</div>
            <p className="text-sm text-[#a0aec0]">postura geral</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Risco de Dados</div>
            <div className="text-3xl font-bold mb-2" style={{ color: obterCorRisco(risco?.risk_level) }}>
              {risco?.risk_score || 0}
            </div>
            <p className="text-sm text-[#a0aec0]">{risco?.risk_level || 'Baixo'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[rgba(255,255,255,0.1)]">
          <div className="flex gap-8">
            {['visao-geral', 'data-map', 'dlp', 'conformidade', 'risco'].map(tab => (
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
                {tab === 'data-map' && 'Data Map'}
                {tab === 'dlp' && 'DLP'}
                {tab === 'conformidade' && 'Conformidade'}
                {tab === 'risco' && 'Risco'}
              </button>
            ))}
          </div>
        </div>

        {/* Visão Geral */}
        {activeTab === 'visao-geral' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              {/* Dados Sensíveis */}
              <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                  <span className="w-1 h-6 bg-[#f56565] rounded-sm"></span>
                  Tipos de Dados Sensíveis Encontrados
                </h3>
                <div className="space-y-3">
                  {tiposDados.slice(0, 5).map((tipo: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-[#0f1219] rounded">
                      <div>
                        <p className="text-white font-medium">{tipo.data_type_name}</p>
                        <p className="text-xs text-[#718096]">{tipo.data_type_category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#EA5A1C] font-bold">{tipo.count}</p>
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold mt-1"
                          style={{
                            backgroundColor: `${obterCorRisco(tipo.severity)}20`,
                            color: obterCorRisco(tipo.severity),
                          }}
                        >
                          {tipo.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Violações DLP Recentes */}
              <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                  <span className="w-1 h-6 bg-[#ed8936] rounded-sm"></span>
                  Violações DLP Últimos 30 Dias
                </h3>
                <div className="space-y-2">
                  {resumoViolacoes.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-[#0f1219] rounded">
                      <span className="text-[#a0aec0]">{item.severity}</span>
                      <span
                        className="font-bold"
                        style={{ color: obterCorRisco(item.severity) }}
                      >
                        {item.quantidade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Frameworks de Conformidade */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Status de Conformidade por Framework
              </h3>
              <div className="grid grid-cols-4 gap-4">
                {frameworks.map((fw: any, idx: number) => (
                  <div key={idx} className="p-4 bg-[#0f1219] rounded-lg border border-[rgba(255,255,255,0.05)]">
                    <p className="text-white font-semibold mb-2">{fw.framework_name}</p>
                    <div className="mb-3">
                      <div className="text-2xl font-bold" style={{ color: obterCorConformidade(fw.compliance_status) }}>
                        {fw.compliance_score}
                      </div>
                      <p className="text-xs text-[#718096]">{fw.compliance_status}</p>
                    </div>
                    <div className="text-xs text-[#a0aec0] space-y-1">
                      <p>Crítico: {fw.critical_findings}</p>
                      <p>Alto: {fw.high_findings}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recomendações Prioritárias */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Principais Recomendações
              </h3>
              <div className="space-y-3">
                {recomendacoes.slice(0, 5).map((rec: any) => (
                  <div key={rec.id} className="p-4 bg-[#0f1219] rounded border border-[rgba(255,255,255,0.05)]">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-medium flex-1">{rec.recommendation_text}</p>
                      <span
                        className="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ml-2"
                        style={{
                          backgroundColor: `${obterCorRisco(rec.priority)}20`,
                          color: obterCorRisco(rec.priority),
                        }}
                      >
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[#718096]">Categoria: {rec.category}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Data Map Tab */}
        {activeTab === 'data-map' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-[#EA5A1C] to-[#8b3fa0] rounded-lg p-8 text-white">
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Data Map - Classificação</h2>
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <p className="text-5xl font-bold mb-2">{dataMap?.classification_coverage || 0}%</p>
                  <p className="text-sm opacity-95">Cobertura de Classificação</p>
                </div>
                <div>
                  <p className="text-5xl font-bold mb-2">{dataMap?.classified_items?.toLocaleString() || 0}</p>
                  <p className="text-sm opacity-95">Itens Classificados</p>
                </div>
                <div>
                  <p className="text-5xl font-bold mb-2">{dataMap?.sensitive_items_count || 0}</p>
                  <p className="text-sm opacity-95">Itens Sensíveis</p>
                </div>
              </div>
            </div>

            {/* Localizações */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white">Localizações com Dados Sensíveis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Local</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Tipos Encontrados</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Total de Itens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localizacoes.map((loc: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td className="px-6 py-4 text-white font-medium">{loc.location}</td>
                        <td className="px-6 py-4 text-[#a0aec0]">{loc.tipos_encontrados}</td>
                        <td className="px-6 py-4 text-[#EA5A1C] font-semibold">{loc.total_itens?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DLP Tab */}
        {activeTab === 'dlp' && (
          <div className="space-y-6">
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Políticas DLP Implementadas
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Política</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Status</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Severidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {politicasDLP.map((policy: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td className="px-6 py-4 text-white font-medium">{policy.policy_name}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-[rgba(72,187,120,0.2)] text-[#48bb78]">
                            {policy.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: `${obterCorRisco(policy.severity)}20`,
                              color: obterCorRisco(policy.severity),
                            }}
                          >
                            {policy.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Violações */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#f56565] rounded-sm"></span>
                Violações DLP Recentes
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Política</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Data</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Local</th>
                      <th className="px-6 py-3 text-left font-semibold text-[#a0aec0] uppercase">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violacoesDLP.slice(0, 10).map((viol: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td className="px-6 py-4 text-white font-medium">{viol.policy_name}</td>
                        <td className="px-6 py-4 text-[#a0aec0] text-xs">
                          {new Date(viol.detected_date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-[#a0aec0]">{viol.location}</td>
                        <td className="px-6 py-4">
                          <span
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: `${obterCorRisco(viol.severity)}20`,
                              color: obterCorRisco(viol.severity),
                            }}
                          >
                            {viol.action_taken}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Conformidade Tab */}
        {activeTab === 'conformidade' && (
          <div className="space-y-6">
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white">Postura de Conformidade Geral</h3>
              <div className="grid grid-cols-4 gap-6">
                <div className="p-4 bg-[#0f1219] rounded text-center">
                  <p className="text-4xl font-bold text-[#EA5A1C] mb-2">{postura?.overall_score || 0}</p>
                  <p className="text-xs text-[#718096]">Score Geral</p>
                </div>
                <div className="p-4 bg-[#0f1219] rounded text-center">
                  <p className="text-4xl font-bold text-[#48bb78] mb-2">{postura?.compliant_frameworks || 0}</p>
                  <p className="text-xs text-[#718096]">Compliant</p>
                </div>
                <div className="p-4 bg-[#0f1219] rounded text-center">
                  <p className="text-4xl font-bold text-[#ed8936] mb-2">{postura?.partially_compliant_frameworks || 0}</p>
                  <p className="text-xs text-[#718096]">Parcialmente</p>
                </div>
                <div className="p-4 bg-[#0f1219] rounded text-center">
                  <p className="text-4xl font-bold text-[#f56565] mb-2">{postura?.non_compliant_frameworks || 0}</p>
                  <p className="text-xs text-[#718096]">Não Compliant</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white">Frameworks de Conformidade</h3>
              <div className="space-y-3">
                {frameworks.map((fw: any, idx: number) => (
                  <div key={idx} className="p-4 bg-[#0f1219] rounded">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-white font-semibold">{fw.framework_name}</p>
                      <span
                        className="px-3 py-1 rounded text-xs font-semibold"
                        style={{
                          backgroundColor: `${obterCorConformidade(fw.compliance_status)}20`,
                          color: obterCorConformidade(fw.compliance_status),
                        }}
                      >
                        {fw.compliance_status}
                      </span>
                    </div>
                    <div className="w-full bg-[rgba(255,255,255,0.1)] rounded-full h-2 mb-3">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${fw.compliance_score}%`,
                          backgroundColor: obterCorConformidade(fw.compliance_status),
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-[#718096]">
                      <span>{fw.compliance_score}% - {fw.compliant_controls} de {fw.total_controls} controles</span>
                      <span>{fw.findings_count} achados</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Risco Tab */}
        {activeTab === 'risco' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-[#EA5A1C] to-[#8b3fa0] rounded-lg p-8 text-white">
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Avaliação de Risco de Dados</h2>
              <div className="grid grid-cols-4 gap-8">
                <div>
                  <p className="text-5xl font-bold mb-2">{risco?.risk_score || 0}</p>
                  <p className="text-sm opacity-95">Pontuação de Risco</p>
                </div>
                <div>
                  <p className="text-3xl font-bold mb-2">{risco?.sensitive_items_count || 0}</p>
                  <p className="text-sm opacity-95">Itens Sensíveis</p>
                </div>
                <div>
                  <p className="text-3xl font-bold mb-2">{risco?.dlp_violations_count || 0}</p>
                  <p className="text-sm opacity-95">Violações DLP</p>
                </div>
                <div>
                  <p className="text-3xl font-bold mb-2">{risco?.exposed_locations_count || 0}</p>
                  <p className="text-sm opacity-95">Localizações Expostas</p>
                </div>
              </div>
            </div>

            {/* Recomendações */}
            <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-3">
                <span className="w-1 h-6 bg-[#EA5A1C] rounded-sm"></span>
                Recomendações para Redução de Risco
              </h3>
              <div className="space-y-3">
                {recomendacoes.map((rec: any) => (
                  <div key={rec.id} className="p-4 bg-[#0f1219] rounded border border-[rgba(255,255,255,0.05)]">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-medium flex-1">{rec.recommendation_text}</p>
                      <span
                        className="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ml-2"
                        style={{
                          backgroundColor: `${obterCorRisco(rec.priority)}20`,
                          color: obterCorRisco(rec.priority),
                        }}
                      >
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[#718096] mb-2">{rec.category}</p>
                    {rec.remediation_steps && (
                      <p className="text-xs text-[#a0aec0] bg-[rgba(255,255,255,0.05)] p-2 rounded">
                        {rec.remediation_steps}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
