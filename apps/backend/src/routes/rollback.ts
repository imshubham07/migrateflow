import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { WorkflowError } from "../services/approval.js";
import { rollbackMigration } from "../services/rollback.js";

const prisma = new PrismaClient();
export const rollbackRouter = Router();
rollbackRouter.post("/migrations/:migrationId/executions/:executionId/rollback", async (request, response, next) => {
  try { response.status(201).json(await rollbackMigration(request.params.migrationId as string, request.params.executionId as string)); }
  catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "ROLLBACK_NOT_ALLOWED", message: error.message } }); else next(error); }
});
rollbackRouter.get("/migrations/:migrationId/executions/:executionId/rollback", async (request, response, next) => {
  try {
    const result = await prisma.rollback.findUnique({ where: { executionId: request.params.executionId as string } });
    if (!result || result.migrationId !== request.params.migrationId) { response.status(404).json({ error: { code: "ROLLBACK_NOT_FOUND", message: "Rollback result not found." } }); return; }
    response.json(result);
  } catch (error) { next(error); }
});
