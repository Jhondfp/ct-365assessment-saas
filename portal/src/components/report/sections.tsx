/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { BarList, Columns, NEUTRAL, SERIES, STATUS, Stat, StackBar } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Empty } from "@/components/ui";
import {
  COMPLIANCE_LABEL, GB, SEV_LABEL, SHARING_LABEL, bytes, delta, findings, groupFileTypes, growth, idleLicenses, mb, num, pct, savings, sensitiveKeyword, tr, usd,
  type Dash, type Finding,
} from "@/lib/insights";

const SEV_STYLE: Record<Finding["sev"], string> = {
  critical: "bg-red-100 text-red-800", high: "bg-orange-100 text-orange-800", medium: "bg-amber-100 text-amber-900", low: "bg-slate-100 text-slate-700",
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Card({ title, children, className = "", aside }: { title: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`card break-inside-avoid ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="card-title !mb-0">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

const dNum = (cur: any, prev: any, fmt: (v: number) => string = (v) => num(Math.abs(v))) => {
  const v = delta(cur, prev);
  return v == null || v === 0 ? null : { value: v, display: fmt(Math.abs(v)) };
};

export function FindingList({ items, base, limit }: { items: Finding[]; base?: string; limit?: number }) {
  if (!items.length) return <p className="muted">Nenhum ponto de atenção encontrado com os dados desta coleta.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.slice(0, limit ?? items.length).map((f, i) => (
        <li key={i} className="break-inside-avoid py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_STYLE[f.sev]}`}>{SEV_LABEL[f.sev]}</span>
            <span className="text-xs uppercase tracking-wide text-slate-500">{f.area}</span>
          </div>
          <p className="mt-1 font-medium">{f.title}</p>
          <p className="text-sm text-slate-600">{f.detail}</p>
          <p className="mt-1 text-sm text-slate-800"><span className="font-medium text-ct-purple">Recomendação:</span> {f.action}</p>
          {base && f.section && f.section !== "visao" && <Link href={`${base}&secao=${f.section}`} className="link mt-1 inline-block text-xs print:hidden">Ver detalhes →</Link>}
        </li>
      ))}
    </ul>
  );
}

