import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, TrendingDown, Zap, Loader, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CreditBalance {
  current_balance: number;
  monthly_allocation: number;
  used_percentage: number;
  remaining_percentage: number;
  execution_count: number;
  avg_credits_per_execution: number;
  plan_type: string;
}

interface CreditLedgerEntry {
  transaction_id: string;
  transaction_type: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface CreditAlert {
  alert_id: string;
  threshold_percentage: number;
  status: string;
  triggered_at: string;
  dismissed_at?: string;
}

export default function CreditDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'alerts'>('overview');

  useEffect(() => {
    fetchCreditData();
  }, [clientId]);

  const fetchCreditData = async () => {
    try {
      setLoading(true);
      setError('');

      const [balanceRes, ledgerRes, alertsRes] = await Promise.all([
        fetch(`/api/billing/clients/${clientId}/credits/balance`),
        fetch(`/api/billing/clients/${clientId}/credits/ledger?limit=20`),
        fetch(`/api/billing/clients/${clientId}/credits/alerts`),
      ]);

      if (!balanceRes.ok) throw new Error('Failed to fetch credit balance');
      if (!ledgerRes.ok) throw new Error('Failed to fetch credit ledger');
      if (!alertsRes.ok) throw new Error('Failed to fetch credit alerts');

      const balanceData = await balanceRes.json();
      const ledgerData = await ledgerRes.json();
      const alertsData = await alertsRes.json();

      if (balanceData.success) {
        setBalance(balanceData.data);
      }
      if (ledgerData.success) {
        setLedger(ledgerData.data);
      }
      if (alertsData.success) {
        setAlerts(alertsData.data);
      }
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

  if (!balance) {
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

  const creditStatus = balance.used_percentage > 90 ? 'critical' : balance.used_percentage > 80 ? 'warning' : 'healthy';
  const statusColor = creditStatus === 'critical' ? 'red' : creditStatus === 'warning' ? 'yellow' : 'green';

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gerenciamento de Créditos</h1>
          <p className="text-gray-600">Acompanhe o consumo de créditos e histórico de transações</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Hero Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Saldo Disponível</h3>
              <Zap className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{balance.current_balance.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-2">créditos</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Alocação Mensal</h3>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{balance.monthly_allocation.toFixed(2)}</div>
            <p className="text-xs text-gray-500 mt-2">créditos/mês</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Execuções este Mês</h3>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900">{balance.execution_count}</div>
            <p className="text-xs text-gray-500 mt-2">
              {balance.avg_credits_per_execution > 0 ? `${balance.avg_credits_per_execution.toFixed(2)} créditos/exec` : 'sem execuções'}
            </p>
          </div>

          <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${statusColor}-500`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium text-sm">Uso Total</h3>
              <TrendingDown className={`w-5 h-5 text-${statusColor}-500`} />
            </div>
            <div className="text-4xl font-bold text-gray-900">{balance.used_percentage.toFixed(1)}%</div>
            <p className={`text-xs mt-2 ${statusColor === 'red' ? 'text-red-600' : statusColor === 'yellow' ? 'text-yellow-600' : 'text-green-600'}`}>
              {statusColor === 'red' ? 'Crítico' : statusColor === 'yellow' ? 'Aviso' : 'Saudável'}
            </p>
          </div>
        </div>

        {/* Alert Section */}
        {alerts.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {alerts.map((alert) => (
              <div key={alert.alert_id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900">Limite de {alert.threshold_percentage}% atingido</p>
                  <p className="text-sm text-yellow-800">
                    {new Date(alert.triggered_at).toLocaleDateString('pt-BR', {
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

        {/* Usage Progress */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Uso de Créditos</h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Créditos Utilizados</span>
                <span className="text-sm font-semibold text-gray-900">
                  {(balance.monthly_allocation - balance.current_balance).toFixed(2)} de {balance.monthly_allocation.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    balance.used_percentage > 90 ? 'bg-red-500' :
                    balance.used_percentage > 80 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(balance.used_percentage, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Créditos Restantes</span>
                <span className="text-sm font-semibold text-gray-900">
                  {balance.remaining_percentage.toFixed(1)}% ({balance.current_balance.toFixed(2)} créditos)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="h-4 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${balance.remaining_percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex gap-8 px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 font-medium border-b-2 transition ${
                  activeTab === 'overview'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Resumo
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-4 font-medium border-b-2 transition ${
                  activeTab === 'ledger'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Histórico de Transações ({ledger.length})
              </button>
              <button
                onClick={() => setActiveTab('alerts')}
                className={`py-4 font-medium border-b-2 transition ${
                  activeTab === 'alerts'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                Alertas ({alerts.length})
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium mb-1">Plano</p>
                    <p className="text-2xl font-bold text-blue-900">{balance.plan_type}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium mb-1">Média por Execução</p>
                    <p className="text-2xl font-bold text-green-900">
                      {balance.avg_credits_per_execution.toFixed(3)} créditos
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

            {activeTab === 'ledger' && (
              <div className="space-y-3">
                {ledger.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">Nenhuma transação encontrada</p>
                ) : (
                  ledger.map((entry) => (
                    <div
                      key={entry.transaction_id}
                      className="flex justify-between items-start py-4 border-b border-gray-100 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{entry.transaction_type}</p>
                        <p className="text-sm text-gray-600 mt-1">{entry.reason}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(entry.created_at).toLocaleDateString('pt-BR', {
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
                            entry.transaction_type === 'purchase' || entry.transaction_type === 'addition'
                              ? 'text-green-600'
                              : entry.transaction_type === 'consumption'
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}
                        >
                          {entry.transaction_type === 'purchase' || entry.transaction_type === 'addition' ? '+' : '-'}
                          {Math.abs(entry.amount).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">Saldo: {entry.balance_after.toFixed(2)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'alerts' && (
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">Nenhum alerta ativo</p>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.alert_id} className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-yellow-900">Limite de {alert.threshold_percentage}% Atingido</p>
                          <p className="text-sm text-yellow-800 mt-1">
                            Status: <span className="font-semibold">{alert.status}</span>
                          </p>
                          <p className="text-xs text-yellow-700 mt-2">
                            Disparado em:{' '}
                            {new Date(alert.triggered_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {alert.dismissed_at && (
                            <p className="text-xs text-yellow-700">
                              Descartado em:{' '}
                              {new Date(alert.dismissed_at).toLocaleDateString('pt-BR', {
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
