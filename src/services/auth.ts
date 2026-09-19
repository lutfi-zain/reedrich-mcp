import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";
import {
  generateApiKey,
  generateUserId,
  generateUserToken,
  hashApiKey,
  isValidEmail,
  isValidWhatsApp,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
} from "../utils/token";
import { currentIsoTimestamp } from "../utils/date";
import { validationError, unauthorized, conflict } from "./errors";

export async function evaluateOnboarding(
  db: DrizzleD1Database<typeof schema>,
  userId: string
): Promise<{
  isComplete: boolean;
  needs: string[];
  suggestions: string[];
  message: string;
}> {
  const [walletCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.wallets)
    .where(eq(schema.wallets.walletUserId, userId));

  const [categoryCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));

  const hasWallets = Number(walletCount?.count || 0) > 0;
  const hasCategories = Number(categoryCount?.count || 0) > 0;
  const needs: string[] = [];
  if (!hasWallets) needs.push("wallet");
  if (!hasCategories) needs.push("categories");

  const suggestions: string[] = [];
  const [budgetCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.budgets)
    .where(eq(schema.budgets.budgetUserId, userId));
  if (Number(budgetCount?.count || 0) === 0) suggestions.push("budget");

  const isComplete = needs.length === 0;
  const message = isComplete
    ? "Setup complete! You can start recording transactions."
    : `Please set up: ${needs.join(", ")}. Use the onboarding_assistant prompt for guidance.`;

  return { isComplete, needs, suggestions, message };
}

export interface RegisterUserParams {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  whatsappNumber: unknown;
}

export async function registerUser(
  db: DrizzleD1Database<typeof schema>,
  jwtSecret: string,
  params: RegisterUserParams
) {
  const { firstName, lastName, email, whatsappNumber } = params;

  if (
    !firstName ||
    typeof firstName !== "string" ||
    firstName.trim().length === 0 ||
    firstName.trim().length > 100
  ) {
    validationError(
      "Validation Error: 'firstName' is required and must be between 1 and 100 characters",
      "firstName"
    );
  }
  if (
    !lastName ||
    typeof lastName !== "string" ||
    lastName.trim().length === 0 ||
    lastName.trim().length > 100
  ) {
    validationError(
      "Validation Error: 'lastName' is required and must be between 1 and 100 characters",
      "lastName"
    );
  }
  if (
    !email ||
    typeof email !== "string" ||
    !isValidEmail(email) ||
    email.length > 255
  ) {
    validationError(
      "Validation Error: Invalid email format. Please provide a valid email (e.g. user@example.com)",
      "email"
    );
  }
  if (
    !whatsappNumber ||
    typeof whatsappNumber !== "string" ||
    !isValidWhatsApp(whatsappNumber)
  ) {
    validationError(
      "Validation Error: Invalid WhatsApp number format. Must start with '+' followed by country code and 6-14 digits (e.g. +6281234567890)",
      "whatsappNumber"
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.userEmail, normalizedEmail))
    .get();
  if (existing) {
    conflict(
      `Registration Error: Email '${normalizedEmail}' is already registered. Please login with your API key using the 'login_user' tool.`
    );
  }

  const newUserId = generateUserId();
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const cleanWhatsApp = whatsappNumber.trim();
  const fullName = `${cleanFirstName} ${cleanLastName}`;
  const nowIso = currentIsoTimestamp();

  await db.insert(schema.users).values({
    userId: newUserId,
    userFirstName: cleanFirstName,
    userLastName: cleanLastName,
    userEmail: normalizedEmail,
    userWhatsappNumber: cleanWhatsApp,
    userApiKeyHash: apiKeyHash,
    userCreatedAt: nowIso,
  });

  const token = await generateUserToken(
    {
      userId: newUserId,
      name: fullName,
      email: normalizedEmail,
      expiresInSeconds: DEFAULT_TOKEN_EXPIRY_SECONDS,
    },
    jwtSecret
  );

  const onboarding = await evaluateOnboarding(db, newUserId);

  return {
    userId: newUserId,
    name: fullName,
    email: normalizedEmail,
    whatsappNumber: cleanWhatsApp,
    apiKey,
    token,
    tokenType: "Bearer",
    expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
    onboarding,
    message:
      "Registration successful! Please set 'Authorization: Bearer <token>' in your MCP client headers for subsequent finance tool calls. Save your apiKey to login again via 'login_user' when your 15-minute token expires.",
  };
}

export async function loginUser(
  db: DrizzleD1Database<typeof schema>,
  jwtSecret: string,
  apiKey: unknown
) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    validationError("Validation Error: 'apiKey' is required for login_user", "apiKey");
  }

  const cleanKey = apiKey.trim();
  const apiKeyHash = await hashApiKey(cleanKey);
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.userApiKeyHash, apiKeyHash))
    .get();
  if (!user) {
    unauthorized(
      "Authentication Error: Invalid API Key. User not found. Please verify your API Key or register via 'register_user'."
    );
  }

  const fullName = `${user.userFirstName} ${user.userLastName}`.trim();
  const token = await generateUserToken(
    {
      userId: user.userId,
      name: fullName,
      email: user.userEmail,
      expiresInSeconds: DEFAULT_TOKEN_EXPIRY_SECONDS,
    },
    jwtSecret
  );

  const onboarding = await evaluateOnboarding(db, user.userId);

  return {
    userId: user.userId,
    name: fullName,
    email: user.userEmail,
    token,
    tokenType: "Bearer",
    expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
    onboarding,
    message:
      "Login successful! Please update 'Authorization: Bearer <token>' in your MCP client headers for subsequent tool calls.",
  };
}
