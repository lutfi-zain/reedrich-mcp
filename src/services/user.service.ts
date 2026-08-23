import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";
import {
  generateApiKey,
  generateUserId,
  generateUserToken,
  verifyUserToken,
  hashApiKey,
  isValidEmail,
  isValidWhatsApp,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
} from "../utils/token";

export type OnboardingStatus = {
  isComplete: boolean;
  hasWallets: boolean;
  hasCategories: boolean;
  hasBudgets: boolean;
  hasTransactions: boolean;
  hasDebtsOrLoans: boolean;
  totalWallets: number;
  totalCategories: number;
  totalBudgets: number;
  needs: string[];
  suggestions: string[];
  nextSteps: string[];
};

export async function evaluateOnboarding(
  db: DrizzleD1Database<typeof schema>,
  userId: string
): Promise<OnboardingStatus> {
  const [walletCount, catCount, budgetCount, txCount, debtCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(schema.wallets).where(eq(schema.wallets.walletUserId, userId)).get(),
    db.select({ count: sql<number>`count(*)` }).from(schema.categories).where(eq(schema.categories.categoryUserId, userId)).get(),
    db.select({ count: sql<number>`count(*)` }).from(schema.budgets).where(eq(schema.budgets.budgetUserId, userId)).get(),
    db.select({ count: sql<number>`count(*)` }).from(schema.transactions).where(eq(schema.transactions.transactionUserId, userId)).get(),
    db.select({ count: sql<number>`count(*)` }).from(schema.debtsLoans).where(eq(schema.debtsLoans.debtLoanUserId, userId)).get(),
  ]);

  const totalWallets = Number(walletCount?.count || 0);
  const totalCategories = Number(catCount?.count || 0);
  const totalBudgets = Number(budgetCount?.count || 0);
  const totalTransactions = Number(txCount?.count || 0);
  const totalDebtsOrLoans = Number(debtCount?.count || 0);

  const hasWallets = totalWallets > 0;
  const hasCategories = totalCategories > 0;
  const hasBudgets = totalBudgets > 0;
  const hasTransactions = totalTransactions > 0;
  const hasDebtsOrLoans = totalDebtsOrLoans > 0;

  const needs: string[] = [];
  const nextSteps: string[] = [];
  if (!hasWallets) {
    needs.push("wallet");
    nextSteps.push("Buat dompet/rekening pertama Anda (misal: Tunai, BCA, Mandiri, GoPay) menggunakan tool `manage_wallet`.");
  }
  if (!hasCategories) {
    needs.push("categories");
    nextSteps.push("Buat kategori pengeluaran/pemasukan Anda atau buat kategori standar menggunakan `manage_category`.");
  }

  const suggestions: string[] = [];
  if (!hasBudgets) {
    suggestions.push("budget");
  }
  if (hasWallets && hasCategories && !hasBudgets) {
    nextSteps.push("Opsional: Atur batas anggaran bulanan untuk kategori pengeluaran Anda menggunakan `manage_budget`.");
  }
  if (hasWallets && !hasTransactions) {
    nextSteps.push("Mulai catat transaksi pertama Anda dengan `record_transaction`.");
  }

  const isComplete = hasWallets && hasCategories;

  return {
    isComplete,
    hasWallets,
    hasCategories,
    hasBudgets,
    hasTransactions,
    hasDebtsOrLoans,
    totalWallets,
    totalCategories,
    totalBudgets,
    needs,
    suggestions,
    nextSteps,
  };
}

export type RegisterUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  whatsappNumber: string;
};

export type RegisterUserResult = {
  userId: string;
  name: string;
  userFirstName: string;
  userLastName: string;
  email: string;
  userEmail: string;
  whatsappNumber: string;
  userWhatsappNumber: string;
  apiKey: string;
  token: string;
  expiresIn: number;
  tokenType: string;
  onboarding: OnboardingStatus;
};

