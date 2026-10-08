# MigrateFlow

MigrateFlow is a bounded data-migration workbench for reviewing schema mappings, validating source records, approving a migration plan, running a dry run, executing eligible records, reconciling results, and rolling back records created by an execution.

The system separates planning from execution:

- A planning adapter produces a structured migration plan.
- A reviewer must approve the plan before execution is possible.
- The deterministic engine applies only supported transformations.
- Invalid or incompatible records are quarantined with field-level evidence.
- Execution, reconciliation, rollback, and audit history are persisted.

## Repository layout

```text
apps/frontend   Next.js web application
apps/backend    Express API and workflow services
packages/       Shared/database packages
prisma/         Prisma schema, migrations, and seed script
data/demo       Seed schemas and source records
tests/           Deterministic engine and upload validation tests
```

## Requirements

- Node.js 20+
- PostgreSQL
- A Gemini API key for plan generation

## Local setup

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Set `DATABASE_URL` and `GEMINI_API_KEY` in `.env` before starting the API. The web app runs at `http://localhost:3000` and the API runs at `http://localhost:4000` by default.

For a local Docker database:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npm run db:seed
```

Do not run database reset commands against a shared or production database.

## Environment files

`.env.example` is a placeholder template and is safe to commit. `.env` contains local secrets and runtime configuration, is ignored by Git, and must not be committed.

The backend loads `.env` through `dotenv/config` when `apps/backend/src/index.ts` starts. The frontend reads `NEXT_PUBLIC_API_URL` during the Next.js build/dev process.

## Common commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm test
npx prisma validate
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Workflow

1. Create a migration from the seeded demo or upload a source schema, target schema, and bounded source dataset.
2. Analyze the schemas and records to create a versioned plan.
3. Review mappings, transformations, risks, validation findings, and quarantine rules.
4. Submit the plan for approval.
5. Approve or reject it as a human reviewer.
6. Run the deterministic dry run after approval.
7. Execute only eligible records.
8. Reconcile source and target results.
9. Roll back records created by the selected execution when required.

Approval is enforced by the backend; the frontend cannot bypass it.

## Uploads

The upload page accepts a source schema JSON object, a target schema JSON object, and source records as either a JSON array or CSV. Current limits are 2 MB per file, 1,000 records, and 100 schema fields. Uploaded records are stored with their migration, and no uploaded code is executed.

```text
POST /migrations
```

Use multipart fields `sourceSchema`, `targetSchema`, and `sourceRecords`. An optional `name` field can name the migration.

## API areas

- `GET /health`
- `GET /migrations`
- `GET /migrations/:migrationId`
- `POST /migrations`
- `POST /migrations/:migrationId/analyze`
- Plan submit, approve, and reject endpoints
- Dry-run, execution, retry, reconciliation, and rollback endpoints

## Demo data

The seeded `legacy_customers → customers` migration contains 20 source records. Its expected deterministic dry-run result is:

```text
Source:      20
Transformed: 20
Accepted:    17
Rejected:     3
```

The rejected records demonstrate empty required fields, invalid email data, and an unsupported enum value explicitly routed to quarantine.

## Verification

The repository verifies deterministic transformations, quarantine behavior, JSON/CSV upload validation, bounded limits, enum mapping completeness, retry decisions, duplicate prevention, typechecking, linting, backend builds, tests, and Prisma schema validity.

## Scope

This is a bounded workbench rather than a general-purpose connector platform. It does not include authentication, live source-system connectors, arbitrary transformation scripts, background workers, or multi-database target adapters.
