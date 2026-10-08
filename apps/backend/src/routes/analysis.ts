import { Router } from "express";
import { analyzeMigration } from "../services/analysis.js";

export const analysisRouter = Router();
analysisRouter.post("/migrations/:migrationId/analyze", async (request, response, next) => {
  try { response.status(201).json(await analyzeMigration(request.params.migrationId)); }
  catch (error) { next(error); }
});
