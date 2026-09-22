import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql, gt } from "drizzle-orm";
import {
  normalizeToIsoTimestamp,
  isValidIsoDateOrTimestamp,
  currentIsoTimestamp,
} from "../utils/date";
import { calculateNextRunDate } from "../utils/recurring";
import { applyBalanceDelta } from "./transaction";
import {
  validationError,
  notFound,
  isValidPositiveNumber,
  isValidFiniteNumber,
  isValidUUID,
} from "./errors";

export async function listRecurringTemplates(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  isActive?: unknown
) {
  const conditions = [eq(schema.recurringTemplates.templateUserId, userId)];
  if (isActive !== undefined) {
    conditions.push(
      eq(schema.recurringTemplates.templateIsActive, isActive ? 1 : 0)
    );
  }

  return db
    .select()
    .from(schema.recurringTemplates)
    .where(and(...conditions))
    .orderBy(desc(schema.recurringTemplates.templateCreatedAt));
}
export const MAX_MATERIALIZED_OCCURRENCES = 100;
// D1 caps bound parameters at 100 per statement; 16 params/row → max 6 rows.
// Chunk at 5 for headroom.
export const MATERIALIZE_CHUNK_SIZE = 5;

export interface MaterializedOccurrence {
  occurrenceDate: string;
  transactionDate: string;
}

