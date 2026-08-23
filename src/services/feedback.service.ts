import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { isValidEmail } from "../utils/token";

export type SubmitFeedbackInput = {
  title: string;
  feedback: string;
  type?: "feedback" | "bug" | "feature_request" | "question" | string;
  name?: string;
  email?: string;
};

export type FeedbackOptions = {
  githubToken?: string;
  githubRepo?: string;
  fetchFn?: typeof fetch;
};

export async function createGithubIssue(opts: {
  token: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
  fetchFn?: typeof fetch;
}): Promise<{ issueUrl: string; issueNumber: number }> {
  const fetchImpl = opts.fetchFn || fetch;
  const url = `https://api.github.com/repos/${opts.repo}/issues`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${opts.token}`,
      "User-Agent": "Reedrich-MCP-Server/1.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      labels: opts.labels,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { html_url: string; number: number };
  return {
    issueUrl: data.html_url,
    issueNumber: data.number,
  };
}

export async function submitFeedback(
  db: DrizzleD1Database<typeof schema>,
  userId: string | null,
  input: SubmitFeedbackInput,
  options: FeedbackOptions = {}
) {
  const { title, feedback, type = "feedback", name, email } = input;

  if (!title || typeof title !== "string" || title.trim().length < 5 || title.trim().length > 200) {
    throw new Error("Validation Error: 'title' is required and must be between 5 and 200 characters");
  }
  if (!feedback || typeof feedback !== "string" || feedback.trim().length < 10 || feedback.trim().length > 4000) {
    throw new Error("Validation Error: 'feedback' is required and must be between 10 and 4000 characters");
  }

  if (!options.githubToken || options.githubToken.trim() === "") {
    throw new Error("Server Error: Missing GITHUB_TOKEN environment secret. Please set GITHUB_TOKEN to enable feedback issue creation.");
  }

  const validTypes = ["feedback", "bug", "feature_request", "question"];
  const feedbackType = validTypes.includes(type) ? type : "feedback";

  let userName = name ? name.trim() : "";
  let userEmail = email ? email.trim() : "";

  if (userId) {
    const user = await db.select().from(schema.users).where(eq(schema.users.userId, userId)).get();
    if (user) {
      if (!userName) userName = `${user.userFirstName} ${user.userLastName}`.trim();
      if (!userEmail) userEmail = user.userEmail;
    }
  }

  if (!userId) {
    if (!userName) {
      throw new Error("Validation Error: Submitter 'name' is required when unauthenticated");
    }
    if (!userEmail || !isValidEmail(userEmail)) {
      throw new Error("Validation Error: Submitter 'email' is required and must be a valid email when unauthenticated");
    }
  }

  const githubToken = options.githubToken;
  const githubRepo = options.githubRepo || "lutfi-zain/reedrich-mcp";

  const typeLabels: Record<string, string> = {
    feedback: "FEEDBACK",
    bug: "BUG",
    feature_request: "FEATURE REQUEST",
    question: "QUESTION",
  };

  const issueTitle = `[${typeLabels[feedbackType] || "FEEDBACK"}] ${title.trim()}`;
  const issueBody = [
    `## 📋 User Feedback Submission`,
    ``,
    `**Category:** \`${feedbackType}\``,
    `**Summary:** ${title.trim()}`,
    ``,
    `### 📝 Details / Description`,
    feedback.trim(),
    ``,
    `---`,
    `### 👤 Submitter Details`,
    `| Field | Value |`,
    `| :--- | :--- |`,
    `| **Name** | ${userName} |`,
    `| **Email** | \`${userEmail}\` |`,
    `| **User ID** | ${userId ? `\`${userId}\`` : "_Unauthenticated Guest_"} |`,
    `| **Type** | \`${feedbackType}\` |`,
    `| **Submitted At** | ${currentIsoTimestamp()} |`,
  ].join("\n");

  const labels = ["user-feedback", feedbackType];
  const issueResult = await createGithubIssue({
    token: githubToken,
    repo: githubRepo,
    title: issueTitle,
    body: issueBody,
    labels,
    fetchFn: options.fetchFn,
  });

  return {
    success: true,
    message: "Feedback submitted successfully and created as a GitHub issue!",
    issueUrl: issueResult.issueUrl,
    issueNumber: issueResult.issueNumber,
    type: feedbackType,
    submitter: {
      name: userName,
      email: userEmail,
      userId,
    },
  };
}
