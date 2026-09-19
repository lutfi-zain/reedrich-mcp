import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import { calculateGoalPacing } from "../utils/goals";
import {
  validationError,
  notFound,
  isValidPositiveNumber,
  isValidFiniteNumber,
  isValidUUID,
} from "./errors";

export async function listGoals(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  statusFilter?: unknown
) {
  const conditions = [eq(schema.goals.goalUserId, userId)];
  if (
    typeof statusFilter === "string" &&
    ["in_progress", "completed", "cancelled"].includes(statusFilter)
  ) {
    conditions.push(eq(schema.goals.goalStatus, statusFilter));
  }

  const goalsList = await db
    .select()
    .from(schema.goals)
    .where(and(...conditions))
    .orderBy(desc(schema.goals.goalCreatedAt));

  return goalsList.map((g) => {
    const pacing = calculateGoalPacing(
      g.goalTargetAmount,
      g.goalCurrentAmount,
      g.goalTargetDate,
      g.goalStatus
    );
    return { ...g, pacing };
  });
}

export interface CreateGoalParams {
  name: unknown;
  targetAmount: unknown;
  currentAmount?: unknown;
  currency?: unknown;
  targetDate?: unknown;
  walletId?: unknown;
  categoryId?: unknown;
  status?: unknown;
  notes?: unknown;
}

export async function createGoal(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: CreateGoalParams
) {
  const {
    name: goalNameInput,
    targetAmount,
    currentAmount,
    currency,
    targetDate,
    walletId,
    categoryId,
    status: goalStatusInput,
    notes,
  } = params;

  if (
    !goalNameInput ||
    typeof goalNameInput !== "string" ||
    goalNameInput.trim().length === 0 ||
    goalNameInput.trim().length > 100
  ) {
    validationError(
      "Validation Error: 'name' is required (1-100 characters)",
      "name"
    );
  }
  if (!isValidPositiveNumber(targetAmount)) {
    validationError(
      "Validation Error: 'targetAmount' must be a positive finite number greater than 0",
      "targetAmount"
    );
  }

  const initialCurrent =
    currentAmount !== undefined
      ? isValidFiniteNumber(currentAmount) && currentAmount >= 0
        ? currentAmount
        : null
      : 0.0;
  if (initialCurrent === null) {
    validationError(
      "Validation Error: 'currentAmount' must be a non-negative finite number",
      "currentAmount"
    );
  }

  let cleanWalletId: string | null = null;
  if (walletId) {
    if (!isValidUUID(walletId)) {
      validationError(
        "Validation Error: 'walletId' must be a valid UUID string",
        "walletId"
      );
    }
    const w = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, walletId.trim()),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!w) notFound("Wallet", walletId.trim());
    cleanWalletId = walletId.trim();
  }

  let cleanCategoryId: string | null = null;
  if (categoryId) {
    if (!isValidUUID(categoryId)) {
      validationError(
        "Validation Error: 'categoryId' must be a valid UUID string",
        "categoryId"
      );
    }
    const cat = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.categoryId, categoryId.trim()),
          eq(schema.categories.categoryUserId, userId)
        )
      )
      .get();
    if (!cat) notFound("Category", categoryId.trim());
    cleanCategoryId = categoryId.trim();
  }

  if (
    targetDate &&
    (typeof targetDate !== "string" || !isValidIsoDateOrTimestamp(targetDate))
  ) {
    validationError(
      "Validation Error: 'targetDate' must be in valid ISO format (e.g. YYYY-MM-DD)",
      "targetDate"
    );
  }
  if (notes && (typeof notes !== "string" || notes.length > 500)) {
    validationError(
      "Validation Error: 'notes' cannot exceed 500 characters",
      "notes"
    );
  }

  const cleanCurrency =
    currency && typeof currency === "string" && currency.trim().length > 0
      ? currency.trim().toUpperCase()
      : "IDR";
  const isAutoCompleted = initialCurrent >= targetAmount;
  const finalStatus = isAutoCompleted
    ? "completed"
    : goalStatusInput === "completed" || goalStatusInput === "cancelled"
    ? goalStatusInput
    : "in_progress";

  const newGoal = await db
    .insert(schema.goals)
    .values({
      goalUserId: userId,
      goalName: goalNameInput.trim(),
      goalTargetAmount: targetAmount,
      goalCurrentAmount: initialCurrent,
      goalCurrency: cleanCurrency,
      goalTargetDate:
        typeof targetDate === "string" ? targetDate.trim().split("T")[0] : null,
      goalWalletId: cleanWalletId,
      goalCategoryId: cleanCategoryId,
      goalStatus: finalStatus,
      goalNotes: typeof notes === "string" ? notes.trim() : null,
    })
    .returning();

  const pacing = calculateGoalPacing(
    newGoal[0].goalTargetAmount,
    newGoal[0].goalCurrentAmount,
    newGoal[0].goalTargetDate,
    newGoal[0].goalStatus
  );

  return { ...newGoal[0], pacing };
}