// ───────────── Visão geral ─────────────
export function Overview({ d, p, base }: { d: Dash; p: Dash | null; base: string }) {
  const s = d.sites ?? {}, f = d.files ?? {};
  const sv = savings(f, d.trash ?? {});
  const lic = idleLicenses(d.licensing_by_sku ?? []);
  const g = growth(s, d.sharepoint?.growth_monthly ?? []);
  const F = findings(d);
  const gm = (d.sharepoint?.growth_monthly ?? []).slice(-24);
  const types = groupFileTypes(d.file_types ?? []).slice(0, 8);
  const versionsOver = Math.max(0, (f.versioned_bytes || 0) - (f.size_bytes || 0));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sites" value={num(s.total)} hint={`${num(s.subsites)} subsites · ${num(s.teams_connected)} com Teams`} delta={dNum(s.total, p?.sites?.total)} deltaGood="none" />
        <Stat label="Armazenamento" value={mb(s.storage_mb)} hint={s.quota_mb ? `${pct(s.storage_mb, s.quota_mb)}% de ${mb(s.quota_mb)}` : undefined} tone={g.usage != null && g.usage >= 0.85 ? "risk" : undefined} delta={dNum(s.storage_mb, p?.sites?.storage_mb, (v) => mb(v))} />
        <Stat label="Arquivos" value={num(f.total)} hint={bytes(f.size_bytes)} delta={dNum(f.total, p?.files?.total)} deltaGood="none" />
        <Stat label="Parado há +2 anos" value={bytes(f.stale_2y_bytes)} hint={`${num(f.stale_2y)} arquivos (${pct(f.stale_2y, f.total)}%)`} tone={pct(f.stale_2y, f.total) >= 40 ? "warn" : undefined} delta={dNum(f.stale_2y_bytes, p?.files?.stale_2y_bytes, (v) => bytes(v))} />
        <Stat label="Acesso externo" value={`${num(s.external_sharing)} sites`} hint={`${pct(s.external_sharing, s.total)}% dos sites`} tone={pct(s.external_sharing, s.total) >= 50 ? "risk" : undefined} delta={dNum(s.external_sharing, p?.sites?.external_sharing)} />
        <Stat label="Economia potencial" value={`${usd(sv.totalM + lic.monthly)}/mês`} hint="armazenamento + licenças ociosas (preço de referência)" tone="ok" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Principais achados" className="lg:col-span-3" aside={<span className="text-xs text-slate-500">{F.length} ponto(s)</span>}>
          <FindingList items={F} base={base} limit={6} />
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Para onde vai o armazenamento">
            <StackBar parts={[
              { label: "Arquivos em uso", value: Math.max(0, (f.size_bytes || 0) - (f.stale_2y_bytes || 0)), color: SERIES[0], display: bytes(Math.max(0, (f.size_bytes || 0) - (f.stale_2y_bytes || 0))) },
              { label: "Parado +2 anos", value: f.stale_2y_bytes || 0, color: SERIES[2], display: bytes(f.stale_2y_bytes) },
              { label: "Versões antigas", value: versionsOver, color: SERIES[1], display: bytes(versionsOver) },
              { label: "Lixeira", value: d.trash?.size_bytes || 0, color: NEUTRAL, display: bytes(d.trash?.size_bytes) },
            ]} />
          </Card>
          <Card title="Economia estimada por mês">
            <table className="tbl">
              <tbody>
                <tr><td>Arquivar conteúdo parado (+2 anos)</td><td className="text-right tabular-nums">{bytes(sv.archiveGB * GB)}</td><td className="text-right tabular-nums">{usd(sv.archiveM)}</td></tr>
                <tr><td>Limitar versões (≈60% do excedente)</td><td className="text-right tabular-nums">{bytes(sv.versionGB * 0.6 * GB)}</td><td className="text-right tabular-nums">{usd(sv.versionsM)}</td></tr>
                <tr><td>Esvaziar lixeiras</td><td className="text-right tabular-nums">{bytes(sv.trashGB * GB)}</td><td className="text-right tabular-nums">{usd(sv.trashM)}</td></tr>
                <tr><td>Licenças não atribuídas</td><td className="text-right tabular-nums">{num(lic.idle)} lic.</td><td className="text-right tabular-nums">{usd(lic.monthly)}</td></tr>
                <tr className="font-semibold"><td>Total</td><td /><td className="text-right tabular-nums">{usd(sv.totalM + lic.monthly)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Armazenamento a US$ {num(0.2, 2)}/GB/mês (extra do SharePoint) e licenças pelo preço público de referência — ordem de grandeza, não o contrato do cliente.</p>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Conteúdo criado por mês (GB)" className="lg:col-span-3" aside={g.monthlyGB != null && <span className="text-xs text-slate-500">média {bytes(g.monthlyGB * GB)}/mês{g.monthsToFull != null ? ` · cota cheia em ~${g.monthsToFull} meses` : ""}</span>}>
          <Columns unit="" data={gm.map((r: any) => ({ label: `${MONTHS[(r.month || 1) - 1]}/${String(r.year).slice(2)}`, value: Number(r.bytes_created_gb || 0), display: `${num(r.bytes_created_gb, 1)} GB · ${num(r.files_created)} arquivos` }))} />
          <p className="mt-1 text-xs text-slate-500">SharePoint, pela data de criação dos arquivos.</p>
        </Card>
        <Card title="Tipos de arquivo (por volume)" className="lg:col-span-2">
          <BarList rows={types.map((t) => ({ label: t.name, value: t.size_bytes, display: bytes(t.size_bytes), title: `${num(t.count)} arquivos` }))} />
        </Card>
      </div>
    </div>
  );
}

