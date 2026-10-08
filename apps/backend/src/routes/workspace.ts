import { PrismaClient } from "@prisma/client";
import { Router } from "express";

const prisma = new PrismaClient();
export const workspaceRouter = Router();

workspaceRouter.get("/migrations", async (_request, response, next) => {
  try {
    const migrations = await prisma.migration.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, sourceName: true, targetName: true, status: true, createdAt: true },
    });
    response.json({ migrations });
  } catch (error) { next(error); }
});

workspaceRouter.get("/migrations/:migrationId", async (request, response, next) => {
  try {
    const migration = await prisma.migration.findUnique({ where: { id: request.params.migrationId }, include: { schemas: true, plans: { orderBy: { version: "desc" } }, executions: { orderBy: { createdAt: "desc" } }, auditEvents: { orderBy: { createdAt: "desc" } } } });
    if (!migration) { response.status(404).json({ error: { code: "MIGRATION_NOT_FOUND", message: "Migration not found." } }); return; }
    response.json(migration);
  } catch (error) { next(error); }
});

workspaceRouter.get("/migrations/:migrationId/plans", async (request, response, next) => {
  try {
    const plans = await prisma.migrationPlan.findMany({ where: { migrationId: request.params.migrationId }, orderBy: { version: "desc" } });
    response.json({ plans });
  } catch (error) { next(error); }
});
