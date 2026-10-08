# Database

MigrateFlow uses PostgreSQL through Prisma. The schema stores migration projects, versioned source/target schemas, future plans and executions, record-level outcomes, quarantine evidence, and workflow history.

## Models and relationships

- `Migration` owns `MigrationSchema`, `MigrationPlan`, `MigrationExecution`, `MigrationRecord`, and `AuditEvent` rows.
- `MigrationPlan` can have many executions.
- `MigrationExecution` owns migrated records, quarantine records, and execution-scoped audit events.
- Foreign keys use restrictive deletion behavior so history cannot be casually cascaded away.

Important indexes cover migration, execution, plan, status, event type, and creation-time lookups. Plan versions are unique per migration (`migrationId + version`).

`MigrationRecord(migrationId, sourceRecordId)` is unique so a source record cannot be migrated twice within one migration. This is the database-level foundation for idempotent retries.

`QuarantineRecord` stores the original `sourceData` and structured `errors` JSON, preserving field-level validation evidence for later review. `AuditEvent` stores workflow event names, metadata, and timestamps so the migration history remains inspectable.

## Local commands

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed is deterministic and upserts the fixed demo migration and its version-1 source and target schemas. Running it repeatedly does not create duplicate demo migrations. Source records remain in `data/demo/source-records.json`; record transformation and persistence belong to later milestones.

Rollback history is stored in `Rollback` and linked to one migration execution. Rollback deletes only `Customer` rows reached through that execution's `MigrationRecord` rows, then marks those records `ROLLED_BACK`. If a linked customer is already absent, it is recorded as `ALREADY_MISSING` and treated as effectively rolled back; unexpected deletion failures produce a failed rollback result.