export async function registerUser(
  db: DrizzleD1Database<typeof schema>,
  jwtSecret: string,
  input: RegisterUserInput
): Promise<RegisterUserResult> {
  const { firstName, lastName, email, whatsappNumber } = input;

  if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0 || firstName.trim().length > 100) {
    throw new Error("Invalid firstName: Must be a non-empty string between 1 and 100 characters");
  }
  if (!lastName || typeof lastName !== "string" || lastName.trim().length === 0 || lastName.trim().length > 100) {
    throw new Error("Invalid lastName: Must be a non-empty string between 1 and 100 characters");
  }
  if (!isValidEmail(email)) {
    throw new Error(`Invalid email address: '${email}'. Please provide a valid email (e.g. user@example.com)`);
  }
  if (!isValidWhatsApp(whatsappNumber)) {
    throw new Error(`Invalid WhatsApp phone number: '${whatsappNumber}'. Must include country code and '+' prefix (e.g. +6281234567890)`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedWhatsApp = whatsappNumber.trim();
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const fullName = `${cleanFirstName} ${cleanLastName}`.trim();

  const existingEmail = await db
    .select({ userId: schema.users.userId })
    .from(schema.users)
    .where(eq(schema.users.userEmail, normalizedEmail))
    .get();

  if (existingEmail) {
    throw new Error(`Email '${normalizedEmail}' is already registered. Please log in with your API key using 'login_user'.`);
  }

  const userId = generateUserId();
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  await db.insert(schema.users).values({
    userId,
    userFirstName: cleanFirstName,
    userLastName: cleanLastName,
    userEmail: normalizedEmail,
    userWhatsappNumber: normalizedWhatsApp,
    userApiKeyHash: apiKeyHash,
  });

  const token = await generateUserToken({ userId, name: fullName }, jwtSecret);
  const onboarding = await evaluateOnboarding(db, userId);

  return {
    userId,
    name: fullName,
    userFirstName: cleanFirstName,
    userLastName: cleanLastName,
    email: normalizedEmail,
    userEmail: normalizedEmail,
    whatsappNumber: normalizedWhatsApp,
    userWhatsappNumber: normalizedWhatsApp,
    apiKey,
    token,
    expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
    tokenType: "Bearer",
    onboarding,
  };
}

export type LoginUserResult = {
  userId: string;
  name: string;
  userFirstName: string;
  userLastName: string;
  email: string;
  userEmail: string;
  token: string;
  expiresIn: number;
  tokenType: string;
  onboarding: OnboardingStatus;
};

export async function loginUser(
  db: DrizzleD1Database<typeof schema>,
  jwtSecret: string,
  apiKey: string
): Promise<LoginUserResult> {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error("Invalid API key: Please provide a valid persistent API key (e.g. rd_live_...)");
  }

  const cleanApiKey = apiKey.trim();
  const apiKeyHash = await hashApiKey(cleanApiKey);

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.userApiKeyHash, apiKeyHash))
    .get();

  if (!user) {
    throw new Error("Authentication failed: Invalid API key. If you are a new user, please register first using 'register_user'.");
  }

  const fullName = `${user.userFirstName} ${user.userLastName}`.trim();
  const token = await generateUserToken({ userId: user.userId, name: fullName }, jwtSecret);
  const onboarding = await evaluateOnboarding(db, user.userId);

  return {
    userId: user.userId,
    name: fullName,
    userFirstName: user.userFirstName,
    userLastName: user.userLastName,
    email: user.userEmail,
    userEmail: user.userEmail,
    token,
    expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
    tokenType: "Bearer",
    onboarding,
  };
}

export async function resolveUserFromKeyOrToken(
  db: DrizzleD1Database<typeof schema>,
  jwtSecret: string,
  candidate: string
): Promise<{ userId: string; user?: typeof schema.users.$inferSelect } | null> {
  if (!candidate || typeof candidate !== "string") return null;
  const clean = candidate.trim();
  if (!clean) return null;

  // Case 1: Persistent API Key
  if (clean.startsWith("rd_live_") || clean.startsWith("fp_live_")) {
    try {
      const hash = await hashApiKey(clean);
      const user = await db.select().from(schema.users).where(eq(schema.users.userApiKeyHash, hash)).get();
      return user ? { userId: user.userId, user } : null;
    } catch {
      return null;
    }
  }

  // Case 2: JWT Token
  try {
    const jwtUser = await verifyUserToken(clean, jwtSecret);
    if (jwtUser?.userId) {
      const user = await db.select().from(schema.users).where(eq(schema.users.userId, jwtUser.userId)).get();
      return user ? { userId: user.userId, user } : { userId: jwtUser.userId };
    }
  } catch {
    // Continue to fallback
  }

  // Case 3: Fallback raw hash lookup
  try {
    const hash = await hashApiKey(clean);
    const user = await db.select().from(schema.users).where(eq(schema.users.userApiKeyHash, hash)).get();
    return user ? { userId: user.userId, user } : null;
  } catch {
    return null;
  }
}
