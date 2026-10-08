import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyTransformation, transformAndValidateRecord } from "../apps/backend/src/services/deterministic-engine.ts";
import { normalizeEnumQuarantineMappings } from "../apps/backend/src/services/analysis.ts";
import { migrationRecordAction } from "../apps/backend/src/services/migration-execution.ts";
import { enumMappingErrors } from "../apps/backend/src/ai/tools/validate-mapping.ts";

test("enum mapping handles supported and unsupported values", () => {
  const transformation = { sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE" } };
  assert.equal(applyTransformation("active", transformation).value, "ACTIVE");
  assert.equal(applyTransformation("blocked", transformation).error?.code, "ENUM_VALUE_NOT_MAPPED");
});

test("explicit quarantine enum mapping rejects the record with field-level evidence", () => {
  const transformation = { sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE", blocked: "QUARANTINE" } };
  assert.equal(applyTransformation("active", transformation).value, "ACTIVE");
  assert.equal(applyTransformation("inactive", transformation).value, "INACTIVE");
  assert.equal(applyTransformation("blocked", transformation).error?.code, "QUARANTINED_ENUM_VALUE");
});

test("normalizes an empty executable enum config from source and target enums", () => {
  const normalized = normalizeEnumQuarantineMappings([{ sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: {} }], { fields: [{ name: "status", enum: ["active", "inactive", "blocked"] }] }, { fields: [{ name: "status", enum: ["ACTIVE", "INACTIVE"] }] });
  assert.deepEqual(normalized[0].config, { active: "ACTIVE", inactive: "INACTIVE", blocked: "QUARANTINE" });
});

test("migration retry skips migrated records and reuses rolled-back records", () => {
  assert.equal(migrationRecordAction("MIGRATED" as never), "SKIP");
  assert.equal(migrationRecordAction("ROLLED_BACK" as never), "REUSE");
  assert.equal(migrationRecordAction(undefined), "CREATE");
});

test("enum approval validation accepts explicit QUARANTINE and rejects incomplete mappings", () => {
  const source = { fields: [{ name: "status", enum: ["active", "inactive", "suspended"] }] };
  const target = { fields: [{ name: "status", enum: ["ACTIVE", "INACTIVE"] }] };
  const complete = [{ sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE", suspended: "QUARANTINE" } }];
  const incomplete = [{ sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE" } }];
  const unsupported = [{ sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE", suspended: "ACTIVE" } }];
  assert.deepEqual(enumMappingErrors(source, target, complete), []);
  assert.match(enumMappingErrors(source, target, incomplete)[0], /suspended/);
  assert.match(enumMappingErrors(source, target, unsupported)[0], /Invalid enum mapping/);
});

test("uploaded-style enum values are value-specific at runtime", () => {
  const transformation = { sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE", suspended: "QUARANTINE" } };
  assert.equal(applyTransformation("active", transformation).value, "ACTIVE");
  assert.equal(applyTransformation("inactive", transformation).value, "INACTIVE");
  assert.equal(applyTransformation("suspended", transformation).error?.code, "QUARANTINED_ENUM_VALUE");
});

test("optional target fields accept null while required non-nullable fields do not", () => {
  const optional = transformAndValidateRecord({ phone: null }, [{ sourceField: "phone", targetField: "phone" }], [], [{ name: "phone", type: "string", required: false }]);
  assert.deepEqual(optional.errors, []);
  const required = transformAndValidateRecord({ phone: null }, [{ sourceField: "phone", targetField: "phone" }], [], [{ name: "phone", type: "string", required: true }]);
  assert.ok(required.errors.some((error) => error.code === "NULL_NOT_ALLOWED"));
});

test("record validation catches invalid email and accepts nullable phone", () => {
  const result = transformAndValidateRecord({ name: "A", email: "bad", phone: null }, [{ sourceField: "name", targetField: "name" }, { sourceField: "email", targetField: "email" }, { sourceField: "phone", targetField: "phone" }], [], [{ name: "name", type: "string", required: true }, { name: "email", type: "string", required: true }, { name: "phone", type: "string", nullable: true }]);
  assert.equal(result.output.phone, null);
  assert.ok(result.errors.some((error) => error.code === "INVALID_EMAIL"));
});

test("demo dataset produces 20 transformations, 17 accepted, and 3 quarantined records", async () => {
  const records = JSON.parse(await readFile("data/demo/source-records.json", "utf8")) as Array<Record<string, unknown>>;
  const mappings = [
    { sourceField: "customer_id", targetField: "id" },
    { sourceField: "full_name", targetField: "name" },
    { sourceField: "email_address", targetField: "email" },
    { sourceField: "phone_number", targetField: "phone" },
    { sourceField: "status", targetField: "status" },
    { sourceField: "created_at", targetField: "createdAt" },
  ];
  const transformations = [
    { sourceField: "status", targetField: "status", type: "ENUM_MAPPING", config: { active: "ACTIVE", inactive: "INACTIVE", blocked: "QUARANTINE" } },
    { sourceField: "created_at", targetField: "createdAt", type: "DATE_NORMALIZE" },
  ];
  const targetFields = [
    { name: "id", type: "integer", required: true }, { name: "name", type: "string", required: true },
    { name: "email", type: "string", required: true }, { name: "phone", type: "string", nullable: true },
    { name: "status", type: "string", required: true, enum: ["ACTIVE", "INACTIVE"] }, { name: "createdAt", type: "datetime", required: true },
  ];
  const results = records.map((record) => transformAndValidateRecord(record, mappings, transformations, targetFields));
  assert.equal(results.length, 20);
  assert.equal(results.filter((result) => result.errors.length === 0).length, 17);
  assert.equal(results.filter((result) => result.errors.length > 0).length, 3);
  const quarantined = results.map((result, index) => ({ result, sourceRecordId: String(records[index].customer_id) })).filter(({ result }) => result.errors.length > 0);
  assert.deepEqual(quarantined.map(({ sourceRecordId }) => sourceRecordId), ["10", "11", "12"]);
  assert.deepEqual(quarantined.map(({ result }) => result.errors[0].code), ["REQUIRED_FIELD_MISSING", "INVALID_EMAIL", "QUARANTINED_ENUM_VALUE"]);
});
