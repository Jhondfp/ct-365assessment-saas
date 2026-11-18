/**
 * Regras de negócio do relatório (portadas do dashboard.html do ct-assessmentspo e ampliadas):
 * agrupamento de tipos de arquivo, economia de armazenamento, custo de licenças ociosas, achados priorizados.
 * Valores em US$ são ordem de grandeza (preço público de referência), não o contrato do cliente.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Dash = Record<string, any>;

export const GB = 1073741824;
/** US$/GB/mês de armazenamento extra do SharePoint (referência de mercado, mesma do dashboard original). */
export const SPO_GB_MONTH = 0.2;

export const LICENSE_REF_PRICES: Record<string, number> = {
  STANDARDPACK: 10, ENTERPRISEPACK: 23, ENTERPRISEPREMIUM: 38, OFFICESUBSCRIPTION: 12, OFFICE_PRO_PLUS_SUBSCRIPTION: 12,
  M365BUSINESSBASIC: 6, M365BUSINESSSTANDARD: 12.5, M365BUSINESSPREMIUM: 22, M365F1: 2.25, M365F3: 8, M365E3: 36, M365E5: 57,
  SPE_E3: 36, SPE_E5: 57, SPB: 22, DESKLESSPACK: 8, EXCHANGE_S_STANDARD: 4, EXCHANGE_S_ENTERPRISE: 8,
  SHAREPOINTSTANDARD: 5, SHAREPOINTENTERPRISE: 10, TEAMS1: 4, MCOEV: 8, MCOMEETADV: 4,
  POWER_BI_PRO: 10, POWER_BI_PREMIUM_PER_USER: 20, Microsoft_365_Copilot: 30,
  EMS: 10.6, EMSPREMIUM: 16.4, AAD_PREMIUM: 6, AAD_PREMIUM_P2: 9, RIGHTSMANAGEMENT: 2, ATP_ENTERPRISE: 2, THREAT_INTELLIGENCE: 5,
  POWERAPPS_PER_USER: 20, FLOW_PER_USER: 15, PROJECTPROFESSIONAL: 30, PROJECTPREMIUM: 55, PROJECT_P1: 10,
  VISIOCLIENT: 15, VISIOONLINE_PLAN1: 5, WIN10_PRO_ENT_SUB: 7, WIN_ENT_E5: 14,
};

// ───────────── formatação ─────────────
export const num = (n: unknown, d = 0) => Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export function bytes(b: unknown) {
  const v = Number(b ?? 0);
  if (v <= 0) return "0 GB";
  if (v >= 1024 * GB) return `${num(v / (1024 * GB), 2)} TB`;
  if (v >= GB) return `${num(v / GB, v >= 100 * GB ? 0 : 1)} GB`;
  return `${num(v / 1048576, 0)} MB`;
}
export const mb = (m: unknown) => bytes(Number(m ?? 0) * 1048576);
export const usd = (v: number) => (v > 0 ? `US$ ${Math.round(v).toLocaleString("pt-BR")}` : "US$ 0");
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Tradução dos valores técnicos que o Microsoft 365 devolve. */
export const SHARING_LABEL: Record<string, string> = {
  Disabled: "Desativado", ExistingExternalUserSharingOnly: "Só convidados já existentes", ExternalUserSharingOnly: "Convidados (com login)",
  ExternalUserAndGuestSharing: "Qualquer pessoa (link anônimo)",
};
export const COMPLIANCE_LABEL: Record<string, string> = {
  compliant: "Em conformidade", noncompliant: "Fora de conformidade", inGracePeriod: "Em período de carência", unknown: "Desconhecido",
  error: "Erro", conflict: "Conflito", configManager: "Config Manager", notApplicable: "Não se aplica",
};
export const tr = (map: Record<string, string>, v: unknown) => (v == null || v === "" ? "" : map[String(v)] ?? map[String(v).toLowerCase()] ?? String(v));

