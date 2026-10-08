import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { resetDemoMigration } from "../services/demo-reset.js";
import { WorkflowError } from "../services/approval.js";

export const demoResetRouter = Router();
demoResetRouter.post("/migrations/:migrationId/reset-demo", async (request: Request, response: Response, next: NextFunction) => {
  try { response.json(await resetDemoMigration(request.params.migrationId as string)); }
  catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "DEMO_RESET_NOT_ALLOWED", message: error.message } }); else next(error); }
});
