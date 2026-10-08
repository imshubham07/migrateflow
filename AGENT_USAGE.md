# Agent Usage and Safety Boundaries

MigrateFlow uses Gemini only to propose a structured migration plan from inspected source schema, target schema, bounded sample records, and a fixed list of supported transformations.

The AI can inspect those tools and return mappings, transformations, risks, questions, and validation results. It cannot execute transformations, write target records, approve plans, call migration endpoints, or run arbitrary code. Malformed AI output is rejected by Zod validation.

Every plan requires an explicit backend approval transition before dry-run or execution. The deterministic engine performs transformation and validation without Gemini. Invalid records are preserved in quarantine with source data and structured errors. Reconciliation compares transformed expectations with target records and records field-level evidence.

Rollback deletes only target records reached through `MigrationRecord` relationships, preserves those records as history, and requires a completed migration execution. Unrelated target records are not eligible for deletion. No authentication, arbitrary scripts, live connectors, or production reset endpoint is included.
