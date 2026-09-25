import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { notFound, unauthorized } from "./errors";

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
