import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CreditCard, TrendingUp, AlertCircle, Loader } from 'lucide-react';

interface BillingData {
  current_credits: number;
  credits_consumed_this_month: number;
  plan: {
    id: string;
    name: string;
    monthly_credits: number;
    monthly_price_brl: number;
    overage_price_per_credit_brl: number;
  };
  recent_transactions: any[];
  recent_invoices: any[];
}

export default function BillingDashboard() {
  const { clientId } = useParams<{ clientId: string }>();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('10');
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, [clientId]);

  const fetchBillingData = async () => {
    try {
      const response = await fetch(`/api/billing/clients/${clientId}/billing/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch billing data');

      const data = await response.json();
      setBillingData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseCredits = async () => {
    setPurchaseLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/billing/clients/${clientId}/credits/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: parseInt(purchaseAmount) }),
      });

      if (!response.ok) throw new Error('Failed to purchase credits');

      setPurchaseAmount('10');
      await fetchBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setPurchaseLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!billingData) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">Nenhum plano de créditos encontrado. Configure um plano para começar.</div>
          </div>
        </div>
      </div>
    );
  }

  const creditsRemaining = billingData.plan.monthly_credits - billingData.credits_consumed_this_month;
  const percentageUsed = (billingData.credits_consumed_this_month / billingData.plan.monthly_credits) * 100;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Faturamento e Créditos</h1>
          <p className="text-gray-600">Gerencie seus créditos e visualize seu histórico de faturamento</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Credit Cards Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Créditos Disponíveis</h3>
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{billingData.current_credits}</div>
            <p className="text-sm text-gray-500 mt-2">Saldo atual</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Consumo do Mês</h3>
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{billingData.credits_consumed_this_month}</div>
            <p className="text-sm text-gray-500 mt-2">de {billingData.plan.monthly_credits} créditos</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-medium">Plano Atual</h3>
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-lg font-bold text-gray-900">{billingData.plan.name}</div>
            <p className="text-sm text-gray-500 mt-2">R$ {billingData.plan.monthly_price_brl.toFixed(2)}/mês</p>
          </div>
        </div>

        {/* Usage Progress */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Uso de Créditos</h3>
          <div className="space-y-3">
            <div className="flex justify-between mb-2">
              <span className="text-gray-700">Utilizados: {billingData.credits_consumed_this_month}</span>
              <span className="text-gray-700">Restantes: {creditsRemaining}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  percentageUsed > 80 ? 'bg-red-500' : percentageUsed > 50 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(percentageUsed, 100)}%` }}
              ></div>
            </div>
            <div className="text-sm text-gray-600">{percentageUsed.toFixed(1)}% utilizado</div>
          </div>
        </div>

        {/* Purchase Credits */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Comprar Créditos Adicionais</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade</label>
              <input
                type="number"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-2">Preço por crédito:</p>
              <p className="text-lg font-semibold text-gray-900">
                R$ {billingData.plan.overage_price_per_credit_brl.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-2">Total:</p>
              <p className="text-lg font-semibold text-gray-900">
                R$ {(parseInt(purchaseAmount) * billingData.plan.overage_price_per_credit_brl).toFixed(2)}
              </p>
            </div>
            <button
              onClick={handlePurchaseCredits}
              disabled={purchaseLoading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:bg-gray-400"
            >
              {purchaseLoading ? 'Processando...' : 'Comprar'}
            </button>
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transações Recentes</h3>
          <div className="space-y-3">
            {billingData.recent_transactions.length === 0 ? (
              <p className="text-gray-600">Nenhuma transação encontrada</p>
            ) : (
              billingData.recent_transactions.map((tx, idx) => (
                <div key={idx} className="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{tx.transaction_type}</p>
                    <p className="text-sm text-gray-500">{new Date(tx.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.transaction_type === 'purchase' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.transaction_type === 'purchase' ? '+' : '-'}{tx.quantity}
                    </p>
                    <p className="text-sm text-gray-500">Saldo: {tx.saldo_novo}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Invoices */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Faturas</h3>
          <div className="space-y-3">
            {billingData.recent_invoices.length === 0 ? (
              <p className="text-gray-600">Nenhuma fatura encontrada</p>
            ) : (
              billingData.recent_invoices.map((invoice, idx) => (
                <div key={idx} className="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">{invoice.numero_fatura}</p>
                    <p className="text-sm text-gray-500">{new Date(invoice.data_emissao).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">R$ {invoice.valor_total_brl.toFixed(2)}</p>
                    <p className={`text-sm ${invoice.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {invoice.status === 'paid' ? 'Pago' : 'Pendente'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
