/**
 * Módulos do coletor ct-assessmentspo (chaves process_* do params.json) e os parâmetros que o portal monta
 * para cada execução. Mantém os mesmos nomes do params.example.json para o job repassar sem tradução.
 * O módulo de agendas/reuniões (process_calendar) do coletor não é oferecido: sempre vai desligado.
 */
export const MODULES = [
  { key: "process_sites_info", label: "Sites e subsites", hint: "Volumetria, compartilhamento, administradores (PnP / SharePoint Admin)", default: true },
  { key: "process_sites", label: "Arquivos dos sites", hint: "Inventário de arquivos e versões em SharePoint e OneDrive", default: true },
  { key: "process_subsites", label: "Arquivos dos subsites", hint: "Inclui os subsites na varredura de arquivos", default: true },
  { key: "process_recycle_bin", label: "Lixeira", hint: "Itens na lixeira (1º e 2º estágio) de cada site", default: false },
  { key: "process_owner_status", label: "Donos ativos", hint: "Sites sem administrador ativo (requer Sites e subsites)", default: false },
  { key: "process_licensing_info", label: "Licenciamento", hint: "SKUs contratadas × consumidas (Graph subscribedSkus)", default: true },
  { key: "process_adoption_info", label: "Adoção", hint: "Atividade por usuário em SharePoint, OneDrive, Exchange e Teams (Reports.Read.All)", default: false },
  { key: "process_mailbox_info", label: "Caixas de e-mail", hint: "Tamanho, cota e archive (Reports.Read.All)", default: false },
  { key: "process_intune_info", label: "Dispositivos Intune", hint: "Conformidade, criptografia e risco (DeviceManagementManagedDevices.Read.All)", default: false },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];

export const PERMISSIONS_HELP = [
  "SharePoint → Sites.FullControl.All (Application) — obrigatório para sites, arquivos e lixeira",
  "Microsoft Graph → User.Read.All e Directory.Read.All (Application)",
  "Microsoft Graph → Reports.Read.All — adoção e caixas de e-mail",
  "Microsoft Graph → DeviceManagementManagedDevices.Read.All — Intune",
  "Para SharePoint (PnP) com app-only, use certificado: client secret não é aceito pelo SharePoint em tenants novos.",
];

export type CollectorParams = Record<string, unknown>;

export function buildParams(input: {
  modules: Partial<Record<ModuleKey, boolean>>;
  sites: string[];
  parallel: number;
  sitesBatch: number;
  clientName: string;
}): CollectorParams {
  const p: CollectorParams = {
    client_name: input.clientName,
    notifications: false,
    process_onedrive: false,
    store_in_csv: false,
    store_in_sql: true,
    resume_last_execution: true,
    force_new_execution: false,
    resume_max_age_hours: 72,
    sites: input.sites,
    process_calendar: false,
    users_meeting: [],
    sql_batch_size: 500,
    sites_batch_size: input.sitesBatch,
    sites_parallel_size: input.parallel,
    sql_command_timeout: 120,
    graph_page_size: 999,
    output_data_format: "yyyy-MM-dd HH:mm:ss",
  };
  for (const m of MODULES) p[m.key] = !!input.modules[m.key];
  return p;
}

export const enabledModules = (params: CollectorParams) => MODULES.filter((m) => params[m.key]).map((m) => m.label);