export function planOccurrenceDates(
  nextRunDate: string,
  frequency: "daily" | "weekly" | "monthly" | "yearly",
  interval: number,
  endDate: string | null,
  maxRows: number = MAX_MATERIALIZED_OCCURRENCES
) {
  const dates: MaterializedOccurrence[] = [];
  let cursor = nextRunDate;
  let guard = 0;
  while (dates.length < maxRows && guard < maxRows + 1) {
    guard += 1;
    if (endDate && cursor > endDate) break;
    dates.push({ occurrenceDate: cursor, transactionDate: `${cursor}T12:00:00.000Z` });
    const next = calculateNextRunDate(cursor, frequency, interval);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

export interface CreateRecurringTemplateParams {
  name: unknown;
  walletId: unknown;
  targetWalletId?: unknown;
  categoryId?: unknown;
  amount: unknown;
  adminFee?: unknown;
  type?: unknown;
  frequency?: unknown;
  interval?: unknown;
  startDate: unknown;
  nextRunDate?: unknown;
  endDate?: unknown;
  isActive?: unknown;
  notes?: unknown;
}

export async function createRecurringTemplate(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: CreateRecurringTemplateParams
) {
  const {
    name: templateNameInput,
    walletId,
    targetWalletId,
    categoryId,
    amount,
    adminFee,
    type: templateTypeInput,
    frequency,
    interval,
    startDate,
    nextRunDate,
    endDate,
    isActive,
    notes,
  } = params;

  if (
    !templateNameInput ||
    typeof templateNameInput !== "string" ||
    templateNameInput.trim().length === 0 ||
    templateNameInput.trim().length > 100
  ) {
    validationError(
      "Validation Error: 'name' is required (1-100 characters)",
      "name"
    );
  }
  if (!isValidUUID(walletId)) {
    validationError(
      "Validation Error: 'walletId' is required and must be a valid UUID string",
      "walletId"
    );
  }

  const sourceWallet = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, walletId.trim()),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!sourceWallet) notFound("Wallet", walletId.trim());

  const cleanType =
    templateTypeInput === "income" || templateTypeInput === "transfer"
      ? templateTypeInput
      : "expense";

  let cleanTargetWalletId: string | null = null;
  if (cleanType === "transfer") {
    if (!isValidUUID(targetWalletId)) {
      validationError(
        "Validation Error: 'targetWalletId' is required for transfer recurring templates",
        "targetWalletId"
      );
    }
    if (targetWalletId.trim() === walletId.trim()) {
      validationError(
        "Validation Error: 'walletId' and 'targetWalletId' cannot be identical for transfers"
      );
    }
    const destWallet = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, targetWalletId.trim()),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!destWallet) notFound("Target Wallet", targetWalletId.trim());
    cleanTargetWalletId = targetWalletId.trim();
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

  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }

  const cleanAdminFee =
    adminFee !== undefined
      ? isValidFiniteNumber(adminFee) && adminFee >= 0
        ? adminFee
        : null
      : 0.0;
  if (cleanAdminFee === null) {
    validationError(
      "Validation Error: 'adminFee' must be a non-negative finite number",
      "adminFee"
    );
  }

  const cleanFrequency =
    typeof frequency === "string" &&
    ["daily", "weekly", "monthly", "yearly"].includes(frequency)
      ? frequency
      : "monthly";
  const cleanInterval =
    interval !== undefined
      ? Number.isInteger(interval) && (interval as number) >= 1
        ? (interval as number)
        : null
      : 1;
  if (cleanInterval === null) {
    validationError(
      "Validation Error: 'interval' must be an integer greater than or equal to 1",
      "interval"
    );
  }

  if (
    !startDate ||
    typeof startDate !== "string" ||
    !isValidIsoDateOrTimestamp(startDate)
  ) {
    validationError(
      "Validation Error: 'startDate' is required in valid ISO format (e.g. YYYY-MM-DD)",
      "startDate"
    );
  }
  const cleanStartDate = startDate.trim().split("T")[0];

  const cleanNextRunDate =
    nextRunDate &&
    typeof nextRunDate === "string" &&
    isValidIsoDateOrTimestamp(nextRunDate)
      ? nextRunDate.trim().split("T")[0]
      : cleanStartDate;

  if (
    endDate &&
    (typeof endDate !== "string" || !isValidIsoDateOrTimestamp(endDate))
  ) {
    validationError(
      "Validation Error: 'endDate' must be in valid ISO format (e.g. YYYY-MM-DD)",
      "endDate"
    );
  }
  const cleanEndDate =
    typeof endDate === "string" && endDate.trim().length > 0
      ? endDate.trim().split("T")[0]
      : null;

  if (notes && (typeof notes !== "string" || notes.length > 500)) {
    validationError(
      "Validation Error: 'notes' cannot exceed 500 characters",
      "notes"
    );
  }

  const activeFlag = isActive === false ? 0 : 1;

  const newTemplate = await db
    .insert(schema.recurringTemplates)
    .values({
      templateUserId: userId,
      templateName: templateNameInput.trim(),
      templateWalletId: walletId.trim(),
      templateTargetWalletId: cleanTargetWalletId,
      templateCategoryId: cleanCategoryId,
      templateAmount: amount,
      templateAdminFee: cleanAdminFee,
      templateType: cleanType,
      templateFrequency: cleanFrequency,
      templateInterval: cleanInterval,
      templateStartDate: cleanStartDate,
      templateNextRunDate: cleanNextRunDate,
      templateEndDate: cleanEndDate,
      templateIsActive: activeFlag,
      templateNotes: typeof notes === "string" ? notes.trim() : null,
    })
    .returning();

  const created = newTemplate[0];
  let materializedCount = 0;
  if (activeFlag === 1) {
    const occurrences = planOccurrenceDates(
      created.templateNextRunDate,
      created.templateFrequency as "daily" | "weekly" | "monthly" | "yearly",
      created.templateInterval,
      created.templateEndDate
    );
    if (occurrences.length > 0) {
      // D1 caps bound parameters per statement: insert in small chunks
      // instead of one 100-row multi-VALUES statement.
      for (let i = 0; i < occurrences.length; i += MATERIALIZE_CHUNK_SIZE) {
        const chunk = occurrences.slice(i, i + MATERIALIZE_CHUNK_SIZE);
        await db.insert(schema.transactions).values(
          chunk.map((occ) => ({
            transactionUserId: userId,
            transactionWalletId: created.templateWalletId,
            transactionTargetWalletId: created.templateTargetWalletId,
            transactionCategoryId: created.templateCategoryId,
            transactionAmount: created.templateAmount,
            transactionAdminFee: created.templateAdminFee,
            transactionType: created.templateType,
            transactionDescription: `[Recurring] ${created.templateName}`,
            transactionIsPlanned: 1,
            transactionTemplateId: created.templateId,
            transactionOccurrenceDate: occ.occurrenceDate,
            transactionDate: occ.transactionDate,
          }))
        );
      }
      materializedCount = occurrences.length;
    }
  }

  return { ...created, materializedCount };
}

