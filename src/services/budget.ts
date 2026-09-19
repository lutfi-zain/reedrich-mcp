import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  currentIsoTimestamp,
  normalizeToIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import {
  validationError,
  notFound,
  isValidPositiveNumber,
  isValidUUID,
} from "./errors";

export interface CreateBudgetParams {
  name: unknown;
  categoryId?: unknown;
  amount: unknown;
  periodStart: unknown;
  periodEnd: unknown;
}

export async function listBudgets(
  db: DrizzleD1Database<typeof schema>,
  userId: string
) {
  return db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.budgetUserId, userId));
}

export async function createBudget(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: CreateBudgetParams
) {
  const { name: budgetName, categoryId, amount, periodStart, periodEnd } = params;

  if (
    !budgetName ||
    typeof budgetName !== "string" ||
    budgetName.trim().length === 0 ||
    budgetName.trim().length > 100
  ) {
    validationError(
      "Validation Error: Budget 'name' is required (1-100 characters)",
      "name"
    );
  }
  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: Budget 'amount' must be a positive finite number",
      "amount"
    );
  }
  if (
    typeof periodStart !== "string" ||
    !isValidIsoDateOrTimestamp(periodStart) ||
    typeof periodEnd !== "string" ||
    !isValidIsoDateOrTimestamp(periodEnd)
  ) {
    validationError(
      "Validation Error: 'periodStart' and 'periodEnd' must be valid ISO dates or timestamps (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)"
    );
  }
  const cleanStart = normalizeToIsoTimestamp(periodStart);
  const cleanEnd = normalizeToIsoTimestamp(periodEnd);
  if (cleanStart > cleanEnd) {
    validationError(
      "Validation Error: 'periodStart' cannot be after 'periodEnd'"
    );
  }

  let cleanCategoryId: string | null = null;
  if (categoryId) {
    if (!isValidUUID(categoryId)) {
      throw validationError(
        "Validation Error: 'categoryId' must be a valid string (UUID)",
        "categoryId"
      );
    }
    const targetCatId = categoryId.trim();
    const category = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.categoryId, targetCatId),
          eq(schema.categories.categoryUserId, userId)
        )
      )
      .get();
    if (!category) {
      throw notFound("Category", targetCatId);
    }
    cleanCategoryId = targetCatId;
  }

  const newBudgetId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();
  const result = await db
    .insert(schema.budgets)
    .values({
      budgetId: newBudgetId,
      budgetUserId: userId,
      budgetName: budgetName.trim(),
      budgetCategoryId: cleanCategoryId,
      budgetAmount: amount,
      budgetPeriodStart: cleanStart,
      budgetPeriodEnd: cleanEnd,
      budgetCreatedAt: nowIso,
    })
    .returning();

  return result[0];
}

export async function budgetStatus(
  db: DrizzleD1Database<typeof schema>,
  userId: string
) {
  const budgets = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.budgetUserId, userId));

  const statusList = [];
  for (const b of budgets) {
    const conditions = [
      eq(schema.transactions.transactionUserId, userId),
      eq(schema.transactions.transactionIsPlanned, 0),
      eq(schema.transactions.transactionType, "expense"),
      gte(schema.transactions.transactionDate, b.budgetPeriodStart),
      lte(schema.transactions.transactionDate, b.budgetPeriodEnd),
    ];
    if (b.budgetCategoryId) {
      conditions.push(
        eq(schema.transactions.transactionCategoryId, b.budgetCategoryId)
      );
    } else {
      conditions.push(
        eq(schema.transactions.transactionBudgetId, b.budgetId)
      );
    }

    const txs = await db
      .select()
      .from(schema.transactions)
      .where(and(...conditions));
    const spent = txs.reduce((sum, tx) => sum + tx.transactionAmount, 0);
    statusList.push({
      budget: b,
      spent: Number(spent.toFixed(2)),
      remaining: Number((b.budgetAmount - spent).toFixed(2)),
      percentUsed:
        b.budgetAmount > 0
          ? Number(((spent / b.budgetAmount) * 100).toFixed(2))
          : 0,
    });
  }

  return statusList;
}
