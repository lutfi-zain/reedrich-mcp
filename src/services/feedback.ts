import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { isValidEmail } from "../utils/token";
import { validationError } from "./errors";

export interface SubmitFeedbackParams {
  title: unknown;
  content?: unknown;
  feedback?: unknown;
  type?: unknown;
  name?: unknown;
  email?: unknown;
}

export async function submitFeedback(
  db: DrizzleD1Database<typeof schema>,
  userId: string | null,
  params: SubmitFeedbackParams
) {
  const {
    title,
    content,
    feedback,
    type = "feedback",
    name: submitterName,
    email: submitterEmail,
  } = params;
  const feedbackContent = (content || feedback) as string | undefined;

  if (
    !title ||
    typeof title !== "string" ||
    title.trim().length < 5 ||
    title.trim().length > 200
  ) {
    validationError(
      "Validation Error: 'title' is required (5-200 characters)",
      "title"
    );
  }
  if (
    !feedbackContent ||
    typeof feedbackContent !== "string" ||
    feedbackContent.trim().length < 10 ||
    feedbackContent.trim().length > 4000
  ) {
    validationError(
      "Validation Error: 'content' or 'feedback' is required (10-4000 characters)",
      "content"
    );
  }

  const validTypes = ["feedback", "bug", "feature_request", "question"];
  if (typeof type !== "string" || !validTypes.includes(type)) {
    validationError(
      `Validation Error: 'type' must be one of: ${validTypes.join(", ")}`,
      "type"
    );
  }
  const feedbackType = type;

  let foundUserId: string | null = null;
  let userName =
    typeof submitterName === "string" && submitterName.trim().length > 0
      ? submitterName.trim()
      : null;
  let userEmail =
    typeof submitterEmail === "string" && submitterEmail.trim().length > 0
      ? submitterEmail.trim().toLowerCase()
      : null;

  if (userId) {
    foundUserId = userId;
    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.userId, userId))
      .get();
    if (user) {
      if (!userName) {
        userName = `${user.userFirstName} ${user.userLastName}`.trim();
      }
      if (!userEmail) {
        userEmail = user.userEmail;
      }
    }
  }

  if (!userName) {
    validationError(
      "Validation Error: Submitter 'name' is required when unauthenticated. Please provide 'name' in arguments or authenticate with your API key.",
      "name"
    );
  }
  if (!userEmail || !isValidEmail(userEmail)) {
    validationError(
      `Validation Error: A valid 'email' is required. Received: '${userEmail || ""}'. Please provide a valid email or authenticate with your API key.`,
      "email"
    );
  }

  const newFeedbackId = crypto.randomUUID();
  const now = currentIsoTimestamp();

  await db
    .insert(schema.feedbacks)
    .values({
      feedbackId: newFeedbackId,
      feedbackUserId: foundUserId,
      feedbackTitle: title.trim(),
      feedbackContent: feedbackContent.trim(),
      feedbackType: feedbackType,
      feedbackSubmitterName: userName,
      feedbackSubmitterEmail: userEmail,
      feedbackStatus: "new",
      feedbackCreatedAt: now,
    })
    .run();

  return {
    success: true,
    message:
      "Feedback submitted successfully and saved to internal database!",
    feedbackId: newFeedbackId,
    type: feedbackType,
    status: "new",
    submitter: {
      name: userName,
      email: userEmail,
      userId: foundUserId,
    },
    submittedAt: now,
  };
}
