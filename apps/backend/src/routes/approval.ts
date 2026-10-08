import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { approvePlan, rejectPlan, submitPlan, WorkflowError } from "../services/approval.js";

export const approvalRouter = Router();
const transition = (operation: (migrationId: string, planId: string, reason?: string) => Promise<unknown>) => async (request: Request, response: Response, next: NextFunction) => {
  try { response.json(await operation(request.params.migrationId as string, request.params.planId as string, request.body?.reason)); }
  catch (error) { if (error instanceof WorkflowError) response.status(error.status).json({ error: { code: "INVALID_WORKFLOW_TRANSITION", message: error.message } }); else next(error); }
};
approvalRouter.post("/migrations/:migrationId/plans/:planId/submit", transition(submitPlan));
approvalRouter.post("/migrations/:migrationId/plans/:planId/approve", transition(approvePlan));
approvalRouter.post("/migrations/:migrationId/plans/:planId/reject", transition(rejectPlan));
