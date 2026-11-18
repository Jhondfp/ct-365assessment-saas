import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { callbackBase, jobToken } from "./jobToken";

const run = promisify(execFile);

/**
 * Onde o coletor (job/ — PowerShell + PnP) roda:
 *  - queue:  fila (produção). Workers (job/Start-Worker.ps1, Container App sempre ligado) pedem a próxima coleta em
 *            /api/jobs/claim. Não exige nenhum papel RBAC no Azure: só um token compartilhado (WORKER_TOKEN).
 *  - aca:    Azure Container Apps Job. O portal inicia uma execução por coleta pela API do ARM (exige o papel
 *            Container Apps Jobs Operator para a identidade do portal).
 *  - docker: `docker run` na mesma máquina do portal (desenvolvimento).
 *  - manual: o portal só registra; alguém roda o container/script com as 3 variáveis (ex.: dentro da rede do cliente).
 * Em todos os casos o container recebe só ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN e busca o resto no portal.
 */
export type Runner = "queue" | "aca" | "docker" | "manual";
export const RUNNER: Runner = (["queue", "aca", "docker", "manual"] as const).find((r) => r === process.env.JOB_RUNNER) ?? "manual";
export const RUNNER_LABEL: Record<Runner | "importado", string> = { queue: "Worker de coleta (fila)", aca: "Azure Container Apps Job", docker: "Docker local", manual: "Execução manual", importado: "Fora do portal (importada do banco do cliente)" };

export function jobEnv(assessmentId: string, taskId?: string) {
  return {
    ASSESSMENT_ID: assessmentId,
    CALLBACK_URL: `${callbackBase()}/api/jobs/${assessmentId}`,
    CALLBACK_TOKEN: jobToken(assessmentId),
    ...(taskId ? { TASK_ID: taskId } : {}),
  };
}

/** Comando para rodar a execução à mão (modo manual ou para reexecutar fora do Azure). */
export function manualCommand(assessmentId: string) {
  const e = jobEnv(assessmentId);
  const image = process.env.JOB_IMAGE || "ctassessment-job:latest";
  return {
    docker: `docker run --rm -e ASSESSMENT_ID=${e.ASSESSMENT_ID} -e CALLBACK_URL=${e.CALLBACK_URL} -e CALLBACK_TOKEN=${e.CALLBACK_TOKEN} ${image}`,
    pwsh: `pwsh -File ./Invoke-SaasAssessment.ps1 -AssessmentId ${e.ASSESSMENT_ID} -CallbackUrl ${e.CALLBACK_URL} -CallbackToken ${e.CALLBACK_TOKEN}`,
  };
}

// ───────────── Azure Container Apps Jobs ─────────────

const API = "2024-03-01";
function acaJobUrl(suffix = "") {
  const sub = process.env.ACA_SUBSCRIPTION_ID, rg = process.env.ACA_RESOURCE_GROUP, job = process.env.ACA_JOB_NAME;
  if (!sub || !rg || !job) throw new Error("JOB_RUNNER=aca exige ACA_SUBSCRIPTION_ID, ACA_RESOURCE_GROUP e ACA_JOB_NAME.");
  return `https://management.azure.com/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.App/jobs/${job}${suffix}`;
}

async function arm(method: string, url: string, body?: unknown) {
  const { DefaultAzureCredential } = await import("@azure/identity");
  const token = await new DefaultAzureCredential().getToken("https://management.azure.com/.default");
  const sep = url.includes("?") ? "&" : "?";
  const r = await fetch(`${url}${sep}api-version=${API}`, {
    method,
    headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Azure Container Apps respondeu ${r.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

type EnvVar = { name: string; value?: string; secretRef?: string };
type Container = { name: string; image: string; env?: EnvVar[]; [k: string]: unknown };

/**
 * Inicia uma execução do job. O override do template SUBSTITUI o template inteiro do job, então lemos o
 * template atual (imagem, recursos, secrets) e só acrescentamos as variáveis desta execução.
 */
async function acaStart(assessmentId: string) {
  const job = await arm("GET", acaJobUrl());
  const template = job.properties?.template ?? {};
  const env = jobEnv(assessmentId);
  const containers: Container[] = (template.containers ?? []).map((c: Container, i: number) =>
    i === 0 ? { ...c, env: [...(c.env ?? []).filter((v) => !(v.name in env)), ...Object.entries(env).map(([name, value]) => ({ name, value }))] } : c,
  );
  if (!containers.length) throw new Error("O Container Apps Job não tem container configurado.");
  const res = await arm("POST", acaJobUrl("/start"), { containers, initContainers: template.initContainers });
  return String(res.name ?? res.id ?? "").split("/").pop() || null;
}

/** Estado da execução no Azure: Running, Processing, Succeeded, Failed, Stopped, Degraded, Unknown. */
export async function acaExecutionStatus(executionName: string): Promise<string | null> {
  try {
    const r = await arm("GET", acaJobUrl(`/executions/${executionName}`));
    return r.properties?.status ?? null;
  } catch {
    return null;
  }
}

// ───────────── Docker local ─────────────

async function dockerStart(assessmentId: string) {
  const env = jobEnv(assessmentId);
  const image = process.env.JOB_IMAGE || "ctassessment-job:latest";
  const name = `ctassess-${assessmentId.slice(0, 8)}`;
  const args = ["run", "-d", "--rm", "--name", name, "--add-host", "host.docker.internal:host-gateway"];
  if (process.env.JOB_DOCKER_NETWORK) args.push("--network", process.env.JOB_DOCKER_NETWORK);
  for (const [k, v] of Object.entries(env)) args.push("-e", `${k}=${v}`);
  args.push(image);
  await run("docker", args, { timeout: 60_000 });
  return name;
}

// ───────────── API usada pelo portal ─────────────

export async function startJob(assessmentId: string): Promise<{ runner: Runner; ref: string | null }> {
  if (RUNNER === "aca") return { runner: RUNNER, ref: await acaStart(assessmentId) };
  if (RUNNER === "docker") return { runner: RUNNER, ref: await dockerStart(assessmentId) };
  return { runner: RUNNER, ref: null }; // queue e manual: fica QUEUED até um worker (ou alguém) pegar
}

export async function stopJob(runner: string, ref: string | null) {
  if (!ref) return;
  if (runner === "aca") await arm("POST", acaJobUrl(`/executions/${ref}/stop`));
  else if (runner === "docker") await run("docker", ["stop", ref], { timeout: 60_000 }).catch(() => {});
}