// ───────────── tipos de arquivo ─────────────
const FILE_GROUPS: Record<string, string[]> = {
  Word: ["doc", "docx", "odt"], Excel: ["xls", "xlsx", "ods", "csv"], PowerPoint: ["ppt", "pptx", "odp"], PDF: ["pdf"],
  Imagem: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "tiff", "tif", "heic", "heif"],
  Vídeo: ["mp4", "avi", "mov", "mkv", "wmv", "flv", "webm", "mpeg", "mpg", "m4v"], Áudio: ["mp3", "wav", "ogg", "flac", "aac", "wma", "m4a"],
  Comprimido: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"], "E-mail": ["msg", "eml", "pst", "ost"],
};
export function groupFileTypes(ft: { type: string; count: number; size_bytes: number }[] = []) {
  const g: Record<string, { count: number; size_bytes: number }> = {};
  for (const f of ft) {
    const t = (f.type || "").toLowerCase();
    const name = Object.entries(FILE_GROUPS).find(([, exts]) => exts.includes(t))?.[0] ?? "Outros";
    g[name] ??= { count: 0, size_bytes: 0 };
    g[name].count += f.count; g[name].size_bytes += f.size_bytes;
  }
  return Object.entries(g).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size_bytes - a.size_bytes);
}

// ───────────── economia ─────────────
/** Mesmo cálculo do dashboard original: lixeira + 60% do overhead de versões + conteúdo parado há N anos. */
export function savings(files: Dash = {}, trash: Dash = {}, staleYears = 2) {
  const trashGB = (trash.size_bytes || 0) / GB;
  const versionGB = Math.max(0, ((files.versioned_bytes || 0) - (files.size_bytes || 0)) / GB);
  const archiveGB = (files[`stale_${staleYears}y_bytes`] || 0) / GB;
  const trashM = trashGB * SPO_GB_MONTH, versionsM = versionGB * 0.6 * SPO_GB_MONTH, archiveM = archiveGB * SPO_GB_MONTH;
  return { trashGB, versionGB, archiveGB, trashM, versionsM, archiveM, totalM: trashM + versionsM + archiveM };
}

/** SKUs gratuitas, de avaliação ou "virais" (cotas enormes sem custo): não contam como licença ociosa. */
const FREE_SKU = /FREE|TRIAL|VIRAL|EXPLORATORY|POWER_BI_STANDARD|WINDOWS_STORE|STREAM|RIGHTSMANAGEMENT_ADHOC|CCIBOTS|DEVELOPERPACK|POWERAPPS_DEV|MCOPSTNC|FORMS_PRO|PROJECT_MADEIRA_PREVIEW/i;
export const isFreeSku = (s: Dash) => FREE_SKU.test(String(s.sku_part_number ?? "")) || Number(s.total_licenses ?? 0) >= 10000;

export function idleLicenses(skus: Dash[] = []) {
  const rows = skus.map((s) => {
    const free = isFreeSku(s);
    const idle = free ? 0 : Math.max(0, Number(s.available_licenses || 0));
    const price = LICENSE_REF_PRICES[s.sku_part_number] ?? null;
    return { ...s, idle, free, price, idleCost: price ? idle * price : 0 };
  });
  return { rows, idle: rows.reduce((a, r) => a + r.idle, 0), monthly: rows.reduce((a, r) => a + r.idleCost, 0) };
}

/** Crescimento: média dos últimos 12 meses com dado e meses até encher a cota. */
export function growth(sites: Dash = {}, growthMonthly: Dash[] = []) {
  const hist = growthMonthly.slice(-12).filter((r) => (r.bytes_created_gb || 0) > 0);
  const monthlyGB = hist.length >= 2 ? hist.reduce((a, r) => a + r.bytes_created_gb, 0) / hist.length : null;
  const usedGB = (sites.storage_mb || 0) / 1024, quotaGB = (sites.quota_mb || 0) / 1024;
  const m = monthlyGB && monthlyGB > 0 && quotaGB > usedGB ? Math.floor((quotaGB - usedGB) / monthlyGB) : null;
  const monthsToFull = m != null && m <= 120 ? m : null; // mais de 10 anos: não é uma previsão útil
  return { monthlyGB, usedGB, quotaGB, monthsToFull, usage: quotaGB > 0 ? usedGB / quotaGB : null };
}

