/**
 * Tradução dos erros mais comuns de Entra ID, Graph, SharePoint (PnP) e SQL para o que fazer.
 * O texto original continua disponível (detalhe técnico); isto só põe uma explicação na frente.
 */
const RULES: { test: RegExp; title: string; hint: string }[] = [
  { test: /AADSTS90002|Tenant '.*' not found/i, title: "Tenant não encontrado", hint: "Confira o Tenant ID na conexão do cliente (Entra ID → Visão geral → ID do locatário)." },
  { test: /AADSTS700016/i, title: "Aplicativo não encontrado no tenant", hint: "O Client ID não existe nesse tenant: confira o ID do aplicativo e se o App Registration é deste cliente." },
  { test: /AADSTS7000222/i, title: "Client secret expirado", hint: "Gere um novo secret no App Registration e atualize a conexão do cliente." },
  { test: /AADSTS7000215/i, title: "Client secret inválido", hint: "Copie o VALOR do secret (não o ID) e atualize a conexão do cliente." },
  { test: /AADSTS700027|AADSTS700024|AADSTS50173|certificate.*(not|invalid|expired)/i, title: "Certificado não aceito pelo Entra ID", hint: "Envie a chave pública (.cer) deste mesmo certificado em App Registration → Certificados e segredos, e confira a validade." },
  { test: /AADSTS65001|consent/i, title: "Consentimento do administrador pendente", hint: "No App Registration → Permissões de API, clique em \"Conceder consentimento do administrador\"." },
  { test: /Authorization_RequestDenied|Insufficient privileges|\(403\)|Forbidden|Access is denied|Attempted to perform an unauthorized operation/i, title: "Permissão insuficiente", hint: "Falta permissão de aplicativo (com consentimento) no App Registration: Sites.FullControl.All no SharePoint e, no Graph, as do workload que falhou." },
  { test: /\(401\)|Unauthorized/i, title: "Acesso não autorizado", hint: "O SharePoint recusou o token: use certificado (client secret não é aceito para app-only) e confira Sites.FullControl.All no SharePoint." },
  { test: /Nullable object must have a value|throttl|429/i, title: "Limite de requisições do Microsoft 365", hint: "O tenant limitou as chamadas (throttling). Reduza \"sites em paralelo\" na próxima coleta ou execute de novo." },
  { test: /Login failed for user/i, title: "Login no banco recusado", hint: "Confira usuário e senha do banco do cliente (aba Cadastro e banco)." },
  { test: /40615|not allowed to access the server|Client with IP address/i, title: "Firewall do banco bloqueou o acesso", hint: "No servidor SQL do cliente, ative \"Permitir que serviços do Azure acessem este servidor\"." },
  { test: /Cannot open server|server was not found|ENOTFOUND|getaddrinfo|ETIMEOUT|Failed to connect/i, title: "Servidor do banco inacessível", hint: "Confira o nome do servidor e se ele aceita conexões externas na porta 1433." },
  { test: /Cannot open database/i, title: "Banco não encontrado ou sem acesso", hint: "Confira o nome do banco e se o usuário SQL tem acesso a ele." },
  { test: /SharePoint indisponível/i, title: "SharePoint indisponível", hint: "A checagem prévia não conseguiu entrar no SharePoint Admin com o certificado: confira certificado e Sites.FullControl.All." },
  { test: /Falha ao obter token Microsoft Graph|Token Graph/i, title: "Não foi possível autenticar no Microsoft 365", hint: "O worker não conseguiu o token do Graph com a credencial do cliente. Confira Tenant ID, Client ID e a credencial (secret válido ou certificado com a chave pública enviada ao App Registration) e rode o diagnóstico." },
  { test: /Falta a permissão de aplicativo/i, title: "Permissão do Graph faltando", hint: "Adicione a permissão indicada no App Registration e conceda o consentimento do administrador." },
];

export function explainError(message?: string | null) {
  if (!message) return null;
  return RULES.find((r) => r.test.test(message)) ?? null;
}
