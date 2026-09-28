import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { notFound, unauthorized, validationError } from "./errors";
import { isValidWhatsApp } from "../utils/token";

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
  db: DrizzleD1Database<typeof schema>,
  userId: string
): Promise<UserProfileDTO> {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    unauthorized("Authentication required");
  }

  const user = await db
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
    .get();

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
  whatsappNumber?: unknown;
}

export async function updateUserProfile(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: UpdateUserProfileParams
): Promise<UserProfileDTO> {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    unauthorized("Authentication required");
  }

  await getUserProfile(db, userId);

  const { firstName, lastName, whatsappNumber } = params;
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
