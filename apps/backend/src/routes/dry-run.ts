import { Router } from "express";
import { runDryRun } from "../services/dry-run.js";
import { WorkflowError } from "../services/approval.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const dryRunRouter = Router();
dryRunRouter.post("/migrations/:migrationId/plans/:planId/dry-run", async (request, response, next) => {
  try { response.status(201).json(await runDryRun(request.params.migrationId as string, request.params.planId as string)); }
  catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "DRY_RUN_NOT_ALLOWED", message: error.message } }); else next(error); }
});
dryRunRouter.get("/migrations/:migrationId/executions", async (request, response, next) => {
  try { response.json(await prisma.migrationExecution.findMany({ where: { migrationId: request.params.migrationId as string }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, status: true, sourceCount: true, transformedCount: true, acceptedCount: true, rejectedCount: true, migratedCount: true, createdAt: true, completedAt: true } })); }
  catch (error) { next(error); }
});
dryRunRouter.get("/migrations/:migrationId/executions/:executionId", async (request, response, next) => {
  try {
    const execution = await prisma.migrationExecution.findUnique({ where: { id: request.params.executionId as string }, include: { quarantine: true, dryRunRecords: true } });
    if (!execution || execution.migrationId !== request.params.migrationId) { response.status(404).json({ error: { code: "EXECUTION_NOT_FOUND", message: "Execution not found." } }); return; }
    response.json(execution);
  } catch (error) { next(error); }
});
