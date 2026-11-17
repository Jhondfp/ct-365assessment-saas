import { prisma } from "@/lib/prisma";
import { assessmentWhere, requirePagePerm } from "@/lib/session";
import Link from "next/link";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { AssessmentTable } from "@/components/assessments";

export default async function Execucoes() {
  const u = await requirePagePerm("reports:view");
  const rows = await prisma.assessment.findMany({
    where: assessmentWhere(u),
    take: 200, orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } }, startedBy: { select: { name: true, email: true } } },
  });
  return (
    <>
      <PageHeader title="Execuções" subtitle="Cada execução roda o coletor do ct-assessmentspo e grava no banco do cliente." actions={can(u.roles, "assessments:run") && <Link href="/execucoes/nova" className="btn">Nova execução</Link>} />
      <section className="card"><AssessmentTable rows={rows} showClient /></section>
    </>
  );
}
