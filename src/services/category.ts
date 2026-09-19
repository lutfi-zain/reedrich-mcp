import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { validationError } from "./errors";

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
];

export interface CreateCategoryParams {
  name: unknown;
  type?: unknown;
  icon?: unknown;
}

export async function listCategories(
  db: DrizzleD1Database<typeof schema>,
  userId: string
) {
  return db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));
}

export async function createCategory(
  db: DrizzleD1Database<typeof schema>,
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

export async function seedDefaults(
  db: DrizzleD1Database<typeof schema>,
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
