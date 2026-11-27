import { BarList, SERIES, Stat } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { Empty } from "@/components/ui";
import { AZURE_REGION, type AwsData, type Strategy } from "@/lib/awsReport";
import { bytes, num, pct } from "@/lib/insights";

const GB = 1024 ** 3;
const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`);
const STRATEGY_HINT: Record<Strategy, string> = {
  Rehost: "levar como está (VM no Azure)", Replatform: "trocar pelo serviço gerenciado equivalente", Refactor: "reescrever para o serviço do Azure",
  Retire: "desligar (não migrar)", Retain: "manter onde está",
};

function Card({ title, children, aside, className = "" }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={`card break-inside-avoid ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="card-title !mb-0">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

/** Levantamento AWS com foco na migração para o Azure. */
export function AwsReport({ d, exportHref }: { d: AwsData; exportHref: string }) {
  const total = d.instances.length + d.databases.length + d.services.length + d.buckets.length;
  if (!total) return <Empty>Esta coleta ainda não tem recursos da AWS. Rode o levantamento com os módulos Computação, Armazenamento e Bancos.</Empty>;
  const running = d.instances.filter((i) => i.state === "running"), stopped = d.instances.filter((i) => i.state === "stopped");
  const vcpu = running.reduce((a, i) => a + (i.vcpu ?? 0), 0), memGiB = running.reduce((a, i) => a + (i.memMiB ?? 0), 0) / 1024;
  const windows = d.instances.filter((i) => i.windows), sql = d.instances.filter((i) => i.sql);
  const rdsSqlLic = d.databases.filter((x) => x.engine.startsWith("sqlserver") && x.license === "license-included");
  const unattached = d.volumes.filter((v) => !v.attached && v.type !== "efs");
  const oldGen = d.instances.filter((i) => i.oldGen);
  const noTag = running.filter((i) => !i.app);
  const dataGB = d.storage.ebsGB + d.storage.efsGB + d.storage.bucketBytes / GB;
  const egress = dataGB * 0.09;
  const rootMfa = d.iam["iam.AccountMFAEnabled"];
  const hybrid = d.network.filter((n) => n.kind === "directconnect" || n.kind === "vpn");
  const rightsized = running.filter((i) => i.vm?.rightsized);

  const findings = [
    rootMfa === "0" && { sev: "Alto", t: "Conta raiz da AWS sem MFA", a: "Corrigir já na AWS e, no Azure, exigir MFA para administradores (Acesso Condicional / PIM) desde o primeiro dia." },
    stopped.length > 0 && { sev: "Médio", t: `${num(stopped.length)} servidor(es) parado(s)`, a: "Candidatos a não migrar (Retire): confirmar com o cliente antes de incluir no escopo." },
    windows.length > 0 && { sev: "Médio", t: `${num(windows.length)} servidor(es) Windows${sql.length ? `, ${num(sql.length)} com SQL Server` : ""}`, a: "Com Software Assurance, o Azure Hybrid Benefit reduz bastante o custo das VMs Windows e do SQL; validar o licenciamento do cliente." },
    rdsSqlLic.length > 0 && { sev: "Médio", t: `${num(rdsSqlLic.length)} RDS SQL Server com licença inclusa`, a: "No Azure SQL MI/Database dá para usar a licença própria (Hybrid Benefit) ou pagar no serviço; comparar." },
    dataGB > 500 && { sev: "Médio", t: `${bytes(dataGB * GB)} de dados para transferir`, a: `Saída da AWS custa ~US$ 0,09/GB pela tabela (≈ ${usd(egress)}); a AWS oferece isenção para quem está saindo, sob pedido ao suporte. Planejar AzCopy/Data Box e janelas.` },
    unattached.length > 0 && { sev: "Baixo", t: `${num(unattached.length)} disco(s) EBS sem uso (${num(unattached.reduce((a, v) => a + v.sizeGB, 0))} GB)`, a: "Não migrar e apagar na AWS: custo sem uso." },
    oldGen.length > 0 && { sev: "Baixo", t: `${num(oldGen.length)} instância(s) de geração antiga`, a: "Boa hora para modernizar: o tamanho sugerido no Azure já usa as séries atuais (v5)." },
    rightsized.length > 0 && { sev: "Baixo", t: `${num(rightsized.length)} servidor(es) superdimensionados`, a: "Pico de CPU abaixo de 35% em 30 dias: a sugestão no Azure já reduz os vCPUs pela metade. Confirmar picos sazonais (fechamento, matrículas)." },
    hybrid.length > 0 && { sev: "Baixo", t: `${num(hybrid.length)} conexão(ões) híbrida(s) (VPN/Direct Connect)`, a: "Planejar ExpressRoute ou VPN Gateway antes da primeira onda, com a mesma conectividade com o datacenter." },
    noTag.length > running.length / 2 && running.length > 0 && { sev: "Baixo", t: `${pct(noTag.length, running.length)}% dos servidores sem tag de aplicação`, a: "Mapear servidores por aplicação com o cliente (ou Azure Migrate com análise de dependências) para fechar as ondas." },
    !d.costs.hasData && { sev: "Baixo", t: "Sem dados de custo da AWS", a: "Liberar ce:GetCostAndUsage (e ativar o Cost Explorer) para comparar o gasto atual com a estimativa no Azure." },
    d.services.some((s) => s.kind === "lambda" || s.kind === "eks") && { sev: "Baixo", t: "Serviços que exigem adaptação (Lambda/EKS)", a: "Funções e clusters precisam de ajustes de código/manifesto: dimensionar o esforço de Refactor/Replatform à parte." },
  ].filter(Boolean) as { sev: string; t: string; a: string }[];

  const strat = new Map<Strategy, number>();
  for (const s of [...d.instances.map((i) => i.strategy), ...d.databases.map((x) => x.strategy), ...d.services.map((x) => x.strategy)]) strat.set(s, (strat.get(s) ?? 0) + 1);
  const volByType = Object.values(d.volumes.reduce<Record<string, { type: string; target: string; n: number; gb: number }>>((a, v) => {
    const k = v.type; a[k] ??= { type: k.toUpperCase(), target: v.target, n: 0, gb: 0 }; a[k].n++; a[k].gb += v.sizeGB; return a;
  }, {}));
  const netByKind = Object.values(d.network.reduce<Record<string, { label: string; target: string; n: number }>>((a, n) => {
    a[n.kind] ??= { label: n.label, target: n.target, n: 0 }; a[n.kind].n++; return a;
  }, {}));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Servidores (EC2)" value={num(running.length)} hint={`${num(d.instances.length)} no total · ${num(stopped.length)} parados`} />
        <Stat label="vCPU / memória" value={num(vcpu)} hint={`${num(memGiB)} GiB nos servidores ligados`} />
        <Stat label="Armazenamento" value={bytes(dataGB * GB)} hint={`EBS ${num(d.storage.ebsGB)} GB · S3 ${bytes(d.storage.bucketBytes)}`} />
        <Stat label="Bancos gerenciados" value={num(d.databases.length)} hint={`${num(d.databases.filter((x) => x.kind === "rds").length)} RDS/Aurora`} />
        <Stat label="Gasto AWS / mês" value={usd(d.costs.monthly)} hint={d.costs.months.length ? `média de ${d.costs.months.length} mês(es)` : "sem dados de custo"} />
        <Stat label="VMs no Azure / mês" value={usd(d.azureVmMonthlyAhb)} hint={<>com Hybrid Benefit · {usd(d.azureVmMonthly)} sem{d.costs.ec2 ? <><br />EC2 na AWS hoje: {usd(d.costs.ec2)}</> : null}</>} tone="ok" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
        <div className="space-y-6">
          <Card title="Estratégia sugerida (6R)" aside={<span className="text-xs text-slate-500">servidores, bancos e serviços</span>}>
            <BarList rows={[...strat.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: s, value: n, display: num(n), sub: STRATEGY_HINT[s] }))} />
          </Card>
          <Card title="Onde está o gasto na AWS" aside={<span className="text-xs text-slate-500">média mensal por serviço</span>}>
            {d.costs.byService.length
              ? <BarList color={SERIES[2]} rows={d.costs.byService.slice(0, 8).map((s) => ({ label: s.service.replace(/^Amazon |^AWS /, ""), value: s.amount, display: usd(s.amount) }))} />
              : <p className="muted">Sem dados de custo (módulo Custos não rodou ou falta a permissão ce:GetCostAndUsage).</p>}
          </Card>
          <Card title="Armazenamento → Azure">
          <table className="tbl">
            <thead><tr><th>AWS</th><th className="text-right">Itens</th><th className="text-right">Tamanho</th><th>Destino no Azure</th></tr></thead>
            <tbody>
              {volByType.map((v) => <tr key={v.type}><td>{v.type === "EFS" ? "EFS" : `EBS ${v.type}`}</td><td className="text-right tabular-nums">{num(v.n)}</td><td className="text-right tabular-nums">{num(v.gb)} GB</td><td>{v.target}</td></tr>)}
              {d.buckets.length > 0 && <tr><td>S3</td><td className="text-right tabular-nums">{num(d.buckets.length)}</td><td className="text-right tabular-nums">{bytes(d.storage.bucketBytes)}</td><td>Blob Storage (Hot/Cool/Archive)</td></tr>}
            </tbody>
          </table>
          </Card>
        </div>
      </div>

      <Card title="Servidores → VMs no Azure" aside={<a className="link text-xs print:hidden" href={exportHref}>Exportar resumo (JSON para o Archie)</a>}>
        <DataTable file="servidores-aws" initialSort={{ key: "vcpu", dir: "desc" }} cols={[
          { key: "name", label: "Servidor" }, { key: "type", label: "Tipo AWS" }, { key: "vcpu", label: "vCPU", kind: "num" }, { key: "memGiB", label: "Memória (GiB)", kind: "num" },
          { key: "so", label: "SO" }, { key: "cpuMax", label: "Pico CPU %", kind: "num" }, { key: "sku", label: "VM sugerida" }, { key: "monthly", label: "US$/mês", kind: "num" },
          { key: "strategy", label: "Estratégia" }, { key: "app", label: "Aplicação" },
        ]} rows={d.instances.map((i) => ({ ...i, memGiB: i.memMiB ? Math.round(i.memMiB / 1024) : null, so: i.windows ? (i.sql ? "Windows + SQL" : "Windows") : "Linux", sku: i.vm ? i.vm.sku.replace("Standard_", "") : "—", monthly: (() => { const v = i.windows ? i.monthlyAhb ?? i.monthly : i.monthly; return v == null ? null : Math.round(v); })() }))} />
        <p className="mt-2 text-xs text-slate-500">Preços pay-as-you-go da região {AZURE_REGION} pela API pública do Azure; Windows com Hybrid Benefit. Reservas de 1 ou 3 anos reduzem mais. Sem métrica de memória, o tamanho preserva a memória atual. A planilha (CSV) traz o motivo de cada sugestão.</p>
      </Card>

      {d.databases.length > 0 && (
        <Card title="Bancos de dados → Azure">
          <DataTable file="bancos-aws" pageSize={10} cols={[
            { key: "id", label: "Banco" }, { key: "engine", label: "Motor" }, { key: "version", label: "Versão" }, { key: "cls", label: "Classe" },
            { key: "storageGB", label: "GB", kind: "num" }, { key: "az", label: "Multi-AZ" }, { key: "target", label: "Destino no Azure" }, { key: "strategy", label: "Estratégia" },
          ]} rows={d.databases.map((x) => ({ ...x, az: x.multiAz ? "Sim" : "Não" }))} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card title="Rede → Azure">
          {netByKind.length ? (
            <table className="tbl">
              <thead><tr><th>AWS</th><th className="text-right">Itens</th><th>Destino no Azure</th></tr></thead>
              <tbody>{netByKind.map((n) => <tr key={n.label}><td>{n.label}</td><td className="text-right tabular-nums">{num(n.n)}</td><td>{n.target}</td></tr>)}</tbody>
            </table>
          ) : <p className="muted">Sem dados de rede nesta coleta.</p>}
          </Card>
        </div>
        {d.buckets.length > 0 && (
          <div className="lg:col-span-3">
            <Card title="Buckets S3" aside={<span className="text-xs text-slate-500">tamanho pelas métricas diárias do S3</span>}>
          <DataTable file="buckets-aws" pageSize={10} initialSort={{ key: "bytes", dir: "desc" }} cols={[
            { key: "name", label: "Bucket" }, { key: "region", label: "Região" }, { key: "bytes", label: "Total", kind: "bytes" },
            { key: "standard", label: "Standard", kind: "bytes" }, { key: "ia", label: "Acesso raro", kind: "bytes" }, { key: "archive", label: "Arquivo", kind: "bytes" }, { key: "objects", label: "Objetos", kind: "num" },
          ]} rows={d.buckets} />
            </Card>
          </div>
        )}
      </div>

      {d.services.length > 0 && (
        <Card title="Outros serviços → Azure">
          <DataTable file="servicos-aws" pageSize={10} cols={[{ key: "label", label: "Serviço" }, { key: "name", label: "Nome" }, { key: "region", label: "Região" }, { key: "detail", label: "Detalhe" }, { key: "target", label: "Destino no Azure" }, { key: "strategy", label: "Estratégia" }]} rows={d.services} />
        </Card>
      )}

      {d.waves.length > 0 && (
        <Card title="Ondas sugeridas" aside={<span className="text-xs text-slate-500">por aplicação e ambiente · testes antes de produção · até ~25 servidores por onda</span>}>
          <table className="tbl">
            <thead><tr><th>Onda</th><th>Aplicação (ambiente)</th><th className="text-right">Servidores</th><th className="text-right">vCPU</th></tr></thead>
            <tbody>{d.waves.map((w) => <tr key={w.name}><td className="font-medium">{w.name}</td><td className="text-sm text-slate-600">{w.items.join(", ")}</td><td className="text-right tabular-nums">{num(w.servers)}</td><td className="text-right tabular-nums">{num(w.vcpu)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Ponto de partida pelas tags. Para fechar as ondas, confirme as dependências entre servidores com o cliente (ou com a análise de dependências do Azure Migrate).</p>
        </Card>
      )}
      <p className="text-xs text-slate-500">Conta(s): {d.accounts.map((a) => `${a.id}${a.name ? ` (${a.name})` : ""}`).join(", ") || "—"} · regiões: {d.regions.join(", ") || "—"}. Só metadados e métricas foram lidos; nenhum dado de bucket, disco ou banco.</p>
    </div>
  );
}
