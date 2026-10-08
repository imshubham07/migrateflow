import test from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_RECORDS, parseCsv, parseRecords, parseSchema } from "../apps/backend/src/services/upload-validation.ts";

const schema = parseSchema({ dataset: "source", fields: [{ name: "id", type: "integer" }, { name: "name", type: "string" }] }, "Source schema");

test("accepts valid JSON records", () => {
  const records = parseRecords([{ id: 1, name: "A" }], schema);
  assert.equal(records.length, 1);
});

test("accepts valid CSV records", () => {
  const records = parseRecords(parseCsv("id,name\n1,A\n2,\"B, Jr\"\n"), schema);
  assert.deepEqual(records, [{ id: "1", name: "A" }, { id: "2", name: "B, Jr" }]);
});

test("rejects malformed schemas and records", () => {
  assert.throws(() => parseSchema({ fields: [{ name: "id" }, { name: "id" }] }, "Source schema"), /duplicate field/);
  assert.throws(() => parseRecords(["not an object"], schema), /must be a JSON object/);
  assert.throws(() => parseRecords([{ id: 1, unknown: "x" }], schema), /unknown field/);
});

test("enforces the bounded record limit", () => {
  assert.throws(() => parseRecords(Array.from({ length: MAX_UPLOAD_RECORDS + 1 }, (_, id) => ({ id, name: "x" })), schema), /1000 records/);
});
