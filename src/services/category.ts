import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { validationError, notFound, isValidUUID } from "./errors";

export const DEFAULT_CATEGORIES = [
  // Expense categories
  { name: "Makanan & Minuman", type: "expense", icon: "🍔" },
  { name: "Transportasi", type: "expense", icon: "🚗" },
  { name: "Belanja", type: "expense", icon: "🛍️" },
  { name: "Tagihan & Utilitas", type: "expense", icon: "💡" },
  { name: "Hiburan", type: "expense", icon: "🎬" },
  { name: "Kesehatan", type: "expense", icon: "💊" },
  // Income categories
  { name: "Gaji", type: "income", icon: "💼" },
  { name: "Investasi & Bunga", type: "income", icon: "📈" },
  { name: "Usaha / Freelance", type: "income", icon: "💻" },
  { name: "Pemasukan Lainnya", type: "income", icon: "🎁" },
  // System category for ledger-complete balance adjustments (protected: matched by name, never user-deleted)
  { name: "Adjustment", type: "expense", icon: "🧮" },
];

export interface CreateCategoryParams {
  name: unknown;
  type?: unknown;
  icon?: unknown;
}

export async function listCategories(
  db: Database,
  userId: string
) {
  return db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));
}
export async function getCategoryById(
  db: Database,
  userId: string,
  categoryId: unknown
) {
  if (!isValidUUID(categoryId)) {
    validationError("Validation Error: Valid string 'categoryId' (UUID) is required", "categoryId");
  }
  const cleanId = (categoryId as string).trim();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.categoryId, cleanId),
        eq(schema.categories.categoryUserId, userId)
      )
    )
    .limit(1);
  if (!category) {
    notFound("Category", cleanId);
  }
  return category;
}

export async function createCategory(
  db: Database,
  userId: string,
  params: CreateCategoryParams
) {
  const { name: catName, type, icon } = params;

  if (
    !catName ||
    typeof catName !== "string" ||
    catName.trim().length === 0 ||
    catName.trim().length > 100
  ) {
    validationError(
      "Validation Error: Category 'name' is required (1-100 characters)",
      "name"
    );
  }

  const cleanIcon =
    icon && typeof icon === "string" && icon.trim().length <= 10
      ? icon.trim()
      : null;
  const newCategoryId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const result = await db
    .insert(schema.categories)
    .values({
      categoryId: newCategoryId,
      categoryUserId: userId,
      categoryName: catName.trim(),
      categoryType: type === "income" ? "income" : "expense",
      categoryIcon: cleanIcon,
      categoryCreatedAt: nowIso,
    })
    .returning();

  return result[0];
}
export interface UpdateCategoryParams {
  name?: unknown;
  icon?: unknown;
}

export async function updateCategory(
  db: Database,
  userId: string,
  categoryId: unknown,
  params: UpdateCategoryParams
) {
  const existing = await getCategoryById(db, userId, categoryId);

  const { name: catName, icon } = params;

  if (
    existing.categoryName.trim().toLowerCase() === ADJUSTMENT_CATEGORY_NAME.toLowerCase() &&
    catName !== undefined &&
    typeof catName === "string" &&
    catName.trim().toLowerCase() !== ADJUSTMENT_CATEGORY_NAME.toLowerCase()
  ) {
    validationError("Validation Error: System category 'Adjustment' cannot be renamed", "name");
  }

  const updates: Partial<typeof schema.categories.$inferInsert> = {};

  if (catName !== undefined) {
    if (
      typeof catName !== "string" ||
      catName.trim().length === 0 ||
      catName.trim().length > 100
    ) {
      validationError("Validation Error: Category 'name' must be 1-100 characters", "name");
    }
    updates.categoryName = (catName as string).trim();
  }

  if (icon !== undefined) {
    if (icon === null || icon === "") {
      updates.categoryIcon = null;
    } else if (typeof icon === "string" && icon.trim().length <= 10) {
      updates.categoryIcon = icon.trim();
    } else {
      validationError("Validation Error: 'icon' must be at most 10 characters", "icon");
    }
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const result = await db
    .update(schema.categories)
    .set(updates)
    .where(
      and(
        eq(schema.categories.categoryId, existing.categoryId),
        eq(schema.categories.categoryUserId, userId)
      )
    )
    .returning();

  return result[0];
}
export async function deleteCategory(
  db: Database,
  userId: string,
  categoryId: unknown
) {
  const existing = await getCategoryById(db, userId, categoryId);

  if (existing.categoryName.trim().toLowerCase() === ADJUSTMENT_CATEGORY_NAME.toLowerCase()) {
    validationError(
      "Validation Error: System category 'Adjustment' is protected and cannot be deleted.",
      "categoryId"
    );
  }

  await db
    .delete(schema.categories)
    .where(
      and(
        eq(schema.categories.categoryId, existing.categoryId),
        eq(schema.categories.categoryUserId, userId)
      )
    );

  return {
    success: true,
    message: `Category '${existing.categoryName}' (${existing.categoryId}) successfully deleted.`,
    deletedCategoryId: existing.categoryId,
  };
}

export const ADJUSTMENT_CATEGORY_NAME = "Adjustment";
export const ADJUSTMENT_CATEGORY_ICON = "🧮";

export async function ensureAdjustmentCategory(
  db: Database,
  userId: string
) {
  const existing = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));
  const found = existing.find(
    (c) =>
      c.categoryName.trim().toLowerCase() === ADJUSTMENT_CATEGORY_NAME.toLowerCase()
  );
  if (found) return found;
  const inserted = await db
    .insert(schema.categories)
    .values({
      categoryUserId: userId,
      categoryName: ADJUSTMENT_CATEGORY_NAME,
      categoryType: "expense",
      categoryIcon: ADJUSTMENT_CATEGORY_ICON,
      categoryCreatedAt: currentIsoTimestamp(),
    })
    .returning();
  return inserted[0];
}

export async function seedDefaults(
  db: Database,
  userId: string
) {
  const existing = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));
  const existingNames = new Set(
    existing.map((c) => c.categoryName.trim().toLowerCase())
  );

  const toCreate = DEFAULT_CATEGORIES.filter(
    (c) => !existingNames.has(c.name.trim().toLowerCase())
  );
  const createdCategories = [];
  const nowIso = currentIsoTimestamp();

  for (const cat of toCreate) {
    const newCategoryId = crypto.randomUUID();
    const [inserted] = await db
      .insert(schema.categories)
      .values({
        categoryId: newCategoryId,
        categoryUserId: userId,
        categoryName: cat.name,
        categoryType: cat.type,
        categoryIcon: cat.icon,
        categoryCreatedAt: nowIso,
      })
      .returning();
    createdCategories.push(inserted);
  }

  const skippedCount = DEFAULT_CATEGORIES.length - toCreate.length;
  return {
    message: `Seeded ${createdCategories.length} default categories (${skippedCount} skipped due to existing names).`,
    createdCount: createdCategories.length,
    skippedCount,
    categories: createdCategories,
  };
}
