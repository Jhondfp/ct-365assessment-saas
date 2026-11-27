import { cache } from "react";
import { prisma } from "./prisma";
import { clientConn } from "./clientDb";
import { readQuery, type Row } from "./tenantDb";

/**
 * Levantamento AWS → Azure: lê as tabelas aws_* do banco do cliente (job/aws) e aplica as regras de migração —
 * equivalente no Azure, tamanho de VM pelo uso real, estratégia (6R), ondas por aplicação e pontos de atenção.
 * Preços de VM vêm da API pública de preços do Azure (Retail Prices). São sugestões para dimensionar a proposta.
 */
const N = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const NN = (v: unknown) => (v == null || v === "" ? null : Number(v));
const B = (v: unknown) => v === true || v === 1 || v === "1";
const S = (v: unknown) => (v == null ? "" : String(v));
const D = (v: unknown) => (v ? new Date(v as string) : null);

export const AZURE_REGION = "brazilsouth";
const HOURS_MONTH = 730;

// ───────────── VM: família e tamanho no Azure ─────────────
type Family = { key: string; ratio: number; sizes: number[]; sku: (n: number) => string; label: string };
const FAMILIES: Record<"B" | "F" | "D" | "E", Family> = {
  B: { key: "B", ratio: 4, sizes: [2, 4, 8, 12, 16], sku: (n) => `Standard_B${n}ms`, label: "B (burstable)" },
  F: { key: "F", ratio: 2, sizes: [2, 4, 8, 16, 32, 48, 64, 72], sku: (n) => `Standard_F${n}s_v2`, label: "Fsv2 (computação)" },
  D: { key: "D", ratio: 4, sizes: [2, 4, 8, 16, 32, 48, 64, 96], sku: (n) => `Standard_D${n}s_v5`, label: "Dsv5 (uso geral)" },
  E: { key: "E", ratio: 8, sizes: [2, 4, 8, 16, 20, 32, 48, 64, 96], sku: (n) => `Standard_E${n}s_v5`, label: "Esv5 (memória)" },
};
const OLD_GEN = /^(t1|t2|m1|m2|m3|m4|c1|c3|c4|r3|r4|i2|d2|x1|g2|g3|p2)\./;

export type VmSuggestion = { sku: string; vcpu: number; memGiB: number; family: string; rightsized: boolean; reason: string };
export function suggestVm(i: { vcpu: number | null; memMiB: number | null; burstable: boolean; cpuAvg: number | null; cpuMax: number | null }): VmSuggestion | null {
  if (!i.vcpu || !i.memMiB) return null;
  const mem = i.memMiB / 1024;
  const low = i.cpuMax != null && i.cpuMax < 35 && i.vcpu >= 4;
  const target = low ? Math.ceil(i.vcpu / 2) : i.vcpu;
  // servidores muito pequenos (ex.: t2.micro): B1ms / B2s, em vez de pular para 2 vCPU e 8 GiB
  if (i.vcpu <= 1 && mem <= 2) return { sku: "Standard_B1ms", vcpu: 1, memGiB: 2, family: "B (burstable)", rightsized: false, reason: "servidor pequeno" };
  if (target <= 2 && mem <= 4 && (i.cpuAvg == null || i.cpuAvg < 25)) return { sku: "Standard_B2s", vcpu: 2, memGiB: 4, family: "B (burstable)", rightsized: low, reason: "servidor pequeno e pouco usado" };
  const ratio = mem / target;
  const fam = i.burstable && target <= 16 && (i.cpuAvg == null || i.cpuAvg < 25) ? FAMILIES.B : ratio <= 2.2 ? FAMILIES.F : ratio <= 4.4 ? FAMILIES.D : FAMILIES.E;
  const n = fam.sizes.find((s) => s >= target && s * fam.ratio >= mem * 0.95) ?? fam.sizes[fam.sizes.length - 1];
  const reason = low ? `pico de CPU ${i.cpuMax?.toFixed(0)}% em 30 dias: metade dos vCPUs` : i.cpuMax == null ? "sem métrica de CPU: mesmo tamanho" : "mesmo tamanho (uso compatível)";
  return { sku: fam.sku(n), vcpu: n, memGiB: n * fam.ratio, family: fam.label, rightsized: low, reason };
}

