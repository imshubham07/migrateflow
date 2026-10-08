import { Prisma, PrismaClient, SchemaType } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES, parseCsv, parseRecords, parseSchema } from "../services/upload-validation.js";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 3 } });
export const migrationsRouter = Router();

migrationsRouter.post("/migrations", upload.fields([{ name: "sourceSchema", maxCount: 1 }, { name: "targetSchema", maxCount: 1 }, { name: "sourceRecords", maxCount: 1 }]), async (request, response, next) => {
  try {
    const files = request.files as { [field: string]: Express.Multer.File[] } | undefined;
    const sourceSchemaFile = files?.sourceSchema?.[0]; const targetSchemaFile = files?.targetSchema?.[0]; const recordsFile = files?.sourceRecords?.[0];
    if (!sourceSchemaFile || !targetSchemaFile || !recordsFile) { response.status(400).json({ error: { code: "UPLOAD_FILES_REQUIRED", message: "sourceSchema, targetSchema, and sourceRecords files are required." } }); return; }
    const sourceSchema = parseSchema(JSON.parse(sourceSchemaFile.buffer.toString("utf8")), "Source schema");
    const targetSchema = parseSchema(JSON.parse(targetSchemaFile.buffer.toString("utf8")), "Target schema");
    const recordsValue = recordsFile.originalname.toLowerCase().endsWith(".csv") ? parseCsv(recordsFile.buffer.toString("utf8")) : JSON.parse(recordsFile.buffer.toString("utf8"));
    const records = parseRecords(recordsValue, sourceSchema);
    const name = typeof request.body?.name === "string" && request.body.name.trim() ? request.body.name.trim() : `${sourceSchema.dataset ?? "Uploaded source"} → ${targetSchema.dataset ?? "Uploaded target"}`;
    const migration = await prisma.$transaction(async (transaction) => {
      const created = await transaction.migration.create({ data: { name, sourceName: sourceSchema.dataset ?? "uploaded_source", targetName: targetSchema.dataset ?? "uploaded_target", sampleLimit: records.length, sourceRecords: records, sourceFormat: recordsFile.originalname.toLowerCase().endsWith(".csv") ? "CSV" : "JSON" } });
      await transaction.migrationSchema.createMany({ data: [{ migrationId: created.id, type: SchemaType.SOURCE, version: 1, definition: sourceSchema as Prisma.InputJsonValue }, { migrationId: created.id, type: SchemaType.TARGET, version: 1, definition: targetSchema as Prisma.InputJsonValue }] });
      return created;
    });
    response.status(201).json({ migration, sourceRecordCount: records.length, sourceFields: sourceSchema.fields.map((field) => field.name), targetFields: targetSchema.fields.map((field) => field.name) });
  } catch (error) { if (error instanceof SyntaxError) response.status(400).json({ error: { code: "UPLOAD_INVALID_JSON", message: "Uploaded JSON is malformed." } }); else if (error instanceof multer.MulterError) response.status(413).json({ error: { code: "UPLOAD_LIMIT_EXCEEDED", message: "Each upload must be within the file-size and file-count limits." } }); else if (error instanceof Error) response.status(400).json({ error: { code: "UPLOAD_INVALID_DATA", message: error.message } }); else next(error); }
});
