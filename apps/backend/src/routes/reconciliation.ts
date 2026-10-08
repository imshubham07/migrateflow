import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { WorkflowError } from "../services/approval.js";
import { reconcileMigration } from "../services/reconciliation.js";

const prisma = new PrismaClient();
export const reconciliationRouter = Router();
reconciliationRouter.post("/migrations/:migrationId/executions/:executionId/reconcile", async (request, response, next) => {
  try { response.status(201).json(await reconcileMigration(request.params.migrationId as string, request.params.executionId as string)); }
  catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "RECONCILIATION_NOT_ALLOWED", message: error.message } }); else next(error); }
});
reconciliationRouter.get("/migrations/:migrationId/executions/:executionId/reconciliation", async (request, response, next) => {
  try {
    const result = await prisma.reconciliation.findUnique({ where: { executionId: request.params.executionId as string } });
    if (!result || result.migrationId !== request.params.migrationId) { response.status(404).json({ error: { code: "RECONCILIATION_NOT_FOUND", message: "Reconciliation not found." } }); return; }
    response.json(result);
  } catch (error) { next(error); }
});