export interface UpdateRecurringTemplateParams {
  name?: unknown;
  walletId?: unknown;
  targetWalletId?: unknown;
  categoryId?: unknown;
  amount?: unknown;
  adminFee?: unknown;
  type?: unknown;
  frequency?: unknown;
  interval?: unknown;
  startDate?: unknown;
  nextRunDate?: unknown;
  endDate?: unknown;
  isActive?: unknown;
  notes?: unknown;
  propagateScope?: unknown;
}

export async function updateRecurringTemplate(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  templateId: unknown,
  params: UpdateRecurringTemplateParams
) {
  if (!isValidUUID(templateId)) {
    validationError(
      "Validation Error: Valid string 'templateId' (UUID) is required for update",
      "templateId"
    );
  }
  const cleanTemplateId = templateId.trim();
  const existingTemplate = await db
    .select()
    .from(schema.recurringTemplates)
    .where(
      and(
        eq(schema.recurringTemplates.templateId, cleanTemplateId),
        eq(schema.recurringTemplates.templateUserId, userId)
      )
    )
    .get();

  if (!existingTemplate) {
    notFound("Recurring Template", cleanTemplateId);
  }
  const {
    name: templateNameInput,
    walletId,
    targetWalletId,
    categoryId,
    amount,
    adminFee,
    type: templateTypeInput,
    frequency,
    interval,
    startDate,
    nextRunDate,
    endDate,
    isActive,
    notes,
    propagateScope,
  } = params;

  let cleanScope: "future_only" | "cancel" = "future_only";
  if (propagateScope !== undefined) {
    if (propagateScope !== "future_only" && propagateScope !== "cancel") {
      validationError(
        "Validation Error: 'propagateScope' must be 'future_only' or 'cancel'",
        "propagateScope"
      );
    }
    cleanScope = propagateScope;
  }

  const updateData: Partial<typeof schema.recurringTemplates.$inferInsert> = {};

  if (templateNameInput !== undefined) {
    if (
      typeof templateNameInput !== "string" ||
      templateNameInput.trim().length === 0 ||
      templateNameInput.trim().length > 100
    ) {
      validationError("Validation Error: 'name' must be 1-100 characters", "name");
    }
    updateData.templateName = templateNameInput.trim();
  }
  if (walletId !== undefined) {
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
    updateData.templateWalletId = walletId.trim();
  }
  if (targetWalletId !== undefined) {
    if (targetWalletId) {
      if (!isValidUUID(targetWalletId)) {
        validationError(
          "Validation Error: 'targetWalletId' must be a valid UUID string",
          "targetWalletId"
        );
      }
      const tw = await db
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.walletId, targetWalletId.trim()),
            eq(schema.wallets.walletUserId, userId)
          )
        )
        .get();
      if (!tw) notFound("Target Wallet", targetWalletId.trim());
      updateData.templateTargetWalletId = targetWalletId.trim();
    } else {
      updateData.templateTargetWalletId = null;
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
      updateData.templateCategoryId = categoryId.trim();
    } else {
      updateData.templateCategoryId = null;
    }
  }
  if (amount !== undefined) {
    if (!isValidPositiveNumber(amount)) {
      validationError(
        "Validation Error: 'amount' must be a positive finite number greater than 0",
        "amount"
      );
    }
    updateData.templateAmount = amount;
  }
  if (adminFee !== undefined) {
    if (!isValidFiniteNumber(adminFee) || adminFee < 0) {
      validationError(
        "Validation Error: 'adminFee' must be a non-negative finite number",
        "adminFee"
      );
    }
    updateData.templateAdminFee = adminFee;
  }
  if (templateTypeInput !== undefined) {
    if (
      typeof templateTypeInput !== "string" ||
      !["expense", "income", "transfer"].includes(templateTypeInput)
    ) {
      validationError(
        "Validation Error: 'type' must be 'expense', 'income', or 'transfer'",
        "type"
      );
    }
    updateData.templateType = templateTypeInput;
  }
  if (frequency !== undefined) {
    if (
      typeof frequency !== "string" ||
      !["daily", "weekly", "monthly", "yearly"].includes(frequency)
    ) {
      validationError(
        "Validation Error: 'frequency' must be 'daily', 'weekly', 'monthly', or 'yearly'",
        "frequency"
      );
    }
    updateData.templateFrequency = frequency;
  }
  if (interval !== undefined) {
    if (!Number.isInteger(interval) || (interval as number) < 1) {
      validationError(
        "Validation Error: 'interval' must be an integer >= 1",
        "interval"
      );
    }
    updateData.templateInterval = interval as number;
  }
  if (startDate !== undefined) {
    if (
      typeof startDate !== "string" ||
      !isValidIsoDateOrTimestamp(startDate)
    ) {
      validationError(
        "Validation Error: 'startDate' must be in valid ISO format",
        "startDate"
      );
    }
    updateData.templateStartDate = startDate.trim().split("T")[0];
  }
  if (nextRunDate !== undefined) {
    if (
      typeof nextRunDate !== "string" ||
      !isValidIsoDateOrTimestamp(nextRunDate)
    ) {
      validationError(
        "Validation Error: 'nextRunDate' must be in valid ISO format",
        "nextRunDate"
      );
    }
    updateData.templateNextRunDate = nextRunDate.trim().split("T")[0];
  }
  if (endDate !== undefined) {
    if (
      endDate &&
      (typeof endDate !== "string" || !isValidIsoDateOrTimestamp(endDate))
    ) {
      validationError(
        "Validation Error: 'endDate' must be in valid ISO format",
        "endDate"
      );
    }
    updateData.templateEndDate =
      typeof endDate === "string" && endDate.trim().length > 0
        ? endDate.trim().split("T")[0]
        : null;
  }
  if (isActive !== undefined) {
    updateData.templateIsActive = isActive ? 1 : 0;
  }
  if (notes !== undefined) {
    if (notes && (typeof notes !== "string" || notes.length > 500)) {
      validationError(
        "Validation Error: 'notes' cannot exceed 500 characters",
        "notes"
      );
    }
    updateData.templateNotes =
      typeof notes === "string" && notes.trim().length > 0
        ? notes.trim()
        : null;
  }
  if (Object.keys(updateData).length === 0) {
    return existingTemplate;
  }

  const shapeKeys = [
    "templateAmount",
    "templateAdminFee",
    "templateWalletId",
    "templateTargetWalletId",
    "templateCategoryId",
    "templateType",
    "templateFrequency",
    "templateInterval",
    "templateStartDate",
    "templateNextRunDate",
    "templateEndDate",
  ];
  const touchesShape = Object.keys(updateData).some((k) => shapeKeys.includes(k));

  const updated = await db
    .update(schema.recurringTemplates)
    .set(updateData)
    .where(
      and(
        eq(schema.recurringTemplates.templateId, cleanTemplateId),
        eq(schema.recurringTemplates.templateUserId, userId)
      )
    )
    .returning();

  let propagatedCount = 0;
  const deactivating = updateData.templateIsActive === 0;
  if (touchesShape && cleanScope === "future_only" && !deactivating) {
    const nowIso = currentIsoTimestamp();
    await db
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.transactionUserId, userId),
          eq(schema.transactions.transactionTemplateId, cleanTemplateId),
          eq(schema.transactions.transactionIsPlanned, 1),
          gt(schema.transactions.transactionDate, nowIso)
        )
      )
      .run();
    const fresh = updated[0];
    const occurrences = planOccurrenceDates(
      fresh.templateNextRunDate > nowIso.split("T")[0]
        ? fresh.templateNextRunDate
        : nowIso.split("T")[0],
      fresh.templateFrequency as "daily" | "weekly" | "monthly" | "yearly",
      fresh.templateInterval,
      fresh.templateEndDate
    );
    const futureOccurrences = occurrences.filter(
      (occ) => `${occ.occurrenceDate}T00:00:00.000Z` > nowIso
    );
    if (futureOccurrences.length > 0) {
      for (let i = 0; i < futureOccurrences.length; i += MATERIALIZE_CHUNK_SIZE) {
        const chunk = futureOccurrences.slice(i, i + MATERIALIZE_CHUNK_SIZE);
        await db.insert(schema.transactions).values(
          chunk.map((occ) => ({
            transactionUserId: userId,
            transactionWalletId: fresh.templateWalletId,
            transactionTargetWalletId: fresh.templateTargetWalletId,
            transactionCategoryId: fresh.templateCategoryId,
            transactionAmount: fresh.templateAmount,
            transactionAdminFee: fresh.templateAdminFee,
            transactionType: fresh.templateType,
            transactionDescription: `[Recurring] ${fresh.templateName}`,
            transactionIsPlanned: 1,
            transactionTemplateId: cleanTemplateId,
            transactionOccurrenceDate: occ.occurrenceDate,
            transactionDate: occ.transactionDate,
          }))
        );
      }
      propagatedCount = futureOccurrences.length;
    }
  }

  if (deactivating) {
    const nowIso = currentIsoTimestamp();
    await db
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.transactionUserId, userId),
          eq(schema.transactions.transactionTemplateId, cleanTemplateId),
          eq(schema.transactions.transactionIsPlanned, 1),
          gt(schema.transactions.transactionDate, nowIso)
        )
      )
      .run();
  }

  return { ...updated[0], propagatedCount };
}

