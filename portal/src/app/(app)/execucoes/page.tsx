import { prisma } from "@/lib/prisma";
import { assessmentWhere, requirePagePerm } from "@/lib/session";
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
      <PageHeader title="Execuções" subtitle="Cada execução roda o coletor do ct-assessmentspo num container isolado e grava no banco do cliente." />
      <section className="card"><AssessmentTable rows={rows} showClient /></section>
    </>
  );
}