// ───────────── Preço no Azure (API pública Retail Prices, cache de 24 h) ─────────────
type Price = { linux: number | null; windows: number | null };
const priceCache = new Map<string, { at: number; p: Promise<Price> }>();
async function fetchVmPrice(sku: string): Promise<Price> {
  const filter = `serviceName eq 'Virtual Machines' and armRegionName eq '${AZURE_REGION}' and armSkuName eq '${sku}' and priceType eq 'Consumption'`;
  const url = `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&$filter=${encodeURIComponent(filter)}`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return { linux: null, windows: null };
    const j = (await r.json()) as { Items?: { retailPrice: number; productName: string; skuName: string; unitOfMeasure: string }[] };
    const items = (j.Items ?? []).filter((x) => x.unitOfMeasure === "1 Hour" && !/Spot|Low Priority/i.test(x.skuName) && !/Cloud Services/i.test(x.productName));
    const win = items.find((x) => /Windows/i.test(x.productName)), lin = items.find((x) => !/Windows/i.test(x.productName));
    return { linux: lin ? lin.retailPrice : null, windows: win ? win.retailPrice : null };
  } catch { return { linux: null, windows: null }; } finally { clearTimeout(t); }
}
export function vmPrice(sku: string) {
  const hit = priceCache.get(sku);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.p;
  const p = fetchVmPrice(sku); priceCache.set(sku, { at: Date.now(), p });
  return p;
}

// ───────────── Equivalentes e estratégia (6R) ─────────────
export type Strategy = "Rehost" | "Replatform" | "Refactor" | "Retire" | "Retain";
export function dbTarget(kind: string, engine: string): { target: string; strategy: Strategy } {
  const e = engine.toLowerCase();
  if (kind === "dynamodb") return { target: "Azure Cosmos DB (NoSQL)", strategy: "Refactor" };
  if (kind === "elasticache") return { target: "Azure Managed Redis", strategy: "Replatform" };
  if (e.startsWith("sqlserver")) return { target: "Azure SQL Managed Instance ou Azure SQL Database", strategy: "Replatform" };
  if (e.includes("postgres")) return { target: "Azure Database for PostgreSQL (Flexible Server)", strategy: "Replatform" };
  if (e.includes("mysql") || e.includes("mariadb")) return { target: "Azure Database for MySQL (Flexible Server)", strategy: "Replatform" };
  if (e.startsWith("oracle")) return { target: "Oracle Database@Azure ou VM no Azure", strategy: "Rehost" };
  if (e.startsWith("db2")) return { target: "VM no Azure (Db2)", strategy: "Rehost" };
  return { target: "Avaliar", strategy: "Replatform" };
}
export const SERVICE_TARGET: Record<string, { target: string; strategy: Strategy; label: string }> = {
  lambda: { target: "Azure Functions", strategy: "Refactor", label: "Lambda" },
  ecs: { target: "Azure Container Apps", strategy: "Replatform", label: "ECS" },
  eks: { target: "Azure Kubernetes Service (AKS)", strategy: "Replatform", label: "EKS" },
  asg: { target: "Virtual Machine Scale Sets", strategy: "Rehost", label: "Auto Scaling" },
};
export const VOLUME_TARGET: Record<string, string> = {
  gp3: "Premium SSD v2", gp2: "Premium SSD", io1: "Premium SSD v2 ou Ultra Disk", io2: "Premium SSD v2 ou Ultra Disk",
  st1: "Standard HDD", sc1: "Standard HDD", standard: "Standard HDD", efs: "Azure Files (NFS)",
};
export const NETWORK_TARGET: Record<string, string> = {
  vpc: "Virtual Network (VNet)", vpn: "VPN Gateway", directconnect: "ExpressRoute", tgw: "Virtual WAN / hub-spoke", nat: "NAT Gateway",
  "lb-application": "Application Gateway (ou Front Door)", "lb-network": "Azure Load Balancer", "lb-gateway": "Gateway Load Balancer",
  "lb-classic": "Azure Load Balancer", route53: "Azure DNS", cloudfront: "Azure Front Door",
};
export const NETWORK_LABEL: Record<string, string> = {
  vpc: "VPC", vpn: "VPN site a site", directconnect: "Direct Connect", tgw: "Transit Gateway", nat: "NAT Gateway",
  "lb-application": "Application Load Balancer", "lb-network": "Network Load Balancer", "lb-gateway": "Gateway Load Balancer",
  "lb-classic": "Classic Load Balancer", route53: "Zona Route 53", cloudfront: "Distribuição CloudFront",
};

