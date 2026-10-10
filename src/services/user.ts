import type { Database } from "../db";
import * as schema from "../db/schema";
import { and, eq, ne } from "drizzle-orm";
import { conflict, notFound, unauthorized, validationError } from "./errors";
import { generateApiKey, hashApiKey, isValidEmail, isValidWhatsApp } from "../utils/token";
import { currentIsoTimestamp } from "../utils/date";

export interface UserProfileDTO {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  whatsappNumber: string;
  createdAt: string;
}

export async function getUserProfile(
  db: Database,
  userId: string
): Promise<UserProfileDTO> {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    unauthorized("Authentication required");
  }

  const [user] = await db
    .select({
      userId: schema.users.userId,
      userFirstName: schema.users.userFirstName,
      userLastName: schema.users.userLastName,
      userEmail: schema.users.userEmail,
      userWhatsappNumber: schema.users.userWhatsappNumber,
      userCreatedAt: schema.users.userCreatedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.userId, userId))
    .limit(1);
  if (!user) {
    notFound("User", userId);
  }

  return {
    userId: user.userId,
    firstName: user.userFirstName,
    lastName: user.userLastName,
    fullName: `${user.userFirstName} ${user.userLastName}`.trim(),
    email: user.userEmail,
    whatsappNumber: user.userWhatsappNumber,
    createdAt: user.userCreatedAt,
  };
}
export interface UpdateUserProfileParams {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  whatsappNumber?: unknown;
}

export async function updateUserProfile(
  db: Database,
  userId: string,
  params: UpdateUserProfileParams
): Promise<UserProfileDTO> {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    unauthorized("Authentication required");
  }

  await getUserProfile(db, userId);

  const { firstName, lastName, email, whatsappNumber } = params;
  const updates: Partial<typeof schema.users.$inferInsert> = {};
  if (firstName !== undefined) {
    if (typeof firstName !== "string" || firstName.trim().length === 0 || firstName.trim().length > 100) {
      validationError("Validation Error: 'firstName' must be 1-100 characters", "firstName");
    }
    updates.userFirstName = firstName.trim();
  }

  if (lastName !== undefined) {
    if (typeof lastName !== "string" || lastName.trim().length === 0 || lastName.trim().length > 100) {
      validationError("Validation Error: 'lastName' must be 1-100 characters", "lastName");
    }
    updates.userLastName = lastName.trim();
  }
  if (email !== undefined) {
    if (typeof email !== "string" || !isValidEmail(email)) {
      validationError("Validation Error: 'email' must be a valid email address", "email");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(and(eq(schema.users.userEmail, normalizedEmail), ne(schema.users.userId, userId)))
      .limit(1);
    if (existing) {
      conflict(`Email '${normalizedEmail}' is already registered to another account.`);
    }
    updates.userEmail = normalizedEmail;
  }

  if (whatsappNumber !== undefined) {
    if (typeof whatsappNumber !== "string" || !isValidWhatsApp(whatsappNumber)) {
      validationError("Validation Error: 'whatsappNumber' must be in international format (e.g. +6281234567890)", "whatsappNumber");
    }
    updates.userWhatsappNumber = whatsappNumber.trim();
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.userId, userId));
  }

  return getUserProfile(db, userId);
}

export interface RotateApiKeyDTO {
  apiKey: string;
  message: string;
  rotatedAt: string;
}

export async function rotateUserApiKey(
  db: Database,
  userId: string,
  confirm: unknown
): Promise<RotateApiKeyDTO> {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    unauthorized("Authentication required");
  }

  if (confirm !== true) {
    validationError(
      "Validation Error: Explicit confirmation (confirm: true) is required to rotate your API key as the previous key will be immediately invalidated.",
      "confirm"
    );
  }

  const [user] = await db
    .select({
      email: schema.users.userEmail,
    })
    .from(schema.users)
    .where(eq(schema.users.userId, userId))
    .limit(1);

  if (!user) {
    notFound("User", userId);
  }

  if (!user.email || typeof user.email !== "string" || !isValidEmail(user.email)) {
    validationError(
      "Validation Error: A valid email address must be connected to your account before rotating your API key to prevent permanent lockout.",
      "email"
    );
  }

  const newApiKey = generateApiKey();
  const newHash = await hashApiKey(newApiKey);
  const nowIso = currentIsoTimestamp();

  await db
    .update(schema.users)
    .set({
      userApiKeyHash: newHash,
    })
    .where(eq(schema.users.userId, userId));

  return {
    apiKey: newApiKey,
    message: "API key successfully rotated! Your previous API key is now permanently invalidated. Please store this new key securely as it will not be displayed again.",
    rotatedAt: nowIso,
  };
}