// ───────────── achados ─────────────
export type Severity = "critical" | "high" | "medium" | "low";
export type Finding = { sev: Severity; area: string; title: string; detail: string; action: string; section?: string };
export const SEV_LABEL: Record<Severity, string> = { critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo" };
const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const CRIT_KW = ["rh", "hr", "contrat", "juridic", "financ", "folha", "payroll", "legal", "compliance", "fiscal", "salary", " dp"];
export const sensitiveKeyword = (url = "", title = "") => CRIT_KW.find((k) => `${url} ${title}`.toLowerCase().includes(k)) ?? "";

export function findings(d: Dash): Finding[] {
  const F: Finding[] = [];
  const s = d.sites ?? {}, f = d.files ?? {};
  if (s.total > 0) {
    const ep = pct(s.external_sharing, s.total);
    if (ep >= 50) F.push({ sev: "high", area: "Segurança", title: "Alta exposição externa", detail: `${ep}% dos sites (${num(s.external_sharing)}) permitem compartilhamento externo.`, action: "Restringir o compartilhamento externo por padrão e liberar só nos sites que precisam, com revisão periódica de acessos.", section: "sharepoint" });
    else if (ep >= 20) F.push({ sev: "medium", area: "Segurança", title: "Compartilhamento externo moderado", detail: `${num(s.external_sharing)} sites (${ep}%) permitem acesso externo.`, action: "Revisar os sites com acesso externo e definir uma política por tipo de site.", section: "sharepoint" });
    const tp = pct(s.teams_connected, s.total);
    if (tp < 30) F.push({ sev: "low", area: "Adoção", title: "Pouca colaboração via Teams", detail: `Só ${tp}% dos sites estão conectados a uma equipe do Teams.`, action: "Avaliar quais áreas colaboram por e-mail/arquivos soltos e levar para equipes do Teams.", section: "sharepoint" });
  }
  if ((d.critical_sites?.length ?? 0) > 0) F.push({ sev: "critical", area: "Segurança", title: "Sites sensíveis com acesso externo", detail: `${d.critical_sites.length} site(s) com nome de área sensível (RH, financeiro, jurídico…) e compartilhamento externo ativo.`, action: "Desativar o compartilhamento externo nesses sites e aplicar rótulos de sensibilidade (Purview).", section: "sharepoint" });
  const orphan = (d.sharepoint?.orphaned_sites?.length ?? 0);
  if (orphan > 0) F.push({ sev: "high", area: "Governança", title: "Sites sem dono ativo", detail: `${num(orphan)} site(s) sem nenhum administrador ativo.`, action: "Definir dono para cada site ou arquivar; implantar política de ciclo de vida de sites.", section: "sharepoint" });
  if (f.total > 0) {
    const sp = pct(f.stale_2y, f.total);
    if (sp >= 40) F.push({ sev: "high", area: "Armazenamento", title: "Muito conteúdo parado", detail: `${sp}% dos arquivos (${bytes(f.stale_2y_bytes)}) sem alteração há mais de 2 anos.`, action: "Arquivar conteúdo parado (políticas de retenção/arquivamento) e liberar cota.", section: "visao" });
    else if (sp >= 20) F.push({ sev: "medium", area: "Armazenamento", title: "Conteúdo parado", detail: `${num(f.stale_2y)} arquivos (${bytes(f.stale_2y_bytes)}) sem alteração há mais de 2 anos.`, action: "Planejar arquivamento do conteúdo antigo.", section: "visao" });
    const ratio = (f.versioned_bytes || 0) / Math.max(f.size_bytes || 0, 1);
    if (ratio > 3) F.push({ sev: "medium", area: "Armazenamento", title: "Excesso de versões", detail: `As versões ocupam ${num(ratio, 1)}× o tamanho dos arquivos atuais.`, action: "Limitar versões (ex.: 50–100) nas bibliotecas e aplicar a limpeza das versões antigas.", section: "sharepoint" });
  }
  if ((d.trash?.size_bytes || 0) > 5 * GB) F.push({ sev: "low", area: "Armazenamento", title: "Lixeira ocupando cota", detail: `${bytes(d.trash.size_bytes)} na lixeira dos sites.`, action: "Esvaziar a lixeira de 2º estágio dos sites maiores.", section: "sharepoint" });
  const g = growth(s, d.sharepoint?.growth_monthly ?? []);
  if (g.usage != null && g.usage >= 0.85) F.push({ sev: g.usage >= 0.95 ? "critical" : "high", area: "Armazenamento", title: "Cota do SharePoint quase cheia", detail: `${Math.round(g.usage * 100)}% da cota em uso${g.monthsToFull != null ? `; no ritmo atual enche em ~${g.monthsToFull} meses` : ""}.`, action: "Arquivar conteúdo parado e reduzir versões antes de comprar armazenamento extra.", section: "visao" });

  const lic = idleLicenses(d.licensing_by_sku ?? []);
  if (lic.idle > 0) F.push({ sev: lic.monthly >= 500 ? "high" : "medium", area: "Licenciamento", title: "Licenças compradas e não atribuídas", detail: `${num(lic.idle)} licenças ociosas${lic.monthly ? ` (~${usd(lic.monthly)}/mês pelo preço de referência)` : ""}.`, action: "Reduzir a quantidade na renovação ou redistribuir para quem precisa.", section: "licencas" });
  const inactive = (d.adoption_by_service ?? []).reduce((a: number, r: Dash) => Math.max(a, Number(r.inactive_users || 0)), 0);
  const licensed = (d.adoption_by_service ?? []).reduce((a: number, r: Dash) => Math.max(a, Number(r.licensed_users || 0)), 0);
  if (licensed > 0 && pct(inactive, licensed) >= 20) F.push({ sev: "medium", area: "Adoção", title: "Usuários licenciados sem uso", detail: `Até ${num(inactive)} usuários (${pct(inactive, licensed)}%) sem atividade em algum serviço nos últimos 30 dias.`, action: "Confirmar desligamentos/contas inativas e retirar licenças; trilha de adoção para quem precisa.", section: "adocao" });
  if ((d.mailbox?.near_quota || 0) > 0) F.push({ sev: "medium", area: "Exchange", title: "Caixas perto da cota", detail: `${num(d.mailbox.near_quota)} caixa(s) perto do limite da cota.`, action: "Habilitar arquivo morto (archive) e política de retenção nessas caixas.", section: "exchange" });
  const it = d.intune ?? {};
  if (it.total > 0) {
    const nc = pct(it.non_compliant || 0, it.total);
    if (nc >= 10) F.push({ sev: nc >= 30 ? "high" : "medium", area: "Dispositivos", title: "Dispositivos fora de conformidade", detail: `${num(it.non_compliant)} de ${num(it.total)} (${nc}%) não estão em conformidade.`, action: "Corrigir as políticas que mais falham e bloquear acesso de dispositivos não conformes (acesso condicional).", section: "intune" });
    if ((it.not_encrypted || 0) > 0) F.push({ sev: "high", area: "Dispositivos", title: "Dispositivos sem criptografia", detail: `${num(it.not_encrypted)} dispositivo(s) sem criptografia de disco.`, action: "Exigir BitLocker/FileVault via política de conformidade.", section: "intune" });
  }
  return F.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
}

/** Variação entre duas execuções (para o "comparar com"). */
export function delta(cur: number | null | undefined, prev: number | null | undefined) {
  if (prev == null || cur == null) return null;
  return Number(cur) - Number(prev);
}

// ───────────── idade e concentração ─────────────
/** Distribuição do conteúdo pela última alteração (as colunas stale_* do coletor são acumuladas: "há mais de N anos"). */
export function ageBuckets(f: Dash = {}) {
  const size = Number(f.size_bytes || 0), s1 = Number(f.stale_1y_bytes || 0), s2 = Number(f.stale_2y_bytes || 0), s3 = Number(f.stale_3y_bytes || 0), s5 = Number(f.stale_5y_bytes || 0);
  const c = Number(f.total || 0), c1 = Number(f.stale_1y || 0), c2 = Number(f.stale_2y || 0), c3 = Number(f.stale_3y || 0), c5 = Number(f.stale_5y || 0);
  return [
    { label: "Menos de 1 ano", bytes: Math.max(0, size - s1), files: Math.max(0, c - c1) },
    { label: "1 a 2 anos", bytes: Math.max(0, s1 - s2), files: Math.max(0, c1 - c2) },
    { label: "2 a 3 anos", bytes: Math.max(0, s2 - s3), files: Math.max(0, c2 - c3) },
    { label: "3 a 5 anos", bytes: Math.max(0, s3 - s5), files: Math.max(0, c3 - c5) },
    { label: "Mais de 5 anos", bytes: s5, files: c5 },
  ];
}

/** Quantos sites concentram 80% do armazenamento (sites ordenados do maior para o menor). */
export function concentration(sizes: number[], total?: number) {
  const sorted = [...sizes].filter((v) => v > 0).sort((a, b) => b - a);
  const sum = total && total > 0 ? Math.max(total, sorted.reduce((a, v) => a + v, 0)) : sorted.reduce((a, v) => a + v, 0);
  let acc = 0, n80 = 0;
  for (const v of sorted) { acc += v; n80++; if (acc >= sum * 0.8) break; }
  const top10 = sorted.slice(0, 10).reduce((a, v) => a + v, 0);
  return { count: sorted.length, n80: sum > 0 ? n80 : 0, top10Share: sum > 0 ? top10 / sum : 0, total: sum };
}

/** Extensões que caem em "Outros" (sem grupo conhecido), da maior para a menor: para investigar o que é. */
export function otherExtensions(ft: { type: string; count: number; size_bytes: number }[] = []) {
  const known = new Set(Object.values(FILE_GROUPS).flat());
  return ft.filter((f) => !known.has((f.type || "").toLowerCase())).sort((a, b) => b.size_bytes - a.size_bytes);
}

/**
 * Crescimento do armazenamento e previsão de quando a cota enche. O histórico é reconstruído a partir do uso atual
 * menos o conteúdo criado depois de cada mês (pela data de criação dos arquivos); a projeção usa a média dos
 * últimos 12 meses com dado.
 */
export function growthProjection(storageMB: number, quotaMB: number, monthly: Dash[] = []) {
  const usedGB = (storageMB || 0) / 1024, quotaGB = (quotaMB || 0) / 1024;
  const hist = monthly.slice(-24);
  const g = growth({ storage_mb: storageMB, quota_mb: quotaMB }, monthly);
  const after = (i: number) => hist.slice(i + 1).reduce((a, r) => a + Number(r.bytes_created_gb || 0), 0);
  const history = hist.map((r, i) => ({ y: Number(r.year), m: Number(r.month), gb: Math.max(0, usedGB - after(i)) }));
  const last = hist[hist.length - 1];
  const projection: { y: number; m: number; gb: number }[] = [];
  const over = quotaGB > 0 && usedGB >= quotaGB;
  // quando passou da cota: primeiro mês do histórico em que o uso já estava acima dela
  const exceededAt = over ? history.find((p) => p.gb >= quotaGB) ?? null : null;
  if (last && g.monthlyGB && g.monthlyGB > 0) {
    const horizon = over ? 24 : g.monthsToFull != null ? Math.min(g.monthsToFull + 3, 120) : 36;
    for (let k = 1; k <= horizon; k++) {
      const mm = (Number(last.month) - 1 + k) % 12 + 1, yy = Number(last.year) + Math.floor((Number(last.month) - 1 + k) / 12);
      projection.push({ y: yy, m: mm, gb: usedGB + g.monthlyGB * k });
    }
  }
  let fullAt: { y: number; m: number } | null = null;
  if (g.monthsToFull != null && last) {
    const k = g.monthsToFull + 1;
    fullAt = { m: (Number(last.month) - 1 + k) % 12 + 1, y: Number(last.year) + Math.floor((Number(last.month) - 1 + k) / 12) };
  }
  return { history, projection, usedGB, quotaGB, monthlyGB: g.monthlyGB, monthsToFull: over ? 0 : g.monthsToFull, fullAt, over, overGB: over ? usedGB - quotaGB : 0, exceededAt };
}