export interface ContributeGoalParams {
  amount: unknown;
  adjustWalletBalance?: unknown;
  walletId?: unknown;
}

export async function contributeGoal(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown,
  params: ContributeGoalParams
) {
  if (!isValidUUID(goalId)) {
    validationError(
      "Validation Error: Valid string 'goalId' (UUID) is required for contribute",
      "goalId"
    );
  }
  const { amount, adjustWalletBalance, walletId } = params;
  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: Contribution 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }

  const cleanGoalId = goalId.trim();
  const existingGoal = await db
    .select()
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.goalId, cleanGoalId),
        eq(schema.goals.goalUserId, userId)
      )
    )
    .get();

  if (!existingGoal) {
    notFound("Goal", cleanGoalId);
  }

  const newCurrent = Number(
    (existingGoal.goalCurrentAmount + amount).toFixed(2)
  );
  const newStatus =
    newCurrent >= existingGoal.goalTargetAmount
      ? "completed"
      : existingGoal.goalStatus;

  const updated = await db
    .update(schema.goals)
    .set({
      goalCurrentAmount: newCurrent,
      goalStatus: newStatus,
    })
    .where(
      and(
        eq(schema.goals.goalId, cleanGoalId),
        eq(schema.goals.goalUserId, userId)
      )
    )
    .returning();

  const shouldAdjust = adjustWalletBalance === true;
  const targetWalletId =
    typeof walletId === "string" && walletId.trim().length > 0
      ? walletId.trim()
      : existingGoal.goalWalletId;

  if (shouldAdjust && targetWalletId) {
    const w = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, targetWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (w) {
      await db
        .update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance - ${amount}` })
        .where(
          and(
            eq(schema.wallets.walletId, targetWalletId),
            eq(schema.wallets.walletUserId, userId)
          )
        );

      await db.insert(schema.transactions).values({
        transactionUserId: userId,
        transactionWalletId: targetWalletId,
        transactionCategoryId: existingGoal.goalCategoryId,
        transactionAmount: amount,
        transactionAdminFee: 0.0,
        transactionType: "expense",
        transactionDescription: `Goal contribution: ${existingGoal.goalName}`,
        transactionIsPlanned: 0,
        transactionDate: currentIsoTimestamp(),
      });
    }
  }

  const pacing = calculateGoalPacing(
    updated[0].goalTargetAmount,
    updated[0].goalCurrentAmount,
    updated[0].goalTargetDate,
    updated[0].goalStatus
  );

  return { ...updated[0], pacing };
}

export interface UpdateGoalParams {
  name?: unknown;
  targetAmount?: unknown;
  currentAmount?: unknown;
  currency?: unknown;
  targetDate?: unknown;
  walletId?: unknown;
  categoryId?: unknown;
  status?: unknown;
  notes?: unknown;
}

export async function updateGoal(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown,
  params: UpdateGoalParams
) {
  if (!isValidUUID(goalId)) {
    validationError(
      "Validation Error: Valid string 'goalId' (UUID) is required for update",
      "goalId"
    );
  }
  const cleanGoalId = goalId.trim();
  const existingGoal = await db
    .select()
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.goalId, cleanGoalId),
        eq(schema.goals.goalUserId, userId)
      )
    )
    .get();

  if (!existingGoal) {
    notFound("Goal", cleanGoalId);
  }

  const {
    name: goalNameInput,
    targetAmount,
    currentAmount,
    currency,
    targetDate,
    walletId,
    categoryId,
    status: goalStatusInput,
    notes,
  } = params;

  const updateData: Partial<typeof schema.goals.$inferInsert> = {};

  if (goalNameInput !== undefined) {
    if (
      typeof goalNameInput !== "string" ||
      goalNameInput.trim().length === 0 ||
      goalNameInput.trim().length > 100
    ) {
      validationError("Validation Error: 'name' must be 1-100 characters", "name");
    }
    updateData.goalName = goalNameInput.trim();
  }
  if (targetAmount !== undefined) {
    if (!isValidPositiveNumber(targetAmount)) {
      validationError(
        "Validation Error: 'targetAmount' must be a positive finite number greater than 0",
        "targetAmount"
      );
    }
    updateData.goalTargetAmount = targetAmount;
  }
  if (currentAmount !== undefined) {
    if (!isValidFiniteNumber(currentAmount) || currentAmount < 0) {
      validationError(
        "Validation Error: 'currentAmount' must be a non-negative finite number",
        "currentAmount"
      );
    }
    updateData.goalCurrentAmount = currentAmount;
  }
  if (currency !== undefined) {
    if (typeof currency !== "string" || currency.trim().length === 0) {
      validationError(
        "Validation Error: 'currency' must be a valid currency string",
        "currency"
      );
    }
    updateData.goalCurrency = currency.trim().toUpperCase();
  }
  if (targetDate !== undefined) {
    if (
      targetDate &&
      (typeof targetDate !== "string" || !isValidIsoDateOrTimestamp(targetDate))
    ) {
      validationError(
        "Validation Error: 'targetDate' must be in valid ISO format",
        "targetDate"
      );
    }
    updateData.goalTargetDate =
      typeof targetDate === "string" && targetDate.trim().length > 0
        ? targetDate.trim().split("T")[0]
        : null;
  }
  if (walletId !== undefined) {
    if (walletId) {
      if (!isValidUUID(walletId)) {
        validationError(
          "Validation Error: 'walletId' must be a valid UUID string",
          "walletId"
        );
      }
      const w = await db
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.walletId, walletId.trim()),
            eq(schema.wallets.walletUserId, userId)
          )
        )
        .get();
      if (!w) notFound("Wallet", walletId.trim());
      updateData.goalWalletId = walletId.trim();
    } else {
      updateData.goalWalletId = null;
    }
  }
  if (categoryId !== undefined) {
    if (categoryId) {
      if (!isValidUUID(categoryId)) {
        validationError(
          "Validation Error: 'categoryId' must be a valid UUID string",
          "categoryId"
        );
      }
      const cat = await db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.categoryId, categoryId.trim()),
            eq(schema.categories.categoryUserId, userId)
          )
        )
        .get();
      if (!cat) notFound("Category", categoryId.trim());
      updateData.goalCategoryId = categoryId.trim();
    } else {
      updateData.goalCategoryId = null;
    }
  }
  if (goalStatusInput !== undefined) {
    if (
      typeof goalStatusInput !== "string" ||
      !["in_progress", "completed", "cancelled"].includes(goalStatusInput)
    ) {
      validationError(
        "Validation Error: 'status' must be 'in_progress', 'completed', or 'cancelled'",
        "status"
      );
    }
    updateData.goalStatus = goalStatusInput;
  }
  if (notes !== undefined) {
    if (notes && (typeof notes !== "string" || notes.length > 500)) {
      validationError(
        "Validation Error: 'notes' cannot exceed 500 characters",
        "notes"
      );
    }
    updateData.goalNotes =
      typeof notes === "string" && notes.trim().length > 0
        ? notes.trim()
        : null;
  }

  if (Object.keys(updateData).length === 0) {
    const pacing = calculateGoalPacing(
      existingGoal.goalTargetAmount,
      existingGoal.goalCurrentAmount,
      existingGoal.goalTargetDate,
      existingGoal.goalStatus
    );
    return { ...existingGoal, pacing };
  }

  const updated = await db
    .update(schema.goals)
    .set(updateData)
    .where(
      and(
        eq(schema.goals.goalId, cleanGoalId),
        eq(schema.goals.goalUserId, userId)
      )
    )
    .returning();

  const pacing = calculateGoalPacing(
    updated[0].goalTargetAmount,
    updated[0].goalCurrentAmount,
    updated[0].goalTargetDate,
    updated[0].goalStatus
  );

  return { ...updated[0], pacing };
}

export async function deleteGoal(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown
) {
  if (!isValidUUID(goalId)) {
    validationError(
      "Validation Error: Valid string 'goalId' (UUID) is required for delete",
      "goalId"
    );
  }
  const cleanGoalId = goalId.trim();
  const deleted = await db
    .delete(schema.goals)
    .where(
      and(
        eq(schema.goals.goalId, cleanGoalId),
        eq(schema.goals.goalUserId, userId)
      )
    )
    .returning();

  if (deleted.length === 0) {
    notFound("Goal", cleanGoalId);
  }

  return deleted[0];
}