const ENV_ORDER = (e: string) => (/dev|des|test|tst|qa|hml|homol|stag|sandbox/i.test(e) ? 0 : /prod|prd/i.test(e) ? 2 : 1);

export const awsData = cache(async (clientId: string, executionId: string) => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const db = await clientConn(c);
  const p = { e: executionId };
  const q = async (sql: string) => { try { return await readQuery(db, sql, p, 120_000); } catch { return [] as Row[]; } };
  const [inst, vols, buckets, dbs, svcs, net, costs, accounts, summary] = await Promise.all([
    q("SELECT * FROM dbo.aws_instances WHERE execution_id = @e"),
    q("SELECT region, volume_id, size_gb, volume_type, attached, instance_id FROM dbo.aws_volumes WHERE execution_id = @e"),
    q("SELECT region, bucket_name, size_bytes, standard_bytes, ia_bytes, archive_bytes, objects FROM dbo.aws_buckets WHERE execution_id = @e"),
    q("SELECT * FROM dbo.aws_databases WHERE execution_id = @e"),
    q("SELECT region, kind, name, detail FROM dbo.aws_services WHERE execution_id = @e"),
    q("SELECT region, kind, resource_id, name, detail FROM dbo.aws_network WHERE execution_id = @e"),
    q("SELECT month, service, amount, currency FROM dbo.aws_costs WHERE execution_id = @e"),
    q("SELECT account_id, name, status, is_current FROM dbo.aws_accounts WHERE execution_id = @e"),
    q("SELECT item, value FROM dbo.aws_summary WHERE execution_id = @e"),
  ]);

  const ebsByInstance = new Map<string, number>();
  for (const v of vols) if (v.instance_id) ebsByInstance.set(S(v.instance_id), (ebsByInstance.get(S(v.instance_id)) ?? 0) + N(v.size_gb));

  const instances = await Promise.all(inst.map(async (r) => {
    const i = {
      id: S(r.instance_id), name: S(r.name) || S(r.instance_id), region: S(r.region), type: S(r.instance_type), vcpu: NN(r.vcpu), memMiB: NN(r.memory_mib),
      burstable: B(r.burstable), state: S(r.state), windows: S(r.platform) === "windows", platformDetails: S(r.platform_details), sql: /SQL Server/i.test(S(r.platform_details)),
      launch: D(r.launch_time), cpuAvg: NN(r.cpu_avg), cpuMax: NN(r.cpu_max), app: S(r.app_tag), env: S(r.env_tag), publicIp: B(r.public_ip), ebsGB: ebsByInstance.get(S(r.instance_id)) ?? 0,
      oldGen: OLD_GEN.test(S(r.instance_type)),
    };
    const vm = suggestVm(i);
    const price = vm ? await vmPrice(vm.sku) : { linux: null, windows: null };
    const hourly = i.windows ? price.windows : price.linux;
    const stopped = i.state === "stopped";
    const strategy: Strategy = stopped ? "Retire" : "Rehost";
    const strategyNote = stopped ? "parada: confirmar se ainda é usada" : i.sql ? "Windows com SQL Server: avaliar Azure SQL MI (Replatform)" : "migração com Azure Migrate";
    return { ...i, vm, monthly: hourly != null && !stopped ? hourly * HOURS_MONTH : null, monthlyAhb: i.windows && price.linux != null && !stopped ? price.linux * HOURS_MONTH : null, strategy, strategyNote };
  }));

  const databases = dbs.map((r) => {
    const t = dbTarget(S(r.kind), S(r.engine));
    return { kind: S(r.kind), id: S(r.identifier), region: S(r.region), engine: S(r.engine), version: S(r.engine_version), cls: S(r.instance_class), vcpu: NN(r.vcpu), memMiB: NN(r.memory_mib), storageGB: N(r.storage_gb), multiAz: B(r.multi_az), license: S(r.license_model), status: S(r.status), ...t };
  });

  // custos: média dos meses completos (até 3 mais recentes)
  const byMonth = new Map<string, number>(); const byService = new Map<string, number>();
  for (const r of costs) { const m = D(r.month)?.toISOString().slice(0, 7) ?? ""; byMonth.set(m, (byMonth.get(m) ?? 0) + N(r.amount)); }
  const months = [...byMonth.keys()].sort().slice(-3);
  for (const r of costs) { const m = D(r.month)?.toISOString().slice(0, 7) ?? ""; if (months.includes(m)) byService.set(S(r.service), (byService.get(S(r.service)) ?? 0) + N(r.amount) / months.length); }
  const awsMonthly = months.length ? months.reduce((a, m) => a + (byMonth.get(m) ?? 0), 0) / months.length : null;

  // ondas: por aplicação (tag), ambientes de teste antes de produção, até ~25 servidores por onda
  const running = instances.filter((i) => i.state === "running");
  const groups = new Map<string, { app: string; env: string; servers: number; vcpu: number }>();
  for (const i of running) {
    const k = `${i.app || "(sem tag de aplicação)"}|${i.env || "—"}`;
    const g = groups.get(k) ?? { app: i.app || "(sem tag de aplicação)", env: i.env || "—", servers: 0, vcpu: 0 };
    g.servers++; g.vcpu += i.vcpu ?? 0; groups.set(k, g);
  }
  const ordered = [...groups.values()].sort((a, b) => ENV_ORDER(a.env) - ENV_ORDER(b.env) || a.servers - b.servers);
  const waves: { name: string; items: string[]; servers: number; vcpu: number }[] = [];
  let lastClass = -1;
  for (const g of ordered) {
    let w = waves[waves.length - 1];
    const cls = ENV_ORDER(g.env);   // não mistura testes e produção na mesma onda
    if (!w || w.servers + g.servers > 25 || cls !== lastClass) { w = { name: `Onda ${waves.length + 1}`, items: [], servers: 0, vcpu: 0 }; waves.push(w); }
    w.items.push(`${g.app} (${g.env})`); w.servers += g.servers; w.vcpu += g.vcpu; lastClass = cls;
  }

  const sum = Object.fromEntries(summary.map((r) => [S(r.item), S(r.value)]));
  const bucketBytes = buckets.reduce((a, b) => a + N(b.size_bytes), 0);
  const ebsGB = vols.filter((v) => S(v.volume_type) !== "efs").reduce((a, v) => a + N(v.size_gb), 0);
  return {
    accounts: accounts.map((a) => ({ id: S(a.account_id), name: S(a.name), status: S(a.status), current: B(a.is_current) })),
    regions: (sum.regions ?? "").split(",").filter(Boolean), iam: sum,
    instances, databases,
    services: svcs.map((s) => ({ region: S(s.region), kind: S(s.kind), name: S(s.name), detail: S(s.detail), ...(SERVICE_TARGET[S(s.kind)] ?? { target: "Avaliar", strategy: "Replatform" as Strategy, label: S(s.kind) }) })),
    volumes: vols.map((v) => ({ id: S(v.volume_id), region: S(v.region), sizeGB: N(v.size_gb), type: S(v.volume_type), attached: B(v.attached), instance: S(v.instance_id), target: VOLUME_TARGET[S(v.volume_type)] ?? "Managed Disk" })),
    buckets: buckets.map((b) => ({ name: S(b.bucket_name), region: S(b.region), bytes: N(b.size_bytes), standard: N(b.standard_bytes), ia: N(b.ia_bytes), archive: N(b.archive_bytes), objects: NN(b.objects) })),
    network: net.map((n) => ({ region: S(n.region), kind: S(n.kind), id: S(n.resource_id), name: S(n.name), detail: S(n.detail), label: NETWORK_LABEL[S(n.kind)] ?? S(n.kind), target: NETWORK_TARGET[S(n.kind)] ?? "Avaliar" })),
    costs: { monthly: awsMonthly, months, ec2: [...byService.entries()].filter(([k]) => /Elastic Compute Cloud - Compute/i.test(k)).reduce((a, [, v]) => a + v, 0) || null, byService: [...byService.entries()].sort((a, b) => b[1] - a[1]).map(([service, amount]) => ({ service, amount })), hasData: costs.length > 0 },
    azureVmMonthly: running.reduce((a, i) => a + (i.monthly ?? 0), 0), azureVmMonthlyAhb: running.reduce((a, i) => a + (i.windows ? i.monthlyAhb ?? i.monthly ?? 0 : i.monthly ?? 0), 0),
    pricedVms: running.filter((i) => i.monthly != null).length, runningCount: running.length,
    storage: { ebsGB, bucketBytes, efsGB: vols.filter((v) => S(v.volume_type) === "efs").reduce((a, v) => a + N(v.size_gb), 0) },
    waves,
  };
});
export type AwsData = Awaited<ReturnType<typeof awsData>>;

