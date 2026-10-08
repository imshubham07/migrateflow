import { migrationPlanSchema, type MigrationPlanOutput } from "./schemas.js";
import { MIGRATION_PLANNER_SYSTEM_PROMPT } from "./prompts.js";

export async function generateMigrationPlan(input: unknown): Promise<MigrationPlanOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: MIGRATION_PLANNER_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        responseSchema: {
          type: "OBJECT",
          required: ["summary", "fieldMappings", "transformations", "risks", "questions", "validation"],
          properties: {
            summary: { type: "STRING" },
            fieldMappings: { type: "ARRAY", items: { type: "OBJECT", required: ["sourceField", "targetField", "strategy", "reason"], properties: {
              sourceField: { type: "STRING" }, targetField: { type: "STRING" }, strategy: { type: "STRING", enum: ["DIRECT", "LOWERCASE", "UPPERCASE", "TRIM", "STRING_TO_INTEGER", "INTEGER_TO_STRING", "DATE_NORMALIZE", "BOOLEAN_NORMALIZE", "ENUM_MAPPING"] }, reason: { type: "STRING" },
            } } },
            transformations: { type: "ARRAY", items: { type: "OBJECT", required: ["sourceField", "targetField", "type", "config", "reason"], properties: {
              sourceField: { type: "STRING" }, targetField: { type: "STRING" }, type: { type: "STRING", enum: ["DIRECT", "LOWERCASE", "UPPERCASE", "TRIM", "STRING_TO_INTEGER", "INTEGER_TO_STRING", "DATE_NORMALIZE", "BOOLEAN_NORMALIZE", "ENUM_MAPPING"] }, config: { type: "OBJECT" }, reason: { type: "STRING" },
            } } },
            risks: { type: "ARRAY", items: { type: "OBJECT", required: ["severity", "field", "message"], properties: { severity: { type: "STRING", enum: ["LOW", "MEDIUM", "HIGH"] }, field: { type: "STRING" }, message: { type: "STRING" } } } },
            questions: { type: "ARRAY", items: { type: "OBJECT", required: ["question", "reason", "blocking"], properties: { question: { type: "STRING" }, reason: { type: "STRING" }, blocking: { type: "BOOLEAN" } } } },
            validation: { type: "OBJECT", required: ["isValid", "errors", "warnings"], properties: { isValid: { type: "BOOLEAN" }, errors: { type: "ARRAY", items: { type: "STRING" } }, warnings: { type: "ARRAY", items: { type: "STRING" } } } },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed with status ${response.status}: ${details}`);
  }
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no plan");
  return migrationPlanSchema.parse(JSON.parse(text));
}