// ───────────── SharePoint / OneDrive ─────────────
export function SiteSection({ d, p, type }: { d: Dash; p: Dash | null; type: "SharePoint" | "OneDrive" }) {
  const sec = (type === "SharePoint" ? d.sharepoint : d.onedrive) ?? {};
  const prev = (type === "SharePoint" ? p?.sharepoint : p?.onedrive) ?? null;
  const s = sec.sites ?? {}, f = sec.files ?? {};
  const vs = sec.version_savings ?? {};
  const versionsOver = Math.max(0, (f.versioned_bytes || 0) - (f.size_bytes || 0));
  const sites = (d.all_sites ?? []).filter((x: any) => x.site_type === type).map((x: any) => ({ ...x, capability: tr(SHARING_LABEL, x.capability), sensivel: sensitiveKeyword(x.url, x.title) ? "Sim" : "" }));
  const word = type === "SharePoint" ? "sites" : "OneDrives";
  if (!s.total) return <Empty>Esta coleta não tem dados de {type}. Inclua o workload {type === "SharePoint" ? "Sites e subsites + Arquivos" : "OneDrive dos usuários"} na próxima execução.</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={type === "SharePoint" ? "Sites" : "OneDrives"} value={num(s.total)} delta={dNum(s.total, prev?.sites?.total)} deltaGood="none" />
        <Stat label="Armazenamento" value={mb(s.storage_mb)} delta={dNum(s.storage_mb, prev?.sites?.storage_mb, (v) => mb(v))} />
        <Stat label="Arquivos" value={num(f.total)} hint={bytes(f.size_bytes)} />
        <Stat label="Versões (excedente)" value={bytes(versionsOver)} hint={`${num(f.total_versions)} versões`} />
        <Stat label="Parado há +2 anos" value={bytes(f.stale_2y_bytes)} hint={`${pct(f.stale_2y, f.total)}% dos arquivos`} />
        <Stat label="Acesso externo" value={num(s.external_sharing)} hint={`${pct(s.external_sharing, s.total)}% dos ${word}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Espaço liberado limitando versões">
          <BarList color={SERIES[1]} rows={[
            { label: "Manter 100 versões", value: vs.liberado_100v_bytes || 0, display: bytes(vs.liberado_100v_bytes) },
            { label: "Manter 50 versões", value: vs.liberado_50v_bytes || 0, display: bytes(vs.liberado_50v_bytes) },
            { label: "Manter 20 versões", value: vs.liberado_20v_bytes || 0, display: bytes(vs.liberado_20v_bytes) },
          ]} />
          <p className="mt-2 text-xs text-slate-500">Cálculo arquivo a arquivo sobre as versões coletadas.</p>
        </Card>
        <Card title="Conteúdo sem alteração">
          <BarList color={SERIES[2]} rows={[
            { label: "Há mais de 1 ano", value: f.stale_1y_bytes || 0, display: bytes(f.stale_1y_bytes), title: `${num(f.stale_1y)} arquivos` },
            { label: "Há mais de 2 anos", value: f.stale_2y_bytes || 0, display: bytes(f.stale_2y_bytes), title: `${num(f.stale_2y)} arquivos` },
            { label: "Há mais de 3 anos", value: f.stale_3y_bytes || 0, display: bytes(f.stale_3y_bytes), title: `${num(f.stale_3y)} arquivos` },
            { label: "Há mais de 5 anos", value: f.stale_5y_bytes || 0, display: bytes(f.stale_5y_bytes), title: `${num(f.stale_5y)} arquivos` },
          ]} />
        </Card>
        <Card title="Tipos de arquivo">
          <BarList rows={groupFileTypes(sec.file_types ?? []).slice(0, 6).map((t) => ({ label: t.name, value: t.size_bytes, display: bytes(t.size_bytes), title: `${num(t.count)} arquivos` }))} />
        </Card>
      </div>
      {type === "SharePoint" && (d.critical_sites?.length ?? 0) > 0 && (
        <Card title="Sites sensíveis com acesso externo" aside={<span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Crítico</span>}>
          <DataTable file="sites-sensiveis" cols={[{ key: "title", label: "Site", kind: "link", hrefKey: "url" }, { key: "capability", label: "Compartilhamento" }, { key: "storage_bytes", label: "Tamanho", kind: "bytes" }]} rows={(d.critical_sites ?? []).map((x: any) => ({ ...x, capability: tr(SHARING_LABEL, x.capability) }))} />
        </Card>
      )}
      {(sec.orphaned_sites?.length ?? 0) > 0 && (
        <Card title={`${type === "SharePoint" ? "Sites" : "OneDrives"} sem dono ativo`}>
          <DataTable file={`sem-dono-${type.toLowerCase()}`} cols={[{ key: "title", label: "Site", kind: "link", hrefKey: "url" }, { key: "total_owners", label: "Donos cadastrados", kind: "num" }, { key: "storage_bytes", label: "Tamanho", kind: "bytes" }]} rows={sec.orphaned_sites} />
        </Card>
      )}
      <Card title={`Todos os ${word}`}>
        <DataTable file={`${word}`} initialSort={{ key: "size_bytes", dir: "desc" }} cols={[
          { key: "title", label: "Nome", kind: "link", hrefKey: "url" }, { key: "total_files", label: "Arquivos", kind: "num" }, { key: "size_bytes", label: "Tamanho", kind: "bytes" },
          { key: "capability", label: "Compartilhamento" }, ...(type === "SharePoint" ? [{ key: "sensivel", label: "Nome sensível" }] : []),
        ]} rows={sites} />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Maiores arquivos">
          <DataTable file={`maiores-arquivos-${type.toLowerCase()}`} pageSize={10} cols={[{ key: "file_name", label: "Arquivo", kind: "link", hrefKey: "file_url" }, { key: "site_name", label: "Site" }, { key: "file_size", label: "Tamanho", kind: "bytes" }, { key: "total_file_size", label: "Com versões", kind: "bytes" }]} rows={sec.top_heaviest ?? []} />
        </Card>
        <Card title="Arquivos com mais versões">
          <DataTable file={`mais-versoes-${type.toLowerCase()}`} pageSize={10} cols={[{ key: "file_name", label: "Arquivo", kind: "link", hrefKey: "file_url" }, { key: "site_name", label: "Site" }, { key: "versions_count", label: "Versões", kind: "num" }, { key: "total_file_size", label: "Com versões", kind: "bytes" }]} rows={sec.top_versioned ?? []} />
        </Card>
      </div>
      {type === "SharePoint" && (d.duplicates?.length ?? 0) > 0 && (
        <Card title="Arquivos duplicados (candidatos)">
          <DataTable file="duplicados" pageSize={10} cols={[{ key: "sample_file_name", label: "Arquivo" }, { key: "file_type", label: "Tipo" }, { key: "copy_count", label: "Cópias", kind: "num" }, { key: "distinct_sites", label: "Sites", kind: "num" }, { key: "wasted_bytes", label: "Espaço repetido", kind: "bytes" }]} rows={d.duplicates} />
        </Card>
      )}
      {type === "SharePoint" && sec.trash && (
        <p className="text-sm text-slate-600">Lixeira dos sites: <b>{bytes(sec.trash.size_bytes)}</b> em {num(sec.trash.total)} itens ({num(sec.trash.first_stage)} no 1º estágio, {num(sec.trash.second_stage)} no 2º).</p>
      )}
    </div>
  );
}

// ───────────── Licenciamento ─────────────
export function Licensing({ d, p }: { d: Dash; p: Dash | null }) {
  const l = d.licensing ?? {};
  if (!l.total_skus) return <Empty>Esta coleta não tem dados de licenciamento. Inclua o workload Licenciamento na próxima execução.</Empty>;
  const idle = idleLicenses(d.licensing_by_sku ?? []);
  const rows = idle.rows.map((r: any) => ({ ...r, name: r.friendly_name || r.sku_part_number, tipo: r.free ? "Gratuita/viral" : "Paga", idleCostFmt: r.price ? usd(r.idleCost) : "—" }));
  const paid = rows.filter((r: any) => !r.free);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Licenças contratadas" value={num(l.total_licenses)} hint={`${num(l.total_skus)} SKUs`} delta={dNum(l.total_licenses, p?.licensing?.total_licenses)} deltaGood="none" />
        <Stat label="Em uso" value={num(l.used_licenses)} hint={`${pct(l.used_licenses, l.total_licenses)}% de uso`} />
        <Stat label="Não atribuídas (pagas)" value={num(idle.idle)} hint="SKUs gratuitas e virais ficam de fora" tone={idle.idle > 0 ? "warn" : "ok"} />
        <Stat label="Custo ocioso estimado" value={`${usd(idle.monthly)}/mês`} hint="preço público de referência" tone={idle.monthly > 0 ? "warn" : "ok"} />
      </div>
      <Card title="Uso por SKU">
        <BarList rows={paid.filter((r: any) => r.total_licenses > 0).sort((a: any, b: any) => b.total_licenses - a.total_licenses).slice(0, 12).map((r: any) => ({
          label: r.name, value: r.used_licenses, display: `${num(r.used_licenses)} de ${num(r.total_licenses)}`, sub: r.idle > 0 ? `${num(r.idle)} não atribuídas${r.price ? ` · ${usd(r.idleCost)}/mês` : ""}` : undefined,
        }))} />
      </Card>
      <Card title="Todas as SKUs">
        <DataTable file="licencas" initialSort={{ key: "idle", dir: "desc" }} cols={[
          { key: "name", label: "Licença" }, { key: "sku_part_number", label: "SKU" }, { key: "total_licenses", label: "Contratadas", kind: "num" }, { key: "used_licenses", label: "Em uso", kind: "num" },
          { key: "idle", label: "Ociosas", kind: "num" }, { key: "utilization_pct", label: "Uso", kind: "pct" }, { key: "tipo", label: "Tipo" }, { key: "idleCostFmt", label: "Custo ocioso/mês" },
        ]} rows={rows} />
      </Card>
    </div>
  );
}

// ───────────── Adoção ─────────────
export function Adoption({ d }: { d: Dash }) {
  const svc: any[] = d.adoption_by_service ?? [];
  if (!svc.length) return <Empty>Esta coleta não tem dados de adoção. Inclua o workload Adoção (exige Reports.Read.All).</Empty>;
  return (
    <div className="space-y-6">
      <Card title="Usuários ativos nos últimos 30 dias">
        <div className="space-y-5">
          {svc.map((r) => (
            <div key={r.service}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{r.service}</span><span className="text-slate-500">{pct(r.active_users, r.licensed_users)}% ativos</span></div>
              <StackBar height={12} parts={[
                { label: "Ativos", value: r.active_users, color: SERIES[0], display: num(r.active_users) },
                { label: "Sem atividade", value: r.inactive_users, color: NEUTRAL, display: num(r.inactive_users) },
              ]} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Usuários sem atividade (amostra por serviço)">
        <DataTable file="usuarios-inativos" cols={[{ key: "user_principal_name", label: "Usuário" }, { key: "service", label: "Serviço" }, { key: "last_activity_date", label: "Última atividade", kind: "date" }]} rows={d.adoption_inactive_users ?? []} />
      </Card>
    </div>
  );
}

// ───────────── Exchange ─────────────
export function Exchange({ d }: { d: Dash }) {
  const m = d.mailbox ?? {};
  if (!m.total) return <Empty>Esta coleta não tem dados de caixas de e-mail. Inclua o workload Caixas de e-mail (exige Reports.Read.All).</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Caixas" value={num(m.total)} />
        <Stat label="Armazenamento total" value={bytes(m.storage_total_bytes)} hint={`média ${bytes(m.storage_avg_bytes)} por caixa`} />
        <Stat label="Com arquivo morto" value={num(m.with_archive)} hint={`${pct(m.with_archive, m.total)}% das caixas`} />
        <Stat label="Perto da cota (≥ 90%)" value={num(m.near_quota)} tone={m.near_quota > 0 ? "warn" : "ok"} />
      </div>
      <Card title="Caixas de e-mail">
        <DataTable file="caixas" initialSort={{ key: "quota_pct", dir: "desc" }} cols={[
          { key: "display_name", label: "Nome" }, { key: "user_principal_name", label: "E-mail" }, { key: "storage_used_bytes", label: "Usado", kind: "bytes" },
          { key: "quota_pct", label: "% da cota", kind: "pct" }, { key: "item_count", label: "Itens", kind: "num" }, { key: "has_archive", label: "Arquivo morto", kind: "bool" }, { key: "last_activity_date", label: "Última atividade", kind: "date" },
        ]} rows={d.mailbox_list ?? []} />
      </Card>
    </div>
  );
}

// ───────────── Intune ─────────────
export function Intune({ d }: { d: Dash }) {
  const it = d.intune ?? {};
  if (!it.total) return <Empty>Esta coleta não tem dados de dispositivos. Inclua o workload Dispositivos Intune.</Empty>;
  const byOs: any[] = d.intune_by_os ?? [];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Dispositivos" value={num(it.total)} />
        <Stat label="Em conformidade" value={`${pct(it.compliant, it.total)}%`} hint={`${num(it.non_compliant)} fora`} tone={pct(it.non_compliant, it.total) >= 10 ? "risk" : "ok"} />
        <Stat label="Sem criptografia" value={num(it.not_encrypted)} tone={it.not_encrypted > 0 ? "risk" : "ok"} />
        <Stat label="Em risco" value={num(it.at_risk)} tone={it.at_risk > 0 ? "warn" : "ok"} />
        <Stat label="Sem contato há +30 dias" value={num(it.stale_30d)} tone={it.stale_30d > 0 ? "warn" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Conformidade por sistema">
          <div className="space-y-4">
            {byOs.map((r) => (
              <div key={r.os_type}>
                <div className="mb-1 text-sm font-medium">{r.os_type || "Outro"} <span className="text-slate-500">· {num(r.total)}</span></div>
                <StackBar height={10} parts={[
                  { label: "Em conformidade", value: r.compliant, color: STATUS.good, display: num(r.compliant) },
                  { label: "Fora", value: Math.max(0, r.total - r.compliant), color: STATUS.critical, display: num(Math.max(0, r.total - r.compliant)) },
                ]} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Políticas que mais falham">
          <BarList color={SERIES[2]} rows={(d.intune_compliance_failures ?? []).slice(0, 10).map((r: any) => ({ label: r.policy_name, value: r.device_count, display: `${num(r.device_count)} disp.`, sub: r.platform_type }))} empty="Nenhuma falha de política registrada." />
        </Card>
      </div>
      <Card title="Dispositivos">
        <DataTable file="dispositivos" cols={[
          { key: "device_name", label: "Dispositivo" }, { key: "owner_name", label: "Usuário" }, { key: "os_type", label: "Sistema" }, { key: "os_version", label: "Versão" },
          { key: "compliance_status", label: "Conformidade" }, { key: "is_encrypted", label: "Criptografado", kind: "bool" }, { key: "last_checkin_date", label: "Último contato", kind: "date" },
        ]} rows={(d.intune_devices ?? []).map((x: any) => ({ ...x, compliance_status: tr(COMPLIANCE_LABEL, x.compliance_status) }))} />
      </Card>
    </div>
  );
}

export { GB };
