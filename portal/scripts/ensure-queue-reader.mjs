// Usuário só de leitura da fila no banco do portal, usado pela regra de escala (KEDA) do job do coletor:
// enxerga apenas dbo.Assessment e dbo.AssessmentTask. Sem QUEUE_SQL_PASSWORD, não faz nada.
// Uso: QUEUE_SQL_PASSWORD=... node scripts/ensure-queue-reader.mjs   (idempotente; acerta a senha a cada início)
import { PrismaClient } from "@prisma/client";

const password = process.env.QUEUE_SQL_PASSWORD ?? "";
const user = "queue_reader";
if (!password) process.exit(0);
const prisma = new PrismaClient();
try {
  const lit = password.replace(/'/g, "''");
  const exists = await prisma.$queryRawUnsafe(`SELECT 1 AS x FROM sys.database_principals WHERE name = '${user}'`);
  await prisma.$executeRawUnsafe(exists.length ? `ALTER USER [${user}] WITH PASSWORD = N'${lit}'` : `CREATE USER [${user}] WITH PASSWORD = N'${lit}'`);
  await prisma.$executeRawUnsafe(`GRANT SELECT ON dbo.Assessment TO [${user}]; GRANT SELECT ON dbo.AssessmentTask TO [${user}];`);
  console.log(`[queue-reader] usuário ${user} pronto (só leitura da fila)`);
} catch (e) {
  console.error(`[queue-reader] não foi possível preparar o usuário da fila: ${e instanceof Error ? e.message : e}`);
} finally {
  await prisma.$disconnect();
}
