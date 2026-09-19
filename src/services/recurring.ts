import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  normalizeToIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import { calculateNextRunDate } from "../utils/recurring";
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

  return newTemplate[0];
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
  } = params;

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

  return updated[0];
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

export async function applyRecurringTemplate(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  templateId: unknown,
  executionDate?: unknown
) {
  if (!isValidUUID(templateId)) {
    validationError(
      "Validation Error: Valid string 'templateId' (UUID) is required for apply_recurring_template",
      "templateId"
    );
  }
  const cleanTemplateId = templateId.trim();
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

  const fee = template.templateAdminFee || 0.0;
  const amt = template.templateAmount;
  const totalOutflow = amt + fee;

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
      transactionDate: txDate,
    })
    .returning();

  if (template.templateType === "expense") {
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance - ${totalOutflow}` })
      .where(
        and(
          eq(schema.wallets.walletId, template.templateWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  } else if (template.templateType === "income") {
    const netIncome = amt - fee;
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${netIncome}` })
      .where(
        and(
          eq(schema.wallets.walletId, template.templateWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  } else if (
    template.templateType === "transfer" &&
    template.templateTargetWalletId
  ) {
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance - ${totalOutflow}` })
      .where(
        and(
          eq(schema.wallets.walletId, template.templateWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      );

    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${amt}` })
      .where(
        and(
          eq(schema.wallets.walletId, template.templateTargetWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  }

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
