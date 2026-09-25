import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  listRecurringTemplates,
  createRecurringTemplate,
  applyRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
} from "../services/recurring";
import type { AppEnv } from "../index";

const recurringTemplates = new Hono<AppEnv>();

recurringTemplates.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const isActiveQuery = c.req.query("isActive");
  const isActive =
    isActiveQuery !== undefined
      ? isActiveQuery === "true" || isActiveQuery === "1"
      : undefined;

  const result = await listRecurringTemplates(db, userId!, isActive);
  return c.json(result, 200);
});

recurringTemplates.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;

  const result = await createRecurringTemplate(db, userId!, body as any);
  return c.json(result, 201);
});

recurringTemplates.post("/:templateId/apply", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const templateId = c.req.param("templateId");

  let executionDate: string | undefined = undefined;
  let transactionId: string | undefined = undefined;
  let actualAmount: number | undefined = undefined;
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    if (typeof body?.executionDate === "string") {
      executionDate = body.executionDate;
    }
    if (typeof body?.transactionId === "string") {
      transactionId = body.transactionId;
    }
    if (typeof body?.actualAmount === "number") {
      actualAmount = body.actualAmount;
    }
  } catch {
    // Body optional for apply
  }

  const result = await applyRecurringTemplate(
    db,
    userId!,
    templateId,
    executionDate,
    { transactionId, actualAmount }
  );
  return c.json(result, 200);
});

recurringTemplates.patch("/:templateId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const templateId = c.req.param("templateId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateRecurringTemplate(db, userId!, templateId, body as any);
  return c.json(result, 200);
});

recurringTemplates.delete("/:templateId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const templateId = c.req.param("templateId");
  const result = await deleteRecurringTemplate(db, userId!, templateId);
  return c.json(result, 200);
});

export default recurringTemplates;
