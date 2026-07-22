import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface TenantFormData {
  tenant_nome: string;
  m365_tenant_id: string;
  dominio_m365: string;
  app_id: string;
  app_secret: string;
}

export default function TenantProvisioning() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<'info' | 'appReg' | 'verification' | 'success'>('info');
  const [formData, setFormData] = useState<TenantFormData>({
    tenant_nome: '',
    m365_tenant_id: '',
    dominio_m365: '',
    app_id: '',
    app_secret: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenantId, setTenantId] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/clients/${clientId}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          m365_tenant_id: formData.m365_tenant_id,
          tenant_nome: formData.tenant_nome,
          dominio_m365: formData.dominio_m365,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tenant');
      }

      const tenant = await response.json();
      setTenantId(tenant.id);
      setStep('appReg');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/app-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_name: formData.tenant_nome,
          app_id: formData.app_id,
          app_secret: formData.app_secret,
          scopes: ['https://graph.microsoft.com/.default'],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register app');
      }

      setStep('verification');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            {['Informações', 'App Registration', 'Verificação', 'Sucesso'].map((label, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold mb-2 ${
                    idx < ['info', 'appReg', 'verification', 'success'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : idx === ['info', 'appReg', 'verification', 'success'].indexOf(step)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {idx < ['info', 'appReg', 'verification', 'success'].indexOf(step) ? '✓' : idx + 1}
                </div>
                <span className="text-sm text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-red-700">{error}</div>
            </div>
          )}

          {step === 'info' && (
            <form onSubmit={handleCreateTenant} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Informações do Tenant</h2>
                <p className="text-gray-600 mb-6">Forneça os detalhes do tenant Microsoft 365</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Tenant *
                </label>
                <input
                  type="text"
                  name="tenant_nome"
                  value={formData.tenant_nome}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Tenant Produção"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ID do Tenant Microsoft 365 (GUID) *
                </label>
                <input
                  type="text"
                  name="m365_tenant_id"
                  value={formData.m365_tenant_id}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Encontre em Azure Portal → Azure AD → Properties → Tenant ID
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Domínio Principal
                </label>
                <input
                  type="text"
                  name="dominio_m365"
                  value={formData.dominio_m365}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="empresa.onmicrosoft.com"
                />
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => navigate(`/clients/${clientId}`)}
                  className="flex-1 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400"
                >
                  {loading ? 'Criando...' : 'Próximo'}
                </button>
              </div>
            </form>
          )}

          {step === 'appReg' && (
            <form onSubmit={handleRegisterApp} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Registrar Aplicação</h2>
                <p className="text-gray-600 mb-6">Configure a aplicação OAuth no seu tenant Microsoft 365</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Instruções:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Vá para Azure Portal → App registrations</li>
                  <li>Clique em "New registration"</li>
                  <li>Preencha o nome e clique em "Register"</li>
                  <li>Copie o Application (client) ID abaixo</li>
                  <li>Em Certificates & secrets, crie um novo client secret</li>
                  <li>Copie o valor do secret abaixo</li>
                </ol>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Application ID (Client ID) *
                </label>
                <input
                  type="text"
                  name="app_id"
                  value={formData.app_id}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Secret (Password) *
                </label>
                <input
                  type="password"
                  name="app_secret"
                  value={formData.app_secret}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="Sua chave secreta"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Esta será armazenada de forma segura no Azure Key Vault
                </p>
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => setStep('info')}
                  className="flex-1 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400"
                >
                  {loading ? 'Registrando...' : 'Registrar Aplicação'}
                </button>
              </div>
            </form>
          )}

          {step === 'verification' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Verificando Configuração</h2>
                <p className="text-gray-600">Testando a conexão com sua aplicação...</p>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">Tenant criado com sucesso</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">Aplicação registrada</span>
                </div>
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-gray-700">Testando conexão...</span>
                </div>
              </div>

              <button
                onClick={() => setStep('success')}
                disabled={loading}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 mt-8"
              >
                Continuar
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Tenant Configurado!</h2>
              <p className="text-gray-600 mb-6">Seu tenant foi provisionado com sucesso</p>

              <button
                onClick={() => navigate(`/clients/${clientId}`)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Ir para o Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