/** Resumo para o Archie (escopo/proposta de migração AWS → Azure). */
export function awsExport(clientName: string, d: AwsData) {
  const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
  return {
    origem: "CT Assessment 365 · levantamento AWS", cliente: clientName, ambiente_atual: "AWS", destino: "Microsoft Azure", regiao_azure_referencia: AZURE_REGION,
    contas: d.accounts.map((a) => ({ conta: a.id, nome: a.name })), regioes_aws: d.regions,
    servidores: {
      total: d.instances.length, ligados: d.runningCount, parados: count(d.instances, (i) => i.state === "stopped"), windows: count(d.instances, (i) => i.windows), com_sql_server: count(d.instances, (i) => i.sql),
      vcpu_total: d.instances.reduce((a, i) => a + (i.vcpu ?? 0), 0), memoria_gib_total: Math.round(d.instances.reduce((a, i) => a + (i.memMiB ?? 0), 0) / 1024),
      itens: d.instances.map((i) => ({ nome: i.name, tipo_aws: i.type, vcpu: i.vcpu, memoria_gib: i.memMiB ? +(i.memMiB / 1024).toFixed(1) : null, so: i.windows ? "Windows" : "Linux", estado: i.state, cpu_pico_30d: i.cpuMax, aplicacao: i.app || null, ambiente: i.env || null, vm_azure_sugerida: i.vm?.sku ?? null, estrategia: i.strategy, custo_azure_mes_usd: i.monthly != null ? +i.monthly.toFixed(2) : null })),
    },
    bancos: d.databases.map((x) => ({ id: x.id, tipo: x.kind, motor: x.engine, versao: x.version, classe: x.cls, armazenamento_gb: x.storageGB, multi_az: x.multiAz, destino_azure: x.target, estrategia: x.strategy })),
    servicos: d.services.map((s) => ({ tipo: s.label, nome: s.name, destino_azure: s.target, estrategia: s.strategy })),
    armazenamento: { ebs_gb: d.storage.ebsGB, efs_gb: d.storage.efsGB, s3_gb: +(d.storage.bucketBytes / 1024 ** 3).toFixed(1), buckets: d.buckets.length },
    rede: Object.fromEntries([...new Set(d.network.map((n) => n.label))].map((l) => [l, count(d.network, (n) => n.label === l)])),
    custos_usd: { aws_mes_medio: d.costs.monthly != null ? +d.costs.monthly.toFixed(2) : null, azure_vms_mes_payg: +d.azureVmMonthly.toFixed(2), azure_vms_mes_com_ahb: +d.azureVmMonthlyAhb.toFixed(2), top_servicos_aws: d.costs.byService.slice(0, 10).map((s) => ({ servico: s.service, mes_usd: +s.amount.toFixed(2) })) },
    ondas: d.waves.map((w) => ({ onda: w.name, grupos: w.items, servidores: w.servers, vcpu: w.vcpu })),
  };
}
