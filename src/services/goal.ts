import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import { calculateGoalPacing } from "../utils/goals";
import {
  getExchangeRates,
  convertCurrency,
  normalizeCurrencyForFx,
  type ExchangeRates,
} from "../utils/fx";
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
  statusFilter?: unknown,
  fetchFn?: typeof fetch
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

  const withProgress = [];
  for (const g of goalsList) {
    withProgress.push(await attachDerivedProgress(db, g, fetchFn));
  }
  return withProgress;
}

export interface GoalWalletBreakdownEntry {
  walletId: string;
  walletName: string;
  balance: number;
  currency: string;
  convertedAmount: number;
  usedPeg: boolean;
}

export interface GoalWithDerivedProgress {
  isDerived: boolean;
  linkedWallets: GoalWalletBreakdownEntry[];
}

async function attachDerivedProgress<
  T extends {
    goalId: string;
    goalCurrency: string;
    goalTargetAmount: number;
    goalCurrentAmount: number;
    goalTargetDate: string | null;
    goalStatus: string;
  }
>(
  db: DrizzleD1Database<typeof schema>,
  goal: T,
  fetchFn?: typeof fetch
) {
  const links = await db
    .select()
    .from(schema.goalWallets)
    .where(eq(schema.goalWallets.goalId, goal.goalId));

  if (links.length === 0) {
    const pacing = calculateGoalPacing(
      goal.goalTargetAmount,
      goal.goalCurrentAmount,
      goal.goalTargetDate,
      goal.goalStatus
    );
    return { ...goal, pacing, isDerived: false, linkedWallets: [] };
  }

  const walletIds = links.map((l) => l.walletId);
  const linkedWalletsData = await db
    .select()
    .from(schema.wallets)
    .where(inArray(schema.wallets.walletId, walletIds));

  const fxRates = await getExchangeRates(fetchFn);
  const goalCurrency = (goal.goalCurrency || "IDR").toUpperCase();
  const breakdown: GoalWalletBreakdownEntry[] = [];
  let derivedTotal = 0;

  for (const w of linkedWalletsData) {
    const walletCurrency = (w.walletCurrency || "IDR").toUpperCase();
    const converted = convertCurrency(
      w.walletBalance,
      walletCurrency,
      goalCurrency,
      fxRates.rates
    );
    const { usedPeg: fromPeg } = normalizeCurrencyForFx(walletCurrency);
    const { usedPeg: toPeg } = normalizeCurrencyForFx(goalCurrency);
    breakdown.push({
      walletId: w.walletId,
      walletName: w.walletName,
      balance: w.walletBalance,
      currency: walletCurrency,
      convertedAmount: converted,
      usedPeg: fromPeg || toPeg,
    });
    derivedTotal = Number((derivedTotal + converted).toFixed(2));
  }

  const pacing = calculateGoalPacing(
    goal.goalTargetAmount,
    derivedTotal,
    goal.goalTargetDate,
    goal.goalStatus
  );
  return {
    ...goal,
    goalCurrentAmount: derivedTotal,
    pacing,
    isDerived: true,
    linkedWallets: breakdown,
  };
}

export interface CreateGoalParams {
  name: unknown;
  targetAmount: unknown;
  currentAmount?: unknown;
  currency?: unknown;
  targetDate?: unknown;
  walletId?: unknown;
  walletIds?: unknown;
  categoryId?: unknown;
  status?: unknown;
  notes?: unknown;
  fetchFn?: typeof fetch;
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
    walletIds,
    categoryId,
    status: goalStatusInput,
    notes,
    fetchFn,
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

  const createdGoalId = newGoal[0].goalId;
  const walletIdsToLink: string[] = [];
  if (cleanWalletId) walletIdsToLink.push(cleanWalletId);
  if (Array.isArray(walletIds)) {
    for (const candidate of walletIds) {
      if (typeof candidate !== "string" || candidate.trim().length === 0) {
        validationError(
          "Validation Error: each 'walletIds' entry must be a valid UUID string",
          "walletIds"
        );
      }
      if (!isValidUUID(candidate)) {
        validationError(
          "Validation Error: each 'walletIds' entry must be a valid UUID string",
          "walletIds"
        );
      }
      const trimmed = candidate.trim();
      if (!walletIdsToLink.includes(trimmed)) walletIdsToLink.push(trimmed);
    }
  } else if (walletIds !== undefined) {
    validationError(
      "Validation Error: 'walletIds' must be an array of wallet UUID strings",
      "walletIds"
    );
  }

