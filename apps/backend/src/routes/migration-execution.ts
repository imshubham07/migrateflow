import { Router } from "express";
import type { NextFunction, Response } from "express";
import { executeMigration, retryMigration } from "../services/migration-execution.js";
import { WorkflowError } from "../services/approval.js";

export const migrationExecutionRouter = Router();
const handle = async (operation: () => Promise<unknown>, response: Response, next: NextFunction) => {
  try { response.status(201).json(await operation()); } catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "EXECUTION_NOT_ALLOWED", message: error.message } }); else next(error); }
};
migrationExecutionRouter.post("/migrations/:migrationId/plans/:planId/execute", (request, response, next) => handle(() => executeMigration(request.params.migrationId as string, request.params.planId as string), response, next));
migrationExecutionRouter.post("/migrations/:migrationId/executions/:executionId/retry", (request, response, next) => handle(() => retryMigration(request.params.migrationId as string, request.params.executionId as string), response, next));
