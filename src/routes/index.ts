import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { resolveUserId, extractBearerToken } from "../middleware/auth";
import { ServiceError, HTTP_STATUS_MAP } from "../services/errors";
import type { AppEnv } from "../index";

import wallets from "./wallets";
import categories from "./categories";
import budgets from "./budgets";
import transactions from "./transactions";
import debtsLoans from "./debts-loans";
import goals from "./goals";
import recurringTemplates from "./recurring-templates";
import summary from "./summary";
import feedback from "./feedback";

const api = new Hono<AppEnv>();

// Scoped Auth Middleware for REST API (/api/v1/*)
api.use("*", async (c, next) => {
  const secret = c.env?.JWT_SECRET;
  const db = drizzle(c.env.DB, { schema });
  const authHeader = c.req.header("Authorization");
  const bearerToken =
    extractBearerToken(authHeader) ||
    (authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : authHeader?.trim());
  const headerKey = c.req.header("X-API-Key") || c.req.header("x-api-key");

  const userId = await resolveUserId(db, secret, {
    bearerToken,
    headerKey,
  });

  if (userId) {
    c.set("userId", userId);
  }

  // Allow anonymous submissions on /feedback only
  const path = new URL(c.req.url).pathname;
  if (!userId && !path.endsWith("/feedback")) {
    return c.json(
      { error: "UNAUTHORIZED", message: "Authentication required via Bearer token or API key" },
      401
    );
  }

  await next();
});

// Centralized error handler for REST API
api.onError((err, c) => {
  if (err instanceof ServiceError) {
    const status = (HTTP_STATUS_MAP[err.code] || 500) as 400 | 401 | 403 | 404 | 409 | 500;
    return c.json(
      { error: err.code, message: err.message, field: err.field },
      status
    );
  }
  return c.json(
    { error: "INTERNAL", message: err instanceof Error ? err.message : "Internal Server Error" },
    500
  );
});

api.route("/wallets", wallets);
api.route("/categories", categories);
api.route("/budgets", budgets);
api.route("/transactions", transactions);
api.route("/debts-loans", debtsLoans);
api.route("/goals", goals);
api.route("/recurring-templates", recurringTemplates);
api.route("/summary", summary);
api.route("/feedback", feedback);

export default api;
