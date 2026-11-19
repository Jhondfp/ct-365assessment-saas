import { BarList, SERIES, Stat } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Empty } from "@/components/ui";
import { PLAN_ORDER, type GoogleData } from "@/lib/googleReport";
import { bytes, num, pct } from "@/lib/insights";

const DEVICE_STATUS: Record<string, string> = { APPROVED: "Aprovado", ACTIVE: "Ativo", PENDING: "Pendente", BLOCKED: "Bloqueado", DISABLED: "Desativado", DEPROVISIONED: "Desprovisionado", WIPING: "Apagando", WIPED: "Apagado", PROVISIONED: "Provisionado" };
const GB = 1024 ** 3, MB = 1024 ** 2;
const gb = (mbv: number) => bytes(mbv * MB);

function Card({ title, children, aside, className = "" }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={`card break-inside-avoid ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="card-title !mb-0">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

/** Levantamento Google Workspace com foco na migração para o Microsoft 365. */
export function GoogleReport({ d, exportHref }: { d: GoogleData; exportHref: string }) {
  const u = d.users;
  if (!u.length) return <Empty>Esta coleta ainda não tem usuários do Google Workspace. Rode o levantamento com o módulo Identidades.</Empty>;
  const active = u.filter((x) => !x.suspended && !x.archived);
  const mailMB = u.reduce((a, x) => a + x.gmailMB, 0), driveMB = u.reduce((a, x) => a + x.driveMB, 0), photosMB = u.reduce((a, x) => a + x.photosMB, 0);
  const over50 = u.filter((x) => x.gmailMB > 50 * 1024), over100 = u.filter((x) => x.gmailMB > 100 * 1024);
  const no2sv = active.filter((x) => !x.twoSv);
  const domainsToVerify = d.domains.length;
  const plans = PLAN_ORDER.map((p) => ({ plan: p, n: u.filter((x) => x.plan === p).length })).filter((x) => x.n > 0);
  const buckets = (vals: number[], edges: number[], labels: string[]) => labels.map((label, i) => ({ label, value: vals.filter((v) => v >= edges[i] * 1024 && (i === labels.length - 1 || v < edges[i + 1] * 1024)).length }));
  const mailB = buckets(active.map((x) => x.gmailMB), [0, 5, 15, 50, 100], ["até 5 GB", "5 a 15 GB", "15 a 50 GB", "50 a 100 GB", "acima de 100 GB"]);
  const driveB = buckets(active.map((x) => x.driveMB), [0, 1, 15, 100, 1024], ["até 1 GB", "1 a 15 GB", "15 a 100 GB", "100 GB a 1 TB", "acima de 1 TB"]);
  const ext = u.filter((x) => x.external > 0 || x.anyone > 0);
  const inactive = active.filter((x) => x.plan === "Sem licença (avaliar)");
  const manyAliases = u.filter((x) => x.aliases > 50);

  const findings = [
    over100.length > 0 && { sev: "Alto", t: `${num(over100.length)} caixa(s) acima de 100 GB`, a: "Exigem arquivo morto (Exchange Online Archiving / E3) e migração em etapas; considere migrar só os últimos anos e levar o histórico para o arquivo." },
    over50.length > over100.length && { sev: "Médio", t: `${num(over50.length - over100.length)} caixa(s) entre 50 e 100 GB`, a: "Não cabem nos planos Business/E1 (50 GB): precisam de E3 ou Exchange Online Plano 2." },
    no2sv.length > 0 && { sev: "Alto", t: `${num(no2sv.length)} usuário(s) ativos sem verificação em 2 etapas`, a: "Na migração, exigir MFA no Entra ID (padrões de segurança ou Acesso Condicional) desde o primeiro login." },
    ext.length > 0 && { sev: "Médio", t: `${num(ext.length)} usuário(s) com arquivos compartilhados fora do domínio`, a: "Os compartilhamentos não migram 1:1: mapear os convidados externos e refazer as permissões no SharePoint/OneDrive." },
    inactive.length > 0 && { sev: "Médio", t: `${num(inactive.length)} conta(s) ativa(s) sem uso há mais de 90 dias`, a: "Validar com o cliente: desligar, converter em caixa compartilhada (sem licença) ou migrar só o conteúdo." },
    domainsToVerify > 1 && { sev: "Baixo", t: `${num(domainsToVerify)} domínios e aliases de domínio`, a: "Todos precisam ser verificados no Microsoft 365 antes do corte de MX; planejar a janela de DNS." },
    d.groups.length > 0 && { sev: "Baixo", t: `${num(d.groups.length)} grupos`, a: "Classificar: lista de distribuição (só e-mail) ou Grupo do Microsoft 365/Teams (colaboração)." },
    d.resources.length > 0 && { sev: "Baixo", t: `${num(d.resources.length)} salas e recursos de agenda`, a: "Recriar como caixas de sala/equipamento no Exchange antes de migrar as agendas, para manter as reservas." },
    manyAliases.length > 0 && { sev: "Baixo", t: `${num(manyAliases.length)} usuário(s) com mais de 50 aliases`, a: "Conferir o limite de endereços proxy no Exchange e o que realmente precisa ser mantido." },
  ].filter(Boolean) as { sev: string; t: string; a: string }[];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Usuários ativos" value={num(active.length)} hint={`${num(u.length)} contas no total`} />
        <Stat label="E-mail (Gmail)" value={gb(mailMB)} hint={`média ${gb(active.length ? mailMB / active.length : 0)} por usuário`} />
        <Stat label="Drive" value={gb(driveMB)} hint={photosMB ? `+ ${gb(photosMB)} em Fotos` : undefined} />
        <Stat label="Caixas > 50 GB" value={num(over50.length)} hint={over100.length ? `${num(over100.length)} acima de 100 GB` : undefined} tone={over50.length ? "warn" : "ok"} />
        <Stat label="Sem 2 etapas" value={`${pct(no2sv.length, active.length)}%`} hint={`${num(no2sv.length)} usuários ativos`} tone={no2sv.length ? "risk" : "ok"} />
        <Stat label="Domínios a verificar" value={num(domainsToVerify)} hint={`${num(d.groups.length)} grupos · ${num(d.ous.length)} unidades`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Licenciamento Microsoft 365 sugerido" aside={<span className="text-xs text-slate-500">pelo uso real{d.bigTenant ? " · mais de 300 usuários: sem planos Business" : ""}</span>}>
          <BarList rows={plans.map((p) => ({ label: p.plan, value: p.n, display: `${num(p.n)} · ${pct(p.n, u.length)}%`, sub: u.find((x) => x.plan === p.plan)?.reason }))} />
          {d.licenses.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hoje no Google</h3>
              <BarList color={SERIES[2]} rows={d.licenses.map((l) => ({ label: l.sku, value: l.n, display: num(l.n) }))} />
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Sugestão para dimensionar a proposta: valide requisitos de segurança, compliance e aplicativos desktop antes de fechar o licenciamento.</p>
        </Card>
        <Card title="Pontos de atenção para a migração" aside={<span className="text-xs text-slate-500">{findings.length} ponto(s)</span>}>
          {findings.length ? (
            <ul className="divide-y divide-slate-100">
              {findings.map((f, i) => (
                <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium"><span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${f.sev === "Alto" ? "bg-orange-100 text-orange-800" : f.sev === "Médio" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{f.sev}</span>{f.t}</p>
                  <p className="text-sm text-slate-600">{f.a}</p>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nenhum ponto de atenção com os dados desta coleta.</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tamanho das caixas de e-mail" aside={<span className="text-xs text-slate-500">usuários ativos</span>}>
          <BarList rows={mailB.map((b) => ({ label: b.label, value: b.value, display: `${num(b.value)} · ${pct(b.value, active.length)}%` }))} />
        </Card>
        <Card title="Uso do Drive por usuário" aside={<span className="text-xs text-slate-500">usuários ativos</span>}>
          <BarList color={SERIES[1]} rows={driveB.map((b) => ({ label: b.label, value: b.value, display: `${num(b.value)} · ${pct(b.value, active.length)}%` }))} />
        </Card>
      </div>

      <Card title="Ondas sugeridas" aside={<span className="text-xs text-slate-500">por unidade organizacional · até ~150 usuários ou ~1,5 TB por onda</span>}>
        <table className="tbl">
          <thead><tr><th>Onda</th><th>Unidades organizacionais</th><th className="text-right">Usuários</th><th className="text-right">Volume (e-mail + Drive)</th></tr></thead>
          <tbody>
            {d.waves.map((w) => (
              <tr key={w.name}><td className="font-medium">{w.name}</td><td className="text-sm text-slate-600">{w.ous.join(", ")}</td><td className="text-right tabular-nums">{num(w.users)}</td><td className="text-right tabular-nums">{bytes(w.gb * GB)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Ponto de partida: comece por uma onda piloto pequena (TI e usuários-chave) e ajuste a divisão com o cliente.</p>
      </Card>

      <Card title="Usuários" aside={<a className="link text-xs print:hidden" href={exportHref}>Exportar resumo (JSON para o Archie)</a>}>
        <DataTable file="usuarios-google" initialSort={{ key: "gmailBytes", dir: "desc" }} cols={[
          { key: "email", label: "Usuário" }, { key: "ou", label: "Unidade" }, { key: "planShort", label: "Licença sugerida" },
          { key: "gmailBytes", label: "E-mail", kind: "bytes" }, { key: "driveBytes", label: "Drive", kind: "bytes" }, { key: "lastLogin", label: "Último login", kind: "date" },
          { key: "external", label: "Itens externos", kind: "num" }, { key: "status", label: "Situação" },
        ]} rows={u.map((x) => ({ ...x, planShort: x.plan.replace(/^Microsoft 365 |^Office 365 /, ""), gmailBytes: x.gmailMB * MB, driveBytes: x.driveMB * MB, lastLogin: x.lastLogin?.toISOString() ?? null, status: x.archived ? "Arquivado" : x.suspended ? "Suspenso" : x.admin ? "Admin" : "" }))} />
        <p className="mt-2 text-xs text-slate-500">O motivo de cada sugestão e a licença Google atual vão no CSV e no JSON exportados.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Domínios">
            <DataTable file="dominios-google" pageSize={10} cols={[{ key: "name", label: "Domínio" }, { key: "tipo", label: "Tipo" }, { key: "verificado", label: "Verificado" }]}
              rows={d.domains.map((x) => ({ ...x, tipo: x.primary ? "Principal" : x.alias ? `Alias de ${x.parent}` : "Secundário", verificado: x.verified ? "Sim" : "Não" }))} />
          </Card>
          {d.resources.length > 0 && (
            <Card title="Salas e recursos">
              <DataTable file="recursos-google" pageSize={8} cols={[{ key: "name", label: "Recurso" }, { key: "tipo", label: "Tipo" }, { key: "capacity", label: "Capacidade", kind: "num" }]}
                rows={d.resources.map((x) => ({ ...x, tipo: x.category === "CONFERENCE_ROOM" ? "Sala de reunião" : "Equipamento / outro" }))} />
            </Card>
          )}
        </div>
        <Card title="Grupos">
          <DataTable file="grupos-google" pageSize={8} initialSort={{ key: "members", dir: "desc" }} cols={[{ key: "email", label: "Grupo" }, { key: "name", label: "Nome" }, { key: "members", label: "Membros diretos", kind: "num" }]} rows={d.groups} />
        </Card>
      </div>

      {d.devices.length > 0 && (
        <Card title="Dispositivos" aside={<span className="text-xs text-slate-500">celulares e Chromebooks gerenciados · base para o plano de Intune</span>}>
          <DataTable file="dispositivos-google" pageSize={10} cols={[{ key: "tipo", label: "Tipo" }, { key: "model", label: "Modelo" }, { key: "os", label: "Sistema" }, { key: "owner", label: "Usuário" }, { key: "status", label: "Status" }, { key: "lastSync", label: "Última sincronização", kind: "date" }]}
            rows={d.devices.map((x) => ({ ...x, tipo: x.kind === "chromeos" ? "Chromebook" : "Celular", status: DEVICE_STATUS[x.status.toUpperCase()] ?? x.status, lastSync: x.lastSync?.toISOString() ?? null }))} />
        </Card>
      )}
      <p className="text-xs text-slate-500">Relatório de uso do Google de {d.reportDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })} (o Google publica com 2 a 3 dias de atraso). Não lemos conteúdo de e-mails nem de arquivos.</p>
    </div>
  );
}
