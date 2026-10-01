import type { Database } from "../db";
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
  db: Database,
  userId: string
) {
  return db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.budgetUserId, userId));
}

export async function createBudget(
  db: Database,
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
    const [category] = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.categoryId, targetCatId),
          eq(schema.categories.categoryUserId, userId)
        )
      )
      .limit(1);
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
  db: Database,
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
export async function getBudgetById(
  db: Database,
  userId: string,
  budgetId: unknown
) {
  if (!isValidUUID(budgetId)) {
    validationError("Validation Error: Valid string 'budgetId' (UUID) is required", "budgetId");
  }
  const cleanId = (budgetId as string).trim();
  const [budget] = await db
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.budgetId, cleanId),
        eq(schema.budgets.budgetUserId, userId)
      )
    )
    .limit(1);

  if (!budget) {
    notFound("Budget", cleanId);
  }

  const conditions = [
    eq(schema.transactions.transactionUserId, userId),
    eq(schema.transactions.transactionIsPlanned, 0),
    eq(schema.transactions.transactionType, "expense"),
    gte(schema.transactions.transactionDate, budget.budgetPeriodStart),
    lte(schema.transactions.transactionDate, budget.budgetPeriodEnd),
  ];
  if (budget.budgetCategoryId) {
    conditions.push(eq(schema.transactions.transactionCategoryId, budget.budgetCategoryId));
  } else {
    conditions.push(eq(schema.transactions.transactionBudgetId, budget.budgetId));
  }

  const txs = await db.select().from(schema.transactions).where(and(...conditions));
  const spent = txs.reduce((sum, tx) => sum + tx.transactionAmount, 0);

  return {
    budget,
    spent: Number(spent.toFixed(2)),
    remaining: Number((budget.budgetAmount - spent).toFixed(2)),
    percentUsed:
      budget.budgetAmount > 0
        ? Number(((spent / budget.budgetAmount) * 100).toFixed(2))
        : 0,
  };
}
export interface UpdateBudgetParams {
  name?: unknown;
  amount?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  categoryId?: unknown;
}

export async function updateBudget(
  db: Database,
  userId: string,
  budgetId: unknown,
  params: UpdateBudgetParams
) {
  if (!isValidUUID(budgetId)) {
    validationError("Validation Error: Valid string 'budgetId' (UUID) is required", "budgetId");
  }
  const cleanId = (budgetId as string).trim();
  const [existing] = await db
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.budgetId, cleanId),
        eq(schema.budgets.budgetUserId, userId)
      )
    )
    .limit(1);

  if (!existing) {
    notFound("Budget", cleanId);
  }

  const { name: budgetName, amount, periodStart, periodEnd, categoryId } = params;
  const updates: Partial<typeof schema.budgets.$inferInsert> = {};

  if (budgetName !== undefined) {
    if (
      typeof budgetName !== "string" ||
      budgetName.trim().length === 0 ||
      budgetName.trim().length > 100
    ) {
      validationError("Validation Error: Budget 'name' must be 1-100 characters", "name");
    }
    updates.budgetName = budgetName.trim();
  }

  if (amount !== undefined) {
    if (!isValidPositiveNumber(amount)) {
      validationError("Validation Error: Budget 'amount' must be a positive number greater than 0", "amount");
    }
    updates.budgetAmount = amount;
  }

  if (periodStart !== undefined) {
    if (typeof periodStart !== "string" || !isValidIsoDateOrTimestamp(periodStart)) {
      validationError("Validation Error: 'periodStart' must be a valid ISO date or timestamp", "periodStart");
    }
    updates.budgetPeriodStart = normalizeToIsoTimestamp(periodStart);
  }

  if (periodEnd !== undefined) {
    if (typeof periodEnd !== "string" || !isValidIsoDateOrTimestamp(periodEnd)) {
      validationError("Validation Error: 'periodEnd' must be a valid ISO date or timestamp", "periodEnd");
    }
    const cleanEnd = /^\d{4}-\d{2}-\d{2}$/.test(periodEnd.trim())
      ? `${periodEnd.trim()}T23:59:59.999Z`
      : normalizeToIsoTimestamp(periodEnd);
    updates.budgetPeriodEnd = cleanEnd;
  }

  if (categoryId !== undefined) {
    if (categoryId === null || categoryId === "") {
      updates.budgetCategoryId = null;
    } else {
      if (!isValidUUID(categoryId)) {
        validationError("Validation Error: 'categoryId' must be a valid UUID", "categoryId");
      }
      const cleanCatId = (categoryId as string).trim();
      const [cat] = await db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.categoryId, cleanCatId),
            eq(schema.categories.categoryUserId, userId)
          )
        )
        .limit(1);
      if (!cat) notFound("Category", cleanCatId);
      updates.budgetCategoryId = cleanCatId;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.budgets)
      .set(updates)
      .where(
        and(
          eq(schema.budgets.budgetId, cleanId),
          eq(schema.budgets.budgetUserId, userId)
        )
      );
  }

  return getBudgetById(db, userId, cleanId);
}
export async function deleteBudget(
  db: Database,
  userId: string,
  budgetId: unknown
) {
  await getBudgetById(db, userId, budgetId);
  const cleanId = (budgetId as string).trim();

  await db
    .delete(schema.budgets)
    .where(
      and(
        eq(schema.budgets.budgetId, cleanId),
        eq(schema.budgets.budgetUserId, userId)
      )
    );

  return {
    success: true,
    message: `Budget (${cleanId}) successfully deleted.`,
    deletedBudgetId: cleanId,
  };
}
