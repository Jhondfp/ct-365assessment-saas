import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, TrendingDown, Zap, Loader, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SaldoCreditos {
  current_balance: number;
  monthly_allocation: number;
  used_percentage: number;
  remaining_percentage: number;
  execution_count: number;
  avg_credits_per_execution: number;
  plan_type: string;
}

interface MovimentacaoLivro {
  transaction_id: string;
  transaction_type: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface AlertaCredito {
  alert_id: string;
  threshold_percentage: number;
  status: string;
  triggered_at: string;
  dismissed_at?: string;
}

export default function PainelCreditos() {
  const { clientId } = useParams<{ clientId: string }>();
  const [saldo, setSaldo] = useState<SaldoCreditos | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoLivro[]>([]);
  const [alertas, setAlertas] = useState<AlertaCredito[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [abaBotaoAtiva, setAbaBotaoAtiva] = useState<'resumo' | 'historico' | 'alertas'>('resumo');

  useEffect(() => {
    buscarDadosCreditos();
  }, [clientId]);

  const buscarDadosCreditos = async () => {
    try {
      setCarregando(true);
      setErro('');

      const [respostaSaldo, respostaMovimentacoes, respostaAlertas] = await Promise.all([
        fetch(`/api/billing/clients/${clientId}/credits/balance`),
        fetch(`/api/billing/clients/${clientId}/credits/ledger?limit=20`),
        fetch(`/api/billing/clients/${clientId}/credits/alerts`),
      ]);

      if (!respostaSaldo.ok) throw new Error('Erro ao buscar saldo de créditos');
      if (!respostaMovimentacoes.ok) throw new Error('Erro ao buscar histórico de movimentações');
      if (!respostaAlertas.ok) throw new Error('Erro ao buscar alertas');

      const dadosSaldo = await respostaSaldo.json();
      const dadosMovimentacoes = await respostaMovimentacoes.json();
      const dadosAlertas = await respostaAlertas.json();

      if (dadosSaldo.sucesso) {
        setSaldo(dadosSaldo.dados);
      }
      if (dadosMovimentacoes.sucesso) {
        setMovimentacoes(dadosMovimentacoes.dados);
      }
      if (dadosAlertas.sucesso) {
        setAlertas(dadosAlertas.dados);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Ocorreu um erro');
    } finally {
      setCarregando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!saldo) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">Nenhum saldo de créditos encontrado.</div>
          </div>
        </div>
      </div>
    );
  }

  const statusCredito = saldo.used_percentage > 90 ? 'critico' : saldo.used_percentage > 80 ? 'aviso' : 'saudavel';
  const corStatus = statusCredito === 'critico' ? 'red' : statusCredito === 'aviso' ? 'yellow' : 'green';

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gerenciamento de Créditos</h1>
          <p className="text-gray-600">Acompanhe o consumo de créditos e histórico de transações</p>
        </div>

        {erro && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{erro}</div>
          </div>
        )}

        {/* Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Saldo Disponível</h3>
              <Zap className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{saldo.current_balance.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-2">créditos</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Alocação Mensal</h3>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{saldo.monthly_allocation.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-2">créditos/mês</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Execuções este Mês</h3>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{saldo.execution_count}</div>
            <p className="text-xs text-gray-500 mt-2">
              {saldo.avg_credits_per_execution > 0 ? `${saldo.avg_credits_per_execution.toFixed(2)} créditos/exec` : 'sem execuções'}
            </p>
          </div>

          <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${corStatus}-500`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Uso Total</h3>
              <TrendingDown className={`w-5 h-5 text-${corStatus}-500`} />
            </div>
            <div className="text-4xl font-bold text-gray-900">{saldo.used_percentage.toFixed(1)}%</div>
            <p className={`text-xs mt-2 ${corStatus === 'red' ? 'text-red-600' : corStatus === 'yellow' ? 'text-yellow-600' : 'text-green-600'}`}>
              {statusCredito === 'critico' ? 'Crítico' : statusCredito === 'aviso' ? 'Aviso' : 'Saudável'}
            </p>
          </div>
        </div>

        {/* Seção de Alertas */}
        {alertas.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {alertas.map((alerta) => (
              <div key={alerta.alert_id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900">Limite de {alerta.threshold_percentage}% atingido</p>
                  <p className="text-sm text-yellow-800">
                    {new Date(alerta.triggered_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progresso de Uso */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Uso de Créditos</h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Créditos Utilizados</span>
                <span className="text-sm font-semibold text-gray-900">
                  {(saldo.monthly_allocation - saldo.current_balance).toFixed(2)} de {saldo.monthly_allocation.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    saldo.used_percentage > 90 ? 'bg-red-500' :
                    saldo.used_percentage > 80 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(saldo.used_percentage, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Créditos Restantes</span>
                <span className="text-sm font-semibold text-gray-900">
                  {saldo.remaining_percentage.toFixed(1)}% ({saldo.current_balance.toFixed(2)} créditos)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="h-4 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${saldo.remaining_percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex gap-8 px-6">
              <button
                onClick={() => setAbaBotaoAtiva('resumo')}
                className={`py-4 font-medium border-b-2 transition ${
                  abaBotaoAtiva === 'resumo'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Resumo
              </button>
              <button
                onClick={() => setAbaBotaoAtiva('historico')}
                className={`py-4 font-medium border-b-2 transition ${
                  abaBotaoAtiva === 'historico'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Histórico de Transações ({movimentacoes.length})
              </button>
              <button
                onClick={() => setAbaBotaoAtiva('alertas')}
                className={`py-4 font-medium border-b-2 transition ${
                  abaBotaoAtiva === 'alertas'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Alertas ({alertas.length})
              </button>
            </div>
          </div>

          <div className="p-6">
            {abaBotaoAtiva === 'resumo' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium mb-1">Plano</p>
                    <p className="text-2xl font-bold text-blue-900">{saldo.plan_type}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium mb-1">Média por Execução</p>
                    <p className="text-2xl font-bold text-green-900">
                      {saldo.avg_credits_per_execution.toFixed(3)} créditos
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <p className="text-sm text-gray-600 mb-3">Informações Importantes:</p>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✓ Créditos não expiram</li>
                    <li>✓ Créditos são não-reembolsáveis</li>
                    <li>✓ Alertas são enviados em 80% e 90% de uso</li>
                    <li>✓ Compre créditos adicionais a qualquer momento</li>
                  </ul>
                </div>
              </div>
            )}

            {abaBotaoAtiva === 'historico' && (
              <div className="space-y-3">
                {movimentacoes.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">Nenhuma transação encontrada</p>
                ) : (
                  movimentacoes.map((entrada) => (
                    <div
                      key={entrada.transaction_id}
                      className="flex justify-between items-start py-4 border-b border-gray-100 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{entrada.transaction_type}</p>
                        <p className="text-sm text-gray-600 mt-1">{entrada.reason}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(entrada.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold text-lg ${
                            entrada.transaction_type === 'purchase' || entrada.transaction_type === 'addition'
                              ? 'text-green-600'
                              : entrada.transaction_type === 'consumption'
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}
                        >
                          {entrada.transaction_type === 'purchase' || entrada.transaction_type === 'addition' ? '+' : '-'}
                          {Math.abs(entrada.amount).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">Saldo: {entrada.balance_after.toFixed(2)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {abaBotaoAtiva === 'alertas' && (
              <div className="space-y-3">
                {alertas.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">Nenhum alerta ativo</p>
                ) : (
                  alertas.map((alerta) => (
                    <div key={alerta.alert_id} className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-yellow-900">Limite de {alerta.threshold_percentage}% Atingido</p>
                          <p className="text-sm text-yellow-800 mt-1">
                            Status: <span className="font-semibold">{alerta.status}</span>
                          </p>
                          <p className="text-xs text-yellow-700 mt-2">
                            Disparado em:{' '}
                            {new Date(alerta.triggered_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {alerta.dismissed_at && (
                            <p className="text-xs text-yellow-700">
                              Descartado em:{' '}
                              {new Date(alerta.dismissed_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