  for (const linkWalletId of walletIdsToLink) {
    if (linkWalletId === cleanWalletId) continue;
    const w = await db
      .select({ walletId: schema.wallets.walletId })
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, linkWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!w) notFound("Wallet", linkWalletId);
    await db
      .insert(schema.goalWallets)
      .values({ goalId: createdGoalId, walletId: linkWalletId })
      .onConflictDoNothing()
      .run();
  }
  if (cleanWalletId) {
    await db
      .insert(schema.goalWallets)
      .values({ goalId: createdGoalId, walletId: cleanWalletId })
      .onConflictDoNothing()
      .run();
  }

  return attachDerivedProgress(db, newGoal[0], fetchFn);
}

async function requireOwnedGoal(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown
) {
  if (!isValidUUID(goalId)) {
    validationError(
      "Validation Error: Valid string 'goalId' (UUID) is required",
      "goalId"
    );
  }
  const cleanGoalId = (goalId as string).trim();
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
  return existingGoal;
}

export interface ContributeGoalParams {
  amount?: unknown;
  adjustWalletBalance?: unknown;
  walletId?: unknown;
}

export async function contributeGoal(
  _db: DrizzleD1Database<typeof schema>,
  _userId: string,
  _goalId: unknown,
  _params: ContributeGoalParams
): Promise<never> {
  validationError(
    "Validation Error: 'contribute' action is deprecated and removed. Link wallets to the goal via 'link_wallet' and record top-ups with 'record_transaction' or 'transfer_funds'; progress updates automatically on the next read.",
    "action"
  );
}

export async function linkGoalWallet(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown,
  walletId: unknown,
  fetchFn?: typeof fetch
) {
  const existingGoal = await requireOwnedGoal(db, userId, goalId);
  if (!isValidUUID(walletId)) {
    validationError(
      "Validation Error: Valid string 'walletId' (UUID) is required for link_wallet",
      "walletId"
    );
  }
  const cleanWalletId = (walletId as string).trim();
  const wallet = await db
    .select({ walletId: schema.wallets.walletId })
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!wallet) notFound("Wallet", cleanWalletId);
  await db
    .insert(schema.goalWallets)
    .values({ goalId: existingGoal.goalId, walletId: cleanWalletId })
    .onConflictDoNothing()
    .run();
  const refreshed = await db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.goalId, existingGoal.goalId))
    .get();
  if (!refreshed) notFound("Goal", existingGoal.goalId);
  return attachDerivedProgress(db, refreshed, fetchFn);
}

export async function unlinkGoalWallet(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  goalId: unknown,
  walletId: unknown,
  fetchFn?: typeof fetch
) {
  const existingGoal = await requireOwnedGoal(db, userId, goalId);
  if (!isValidUUID(walletId)) {
    validationError(
      "Validation Error: Valid string 'walletId' (UUID) is required for unlink_wallet",
      "walletId"
    );
  }
  const cleanWalletId = (walletId as string).trim();
  await db
    .delete(schema.goalWallets)
    .where(
      and(
        eq(schema.goalWallets.goalId, existingGoal.goalId),
        eq(schema.goalWallets.walletId, cleanWalletId)
      )
    )
    .run();
  const refreshed = await db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.goalId, existingGoal.goalId))
    .get();
  if (!refreshed) notFound("Goal", existingGoal.goalId);
  return attachDerivedProgress(db, refreshed, fetchFn);
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
  params: UpdateGoalParams & { fetchFn?: typeof fetch }
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
    return attachDerivedProgress(db, existingGoal, params.fetchFn);
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

  return attachDerivedProgress(db, updated[0], params.fetchFn);
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
