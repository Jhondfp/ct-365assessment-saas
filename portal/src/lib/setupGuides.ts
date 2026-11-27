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

/** Ações da política IAM do levantamento AWS: só inventário e métricas (nada lê conteúdo de buckets, bancos ou discos). */
export const AWS_ACTIONS = [
  "ec2:DescribeRegions", "ec2:DescribeInstances", "ec2:DescribeInstanceTypes", "ec2:DescribeVolumes", "ec2:DescribeVpcs",
  "ec2:DescribeVpnConnections", "ec2:DescribeNatGateways", "ec2:DescribeTransitGateways", "autoscaling:DescribeAutoScalingGroups",
  "lambda:ListFunctions", "ecs:ListClusters", "eks:ListClusters", "elasticfilesystem:DescribeFileSystems",
  "s3:ListAllMyBuckets", "s3:GetBucketLocation", "cloudwatch:GetMetricData", "cloudwatch:ListMetrics",
  "rds:DescribeDBInstances", "dynamodb:ListTables", "dynamodb:DescribeTable", "elasticache:DescribeCacheClusters",
  "elasticloadbalancing:DescribeLoadBalancers", "directconnect:DescribeConnections", "route53:ListHostedZones", "cloudfront:ListDistributions",
  "iam:GetAccountSummary", "iam:GetAccountPasswordPolicy", "iam:ListAccountAliases", "organizations:ListAccounts", "ce:GetCostAndUsage",
] as const;

export const AWS_POLICY_JSON = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Sid: "CTAssessmentReadOnlyInventory", Effect: "Allow", Action: [...AWS_ACTIONS], Resource: "*" }],
}, null, 2);

export function awsGuide(clientName?: string) {
  return `Levantamento AWS (migração para o Azure) — acesso necessário${clientName ? ` (${clientName})` : ""}

Para o levantamento, precisamos de um usuário IAM com uma política SOMENTE de leitura de inventário e métricas. Ele não lê o conteúdo de buckets S3, bancos de dados nem discos, e não altera nada. Tempo estimado: 10 minutos. É preciso um administrador da conta AWS.

1. Política (IAM → Políticas → Criar política → JSON)
   Nome sugerido: CTAssessmentReadOnly. Cole o JSON abaixo:

${AWS_POLICY_JSON.split("\n").map((l) => "   " + l).join("\n")}

2. Usuário (IAM → Usuários → Criar usuário)
   Nome: ct-assessment-readonly · SEM acesso ao console.
   Permissões: anexar diretamente a política CTAssessmentReadOnly (nenhuma outra).

3. Chave de acesso (usuário → Credenciais de segurança → Criar chave de acesso)
   Caso de uso: "Aplicação executada fora da AWS". Copie a Access Key ID e a Secret Access Key (a secreta aparece uma única vez).

4. Custos (opcional, recomendado)
   O Cost Explorer precisa estar ativado em Faturamento → Cost Explorer (na primeira vez a AWS leva até 24 h para liberar os dados).
   A AWS cobra US$ 0,01 por consulta ao Cost Explorer; o levantamento faz uma consulta.
   Com AWS Organizations, crie o usuário na conta de gerenciamento para enxergar o custo consolidado e a lista de contas.

5. O que precisamos receber
   - ID da conta AWS (12 dígitos, canto superior direito do console)
   - Regiões em uso (ou "todas")
   - A Access Key ID e a Secret Access Key — pelo canal seguro que combinarmos, nunca por e-mail aberto

O que levantamos: instâncias EC2 (tipo, vCPU, memória, sistema operacional, licenças, tags e uso de CPU dos últimos 30 dias), discos, buckets S3 (tamanho por classe), RDS/Aurora, DynamoDB, ElastiCache, Lambda, ECS/EKS, rede (VPCs, VPN, Direct Connect, load balancers, DNS), resumo de segurança do IAM e custos por serviço — tudo para mapear cada recurso para o equivalente no Azure, estimar o custo e planejar as ondas de migração.

Segurança
   - Só ações de leitura (Describe/List/Get de metadados); a chave fica no nosso cofre (Azure Key Vault) e não é exibida a ninguém.
   - Ao fim do projeto: desative e exclua a chave de acesso (ou o usuário ct-assessment-readonly).`;
}
