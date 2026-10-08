import { PrismaClient, SchemaType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();
const demoPath = (file: string) => join(process.cwd(), "data", "demo", file);

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(demoPath(file), "utf8")) as unknown;
}

async function main(): Promise<void> {
  const migration = await prisma.migration.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: { name: "Legacy Customers → Customers", sampleLimit: 1000 },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Legacy Customers → Customers",
      sourceName: "legacy_customers",
      targetName: "customers",
      sampleLimit: 1000,
    },
  });

  for (const [type, file] of [[SchemaType.SOURCE, "source-schema.json"], [SchemaType.TARGET, "target-schema.json"]] as const) {
    await prisma.migrationSchema.upsert({
      where: { migrationId_type_version: { migrationId: migration.id, type, version: 1 } },
      update: { definition: await readJson(file) },
      create: { migrationId: migration.id, type, version: 1, definition: await readJson(file) },
    });
  }

  console.log(`Seeded demo migration ${migration.id} with source and target schemas.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