export async function deleteRecurringTemplate(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  templateId: unknown
) {
  if (!isValidUUID(templateId)) {
    validationError(
      "Validation Error: Valid string 'templateId' (UUID) is required for delete",
      "templateId"
    );
  }
  const cleanTemplateId = templateId.trim();
  const nowIso = currentIsoTimestamp();
  await db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionUserId, userId),
        eq(schema.transactions.transactionTemplateId, cleanTemplateId),
        eq(schema.transactions.transactionIsPlanned, 1),
        gt(schema.transactions.transactionDate, nowIso)
      )
    )
    .run();
  const deleted = await db
    .delete(schema.recurringTemplates)
    .where(
      and(
        eq(schema.recurringTemplates.templateId, cleanTemplateId),
        eq(schema.recurringTemplates.templateUserId, userId)
      )
    )
    .returning();

  if (deleted.length === 0) {
    notFound("Recurring Template", cleanTemplateId);
  }

  return deleted[0];
}

export interface RealizeRecurringOccurrenceParams {
  transactionId?: unknown;
  templateId?: unknown;
  occurrenceDate?: unknown;
  actualAmount?: unknown;
}

export async function applyRecurringTemplate(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  templateId: unknown,
  executionDate?: unknown,
  params: RealizeRecurringOccurrenceParams = {}
) {
  const nowIso = currentIsoTimestamp();
  const plannedTxId =
    typeof params.transactionId === "string" && params.transactionId.trim().length > 0
      ? params.transactionId.trim()
      : null;

  if (plannedTxId) {
    if (!isValidUUID(plannedTxId)) {
      validationError(
        "Validation Error: Valid string 'transactionId' (UUID) is required for realize",
        "transactionId"
      );
    }
    const planned = await db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.transactionId, plannedTxId),
          eq(schema.transactions.transactionUserId, userId)
        )
      )
      .get();
    if (!planned) notFound("Planned transaction", plannedTxId);
    if (planned.transactionIsPlanned !== 1) {
      validationError(
        "Validation Error: transaction is already realized and cannot be realized again",
        "transactionId"
      );
    }

    let realizedAmount = planned.transactionAmount;
    let plannedSnapshot: number | null = null;
    if (params.actualAmount !== undefined) {
      if (!isValidPositiveNumber(params.actualAmount)) {
        validationError(
          "Validation Error: 'actualAmount' must be a positive finite number greater than 0",
          "actualAmount"
        );
      }
      if (params.actualAmount !== planned.transactionAmount) {
        plannedSnapshot = planned.transactionAmount;
        realizedAmount = params.actualAmount;
      }
    }

    const fee = planned.transactionAdminFee || 0.0;
    const flipped = await db
      .update(schema.transactions)
      .set({
        transactionIsPlanned: 0,
        transactionAmount: realizedAmount,
        transactionPlannedAmount: plannedSnapshot,
        transactionRealizedAt: nowIso,
      })
      .where(
        and(
          eq(schema.transactions.transactionId, plannedTxId),
          eq(schema.transactions.transactionUserId, userId)
        )
      )
      .returning();

    await applyBalanceDelta(
      db,
      userId,
      planned.transactionType,
      planned.transactionWalletId,
      planned.transactionTargetWalletId,
      realizedAmount,
      fee,
      1
    );

    return {
      message: "Recurring occurrence successfully realized",
      transaction: flipped[0],
    };
  }

  if (!isValidUUID(templateId)) {
    validationError(
      "Validation Error: Valid string 'templateId' (UUID) is required for apply_recurring_template",
      "templateId"
    );
  }
  const cleanTemplateId = (templateId as string).trim();
  const template = await db
    .select()
    .from(schema.recurringTemplates)
    .where(
      and(
        eq(schema.recurringTemplates.templateId, cleanTemplateId),
        eq(schema.recurringTemplates.templateUserId, userId)
      )
    )
    .get();

  if (!template) {
    notFound("Recurring Template", cleanTemplateId);
  }

  if (
    executionDate !== undefined &&
    (typeof executionDate !== "string" || !isValidIsoDateOrTimestamp(executionDate))
  ) {
    validationError(
      "Validation Error: 'executionDate' must be in valid ISO format",
      "executionDate"
    );
  }
  const txDate = executionDate
    ? normalizeToIsoTimestamp(executionDate as string)
    : `${template.templateNextRunDate}T12:00:00.000Z`;
  const occurrenceDay = txDate.split("T")[0];

  const existingPlanned = await db
    .select({ transactionId: schema.transactions.transactionId })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionUserId, userId),
        eq(schema.transactions.transactionTemplateId, cleanTemplateId),
        eq(schema.transactions.transactionIsPlanned, 1),
        eq(schema.transactions.transactionOccurrenceDate, occurrenceDay)
      )
    )
    .get();
  if (existingPlanned) {
    return applyRecurringTemplate(db, userId, templateId, executionDate, {
      ...params,
      transactionId: existingPlanned.transactionId,
    });
  }

  const fee = template.templateAdminFee || 0.0;
  const amt = template.templateAmount;

  const sourceWallet = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, template.templateWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!sourceWallet) {
    notFound("Source wallet", template.templateWalletId);
  }

  const newTx = await db
    .insert(schema.transactions)
    .values({
      transactionUserId: userId,
      transactionWalletId: template.templateWalletId,
      transactionTargetWalletId: template.templateTargetWalletId,
      transactionCategoryId: template.templateCategoryId,
      transactionAmount: amt,
      transactionAdminFee: fee,
      transactionType: template.templateType,
      transactionDescription: `[Recurring] ${template.templateName}`,
      transactionIsPlanned: 0,
      transactionTemplateId: cleanTemplateId,
      transactionOccurrenceDate: occurrenceDay,
      transactionRealizedAt: nowIso,
      transactionDate: txDate,
    })
    .returning();

  await applyBalanceDelta(
    db,
    userId,
    template.templateType,
    template.templateWalletId,
    template.templateTargetWalletId,
    amt,
    fee,
    1
  );

  const nextDate = calculateNextRunDate(
    template.templateNextRunDate,
    template.templateFrequency as "daily" | "weekly" | "monthly" | "yearly",
    template.templateInterval
  );

  const updatedTemplate = await db
    .update(schema.recurringTemplates)
    .set({ templateNextRunDate: nextDate })
    .where(
      and(
        eq(schema.recurringTemplates.templateId, cleanTemplateId),
        eq(schema.recurringTemplates.templateUserId, userId)
      )
    )
    .returning();

  return {
    message: "Recurring template successfully applied",
    transaction: newTx[0],
    template: updatedTemplate[0],
  };
}
