# Login Microsoft 365 (Entra ID) com convidados B2B

Modelo: o app do portal fica **só no tenant Cloud Target** (single-tenant). A equipe entra com a conta
@cloudtarget.com.br; quem é de fora (cliente, parceiro) é **convidado B2B** no tenant Cloud Target e entra com a
própria conta corporativa. O portal ainda exige que a pessoa esteja cadastrada em *Usuários e perfis* (ou seja de
`INTERNAL_EMAIL_DOMAINS`).

## 1. App Registration (tenant Cloud Target, Entra admin center)
1. Identidade > Aplicativos > Registros de aplicativo > Novo registro
   - Nome: `CT Assessment 365 - Portal`
   - Tipos de conta: **Somente contas neste diretório organizacional (locatário único)**
   - URI de redirecionamento (Web): `https://<portal>/api/auth/callback/microsoft-entra-id`
2. Anote **ID do aplicativo (cliente)** e **ID do diretório (locatário)**.
3. Certificados e segredos > Novo segredo do cliente (validade 12 ou 24 meses; anote a data para renovar). Copie o **Valor**.
4. Configuração de token > Adicionar declaração opcional > ID > `email`.
5. Permissões de API: manter só `Microsoft Graph > User.Read` (delegada). Conceder consentimento de administrador.

## 2. Restringir quem entra (Aplicativos empresariais > CT Assessment 365 - Portal)
1. Propriedades > **Atribuição necessária? = Sim**.
2. Usuários e grupos > adicionar o grupo `GRP-CTAssessment-Portal` (equipe + convidados).

## 3. Convidar externo (B2B)
1. Usuários > Novo usuário > **Convidar usuário externo** (e-mail corporativo da pessoa) e coloque no grupo acima.
2. A pessoa aceita o convite (e-mail ou https://myapps.microsoft.com/?tenantid=<tenant>).
3. Identidades externas > Configurações de acesso entre locatários: se o tenant do cliente bloquear B2B de saída,
   o admin de lá precisa liberar o tenant Cloud Target.
4. Recomendado: Acesso Condicional exigindo MFA para o app; em acesso entre locatários > configurações de entrada,
   **confiar no MFA** do tenant de origem para não pedir MFA duas vezes.

## 4. Portal
1. Usuários e perfis > cadastrar o convidado com **o mesmo e-mail com que ele entra** e o perfil
   (Visualizador + clientes liberados, normalmente).
2. Segredos no cofre do ambiente (nunca no repositório):
   ```bash
   KV=$(az keyvault list -g rg-365gov-prod --query "[?starts_with(name,'ctassess-kv')].name|[0]" -o tsv)
   az keyvault secret set --vault-name "$KV" -n deploy-entra-client-id --value "<ID do aplicativo>"
   az keyvault secret set --vault-name "$KV" -n deploy-entra-tenant-id --value "<ID do locatário>"
   az keyvault secret set --vault-name "$KV" -n deploy-entra-client-secret --file <arquivo-com-o-valor>
   ```
3. `RG=rg-365gov-prod infra/deploy.sh` (lê os `deploy-*` do cofre e liga o botão "Entrar com Microsoft").

Teste: janela anônima > Entrar com Microsoft > conta convidada. Erro `AADSTS50020` = a pessoa não foi convidada;
`AADSTS50105` = não está no grupo atribuído; tela "aguardando convite" do portal = não cadastrada em Usuários e perfis.
