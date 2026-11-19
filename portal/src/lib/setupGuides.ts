/**
 * Guias de acesso para enviar ao cliente (texto puro, pronto para copiar num e-mail). Um por plataforma.
 * Mantenha os escopos/permissões em sincronia com o que os coletores usam (job/src e job/google).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.orgunit.readonly",
  "https://www.googleapis.com/auth/admin.directory.domain.readonly",
  "https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly",
  "https://www.googleapis.com/auth/admin.directory.device.mobile.readonly",
  "https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly",
  "https://www.googleapis.com/auth/admin.reports.usage.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  "https://www.googleapis.com/auth/apps.licensing",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const M365_PERMISSIONS = [
  { api: "SharePoint", perm: "Sites.FullControl.All", why: "sites, arquivos, versões e lixeira (e, só quando o cliente autorizar, a higienização)" },
  { api: "Microsoft Graph", perm: "Sites.Read.All", why: "lista de sites e OneDrives" },
  { api: "Microsoft Graph", perm: "User.Read.All", why: "usuários e donos dos sites" },
  { api: "Microsoft Graph", perm: "Directory.Read.All", why: "grupos, licenças e organização" },
  { api: "Microsoft Graph", perm: "Reports.Read.All", why: "adoção e tamanho das caixas de e-mail" },
  { api: "Microsoft Graph", perm: "DeviceManagementManagedDevices.Read.All", why: "dispositivos do Intune (opcional)" },
] as const;

export function m365Guide(clientName?: string) {
  return `Assessment Microsoft 365 — acesso necessário${clientName ? ` (${clientName})` : ""}

Para o assessment, precisamos de um App Registration no Entra ID da sua empresa, com permissões de aplicativo (Application). O acesso é feito por certificado, sem senha de usuário, e pode ser removido ao fim do projeto.

1. Criar o App Registration
   Portal do Azure (portal.azure.com) → Microsoft Entra ID → Registros de aplicativo → Novo registro.
   Nome sugerido: "Cloud Target Assessment". Tipo de conta: somente este diretório. Sem URI de redirecionamento.

2. Permissões de API (tipo "Permissões de aplicativo") e consentimento do administrador
${M365_PERMISSIONS.map((p) => `   - ${p.api} → ${p.perm}: ${p.why}`).join("\n")}
   Depois clique em "Conceder consentimento do administrador" (exige Administrador Global ou Administrador de Aplicativos de Nuvem/Privilegiados).

3. Certificado
   Enviaremos um arquivo .cer (certificado público). Em Certificados e segredos → Certificados → Carregar certificado, envie esse arquivo.
   A chave privada fica só no nosso cofre (Azure Key Vault); o .cer não dá acesso a nada sozinho.

4. Dados que precisamos receber
   - ID do locatário (Tenant ID) — Entra ID → Visão geral
   - ID do aplicativo (Client ID) — no App Registration criado
   - Endereço do SharePoint (ex.: contoso.sharepoint.com)

Segurança
   - O acesso é de leitura para o assessment. A permissão Sites.FullControl.All é exigida pelo SharePoint para ler versões e lixeira; nenhuma alteração é feita sem autorização por escrito.
   - Ao fim do projeto, basta excluir o App Registration (ou remover o certificado) para encerrar o acesso.`;
}

export function googleGuide(clientName?: string) {
  return `Assessment Google Workspace (levantamento para migração ao Microsoft 365) — acesso necessário${clientName ? ` (${clientName})` : ""}

Para o levantamento, precisamos de uma conta de serviço do Google Cloud com delegação em todo o domínio, liberada SOMENTE com escopos de leitura. Ela não lê o conteúdo de e-mails nem de arquivos. Tempo estimado: 20 minutos. É preciso um super administrador do Google Workspace e acesso ao Google Cloud da empresa.

1. Projeto no Google Cloud (console.cloud.google.com)
   Crie um projeto (ex.: "assessment-migracao") e ative as APIs:
   - Admin SDK API
   - Google Drive API
   - Enterprise License Manager API

2. Conta de serviço
   IAM e administrador → Contas de serviço → Criar conta de serviço (sem papéis no projeto).
   Na conta criada: Chaves → Adicionar chave → Criar nova chave → JSON.
   Se aparecer bloqueio por política (iam.disableServiceAccountKeyCreation), abra uma exceção só para este projeto.
   Anote o "ID exclusivo" (ID do cliente OAuth) da conta de serviço.

3. Delegação em todo o domínio (admin.google.com)
   Segurança → Acesso e controle de dados → Controles de API → Gerenciar delegação em todo o domínio → Adicionar.
   ID do cliente: o ID exclusivo da conta de serviço. Escopos (copie a linha inteira, separados por vírgula):
   ${GOOGLE_SCOPES.join(",")}

4. Administrador para a consulta
   Crie um usuário dedicado (ex.: assessment@suaempresa.com) com um papel de administrador PERSONALIZADO só de leitura:
   Usuários (ler), Grupos (ler), Unidades organizacionais (ler), Configurações de domínio (ler), Relatórios, Dispositivos móveis e Chrome (ler) e Gerenciamento de licenças (ler).
   (Também funciona com um super administrador, mas o papel personalizado é o recomendado.)

5. O que precisamos receber
   - O arquivo JSON da chave — pelo canal seguro que combinarmos, nunca por e-mail aberto
   - O e-mail do administrador do passo 4
   - O domínio principal do Google Workspace

O que levantamos: usuários, aliases, domínios, grupos, unidades organizacionais, uso de e-mail e Drive por usuário, compartilhamento externo (contagens), salas e recursos, dispositivos e licenças — tudo para dimensionar a migração e sugerir o licenciamento Microsoft 365.

Segurança
   - Só escopos de leitura; o de licenças (apps.licensing) não tem versão de leitura no Google, mas apenas consultamos.
   - A chave fica no nosso cofre (Azure Key Vault) e não é exibida a ninguém.
   - Ao fim do projeto: exclua a chave da conta de serviço e remova a delegação no Admin Console.`;
}
