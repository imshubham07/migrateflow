import "dotenv/config";
import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { logger } from "./utils/logger.js";
import { analysisRouter } from "./routes/analysis.js";
import { approvalRouter } from "./routes/approval.js";
import { workspaceRouter } from "./routes/workspace.js";
import { dryRunRouter } from "./routes/dry-run.js";
import { migrationExecutionRouter } from "./routes/migration-execution.js";
import { reconciliationRouter } from "./routes/reconciliation.js";
import { rollbackRouter } from "./routes/rollback.js";
import { demoResetRouter } from "./routes/demo-reset.js";
import { migrationsRouter } from "./routes/migrations.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Public demo API: allow browser requests from any origin. Credentials remain disabled.
app.use(cors({ origin: true }));
app.use(express.json());

// Vercel exposes this service under /api, while local development keeps the
// existing root-level API routes. Normalize both forms before routing.
app.use((request, _response, next) => {
  if (request.url === "/api") request.url = "/";
  else if (request.url.startsWith("/api/")) request.url = request.url.slice(4);
  next();
});

app.use(healthRouter);
app.use(analysisRouter);
app.use(approvalRouter);
app.use(workspaceRouter);
app.use(dryRunRouter);
app.use(migrationExecutionRouter);
app.use(reconciliationRouter);
app.use(rollbackRouter);
app.use(demoResetRouter);
app.use(migrationsRouter);
app.use(errorHandler);

app.listen(port, () => logger.info(`MigrateFlow API listening on port ${port}`));
