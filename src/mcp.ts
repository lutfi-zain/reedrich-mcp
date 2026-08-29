import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  generateApiKey,
  generateUserId,
  generateUserToken,
  verifyUserToken,
  hashApiKey,
  isValidEmail,
  isValidWhatsApp,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
} from "./utils/token";
import {
  isValidIsoDateOrTimestamp,
  normalizeToIsoTimestamp,
  currentIsoTimestamp,
} from "./utils/date";
import { getExchangeRates, convertCurrency } from "./utils/fx";
import { calculateGoalPacing } from "./utils/goals";
import {
  calculateNextRunDate,
  projectRecurringCashflow,
  type RecurringTemplateInput,
} from "./utils/recurring";
// Helper validators
function isValidPositiveNumber(val: any): boolean {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

function isValidFiniteNumber(val: any): boolean {
  return typeof val === "number" && Number.isFinite(val);
}

function isValidUUID(id: any): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

export const DEFAULT_CATEGORIES = [
  // Expense categories
  { name: "Makanan & Minuman", type: "expense" as const, icon: "🍔" },
  { name: "Transportasi", type: "expense" as const, icon: "🚗" },
  { name: "Belanja", type: "expense" as const, icon: "🛍️" },
  { name: "Tagihan & Utilitas", type: "expense" as const, icon: "💡" },
  { name: "Hiburan", type: "expense" as const, icon: "🎬" },
  { name: "Kesehatan", type: "expense" as const, icon: "💊" },
  // Income categories
  { name: "Gaji", type: "income" as const, icon: "💼" },
  { name: "Investasi & Bunga", type: "income" as const, icon: "📈" },
  { name: "Usaha / Freelance", type: "income" as const, icon: "💻" },
  { name: "Pemasukan Lainnya", type: "income" as const, icon: "🎁" },
];

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

export type MCPOptions = {
  fetchFn?: typeof fetch;
};
export function createMCPServer(
  db: DrizzleD1Database<typeof schema>,
  userId: string | null,
  jwtSecret: string,
  options?: MCPOptions
) {
  if (!jwtSecret || typeof jwtSecret !== "string" || jwtSecret.trim() === "") {
    throw new Error("Server configuration error: JWT_SECRET is required to initialize MCP server");
  }

  // Helper to dynamically resolve user ID from HTTP headers (userId) or tool arguments (apiKey/token)
  async function resolveEffectiveUserId(args?: any): Promise<string | null> {
    if (userId) return userId;

    const candidate = args?.apiKey || args?.token;
    if (!candidate || typeof candidate !== "string") return null;
    const clean = candidate.trim();
    if (clean.length === 0) return null;

    // Case A: Persistent API Key (starts with rd_live_ or fp_live_)
    if (clean.startsWith("rd_live_") || clean.startsWith("fp_live_")) {
      try {
        const hash = await hashApiKey(clean);
        const user = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userApiKeyHash, hash)).get();
        return user ? user.userId : null;
      } catch {
        return null;
      }
    }

    // Case B: Self-Contained JWT Token
    try {
      const jwtUser = await verifyUserToken(clean, jwtSecret);
      if (jwtUser) return jwtUser.userId;
    } catch {
      // Continue to fallback
    }

    // Case C: Fallback raw API key lookup
    try {
      const hash = await hashApiKey(clean);
      const user = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userApiKeyHash, hash)).get();
      return user ? user.userId : null;
    } catch {
      return null;
    }
  }

  const server = new Server(
    { name: "reedrich-mcp", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // ---------------------------------------------------------------------------
  // 1. Resources Registry & Handlers
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "reedrich://db/schema",
        name: "Database Schema",
        mimeType: "application/json",
        description: "Returns table structures and relationship definitions for Reedrich DB."
      },
      {
        uri: "reedrich://wallets/list",
        name: "User Wallets List",
        mimeType: "application/json",
        description: "Returns current list of active wallets and balances for the authenticated user."
      },
      {
        uri: "reedrich://budgets/active",
        name: "Active Budgets Utilization",
        mimeType: "application/json",
        description: "Returns currently active budgets and calculated spending utilization."
      },
      {
        uri: "reedrich://debts/active",
        name: "Active Debts and Loans",
        mimeType: "application/json",
        description: "Returns active/unpaid debts and loans with calculated totals for the authenticated user."
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "reedrich://db/schema") {
      const schemaDef = {
        tables: {
          users: [
            "user_id (PK UUID)", "user_first_name", "user_last_name", "user_email (UNIQUE)",
            "user_whatsapp_number", "user_api_key_hash (UNIQUE)", "user_created_at"
          ],
          wallets: [
            "wallet_id (PK UUID)", "wallet_user_id (FK CASCADE)", "wallet_name", "wallet_institution",
            "wallet_type", "wallet_balance", "wallet_currency", "wallet_created_at"
          ],
          categories: [
            "category_id (PK UUID)", "category_user_id (FK CASCADE)", "category_name", "category_type",
            "category_icon", "category_created_at"
          ],
          budgets: [
            "budget_id (PK UUID)", "budget_user_id (FK CASCADE)", "budget_name", "budget_category_id (FK SET NULL)",
            "budget_amount", "budget_period_start", "budget_period_end", "budget_created_at"
          ],
          transactions: [
            "transaction_id (PK UUID)", "transaction_user_id (FK CASCADE)", "transaction_wallet_id (FK CASCADE)",
            "transaction_target_wallet_id (FK SET NULL)", "transaction_category_id (FK SET NULL)", "transaction_budget_id (FK SET NULL)",
            "transaction_amount", "transaction_admin_fee", "transaction_type", "transaction_description",
            "transaction_is_planned", "transaction_date (ISO-8601 TZ)", "transaction_created_at"
          ],
          debts_loans: [
            "debt_loan_id (PK UUID)", "debt_loan_user_id (FK CASCADE)", "debt_loan_person_name", "debt_loan_type (debt|loan)",
            "debt_loan_amount", "debt_loan_remaining_amount", "debt_loan_wallet_id (FK SET NULL)", "debt_loan_due_date",
            "debt_loan_status (unpaid|partially_paid|paid)", "debt_loan_notes", "debt_loan_created_at"
          ],
          goals: [
            "goal_id (PK UUID)", "goal_user_id (FK CASCADE)", "goal_name", "goal_target_amount", "goal_current_amount",
            "goal_currency", "goal_target_date", "goal_wallet_id (FK SET NULL)", "goal_category_id (FK SET NULL)",
            "goal_status (in_progress|completed|cancelled)", "goal_notes", "goal_created_at"
          ],
          recurring_templates: [
            "template_id (PK UUID)", "template_user_id (FK CASCADE)", "template_name", "template_wallet_id (FK CASCADE)",
            "template_target_wallet_id (FK SET NULL)", "template_category_id (FK SET NULL)", "template_amount",
            "template_admin_fee", "template_type (expense|income|transfer)", "template_frequency (daily|weekly|monthly|yearly)",
            "template_interval", "template_start_date", "template_next_run_date", "template_end_date",
            "template_is_active", "template_notes", "template_created_at"
          ]
        },
        indexes: {
          users: ["users_email_idx", "users_api_key_hash_idx"],
          wallets: ["wallets_user_id_idx", "wallets_institution_idx"],
          categories: ["categories_user_id_idx"],
          budgets: ["budgets_user_period_idx", "budgets_category_id_idx"],
          transactions: [
            "transactions_user_date_idx", "transactions_wallet_id_idx", "transactions_target_wallet_id_idx",
            "transactions_category_id_idx", "transactions_budget_id_idx"
          ],
          debts_loans: [
            "debts_loans_user_status_idx", "debts_loans_user_due_date_idx", "debts_loans_wallet_id_idx"
          ],
          goals: [
            "goals_user_status_idx", "goals_user_target_date_idx", "goals_wallet_id_idx"
          ],
          recurring_templates: [
            "recurring_templates_user_active_idx", "recurring_templates_next_run_idx", "recurring_templates_wallet_id_idx"
          ]
        }
      };
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(schemaDef, null, 2)
          }
        ]
      };
    }

    // Require authentication for user-specific resources
    const effectiveUserId = await resolveEffectiveUserId();
    if (!effectiveUserId) {
      throw new Error("Unauthorized: Session token is missing or expired. Please set 'Authorization: Bearer <apiKey>' in your MCP client headers or call 'login_user' / 'register_user'.");
    }

    if (uri === "reedrich://wallets/list") {
      const userWallets = await db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, effectiveUserId));
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(userWallets, null, 2)
          }
        ]
      };
    }

    if (uri === "reedrich://budgets/active") {
      const nowIso = currentIsoTimestamp();
      const activeBudgets = await db.select()
        .from(schema.budgets)
        .where(
          and(
            eq(schema.budgets.budgetUserId, effectiveUserId),
            lte(schema.budgets.budgetPeriodStart, nowIso),
            gte(schema.budgets.budgetPeriodEnd, nowIso)
          )
        );

      const statusList = [];
      for (const b of activeBudgets) {
        const conditions = [
          eq(schema.transactions.transactionUserId, effectiveUserId),
          eq(schema.transactions.transactionIsPlanned, 0),
          eq(schema.transactions.transactionType, "expense"),
          gte(schema.transactions.transactionDate, b.budgetPeriodStart),
          lte(schema.transactions.transactionDate, b.budgetPeriodEnd)
        ];
        if (b.budgetCategoryId) {
          conditions.push(eq(schema.transactions.transactionCategoryId, b.budgetCategoryId));
        } else {
          conditions.push(eq(schema.transactions.transactionBudgetId, b.budgetId));
        }

        const txs = await db.select().from(schema.transactions).where(and(...conditions));
        const spent = txs.reduce((sum, tx) => sum + tx.transactionAmount, 0);
        statusList.push({
          budget: b,
          spent: Number(spent.toFixed(2)),
          remaining: Number((b.budgetAmount - spent).toFixed(2)),
          percentUsed: b.budgetAmount > 0 ? Number(((spent / b.budgetAmount) * 100).toFixed(2)) : 0
        });
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(statusList, null, 2)
          }
        ]
      };
    }

    if (uri === "reedrich://debts/active") {
      const activeRecords = await db.select()
        .from(schema.debtsLoans)
        .where(
          and(
            eq(schema.debtsLoans.debtLoanUserId, effectiveUserId),
            sql`debt_loan_status != 'paid'`
          )
        )
        .orderBy(desc(schema.debtsLoans.debtLoanCreatedAt));

      let totalDebt = 0;
      let totalReceivable = 0;
      for (const r of activeRecords) {
        if (r.debtLoanType === "debt") {
          totalDebt += r.debtLoanRemainingAmount;
        } else if (r.debtLoanType === "loan") {
          totalReceivable += r.debtLoanRemainingAmount;
        }
      }

      const payload = {
        totalDebt: Number(totalDebt.toFixed(2)),
        totalReceivable: Number(totalReceivable.toFixed(2)),
        activeCount: activeRecords.length,
        items: activeRecords
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2)
          }
        ]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  // ---------------------------------------------------------------------------
  // 2. Prompts Registry & Handlers
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "onboarding_assistant",
        description: "Guide a new user through initial account setup (wallets, default categories, and optional budget).",
        arguments: [
          {
            name: "currency",
            description: "Default currency code for wallets and budgets (default: IDR)",
            required: false
          }
        ]
      },
      {
        name: "daily_briefing",
        description: "Generate a comprehensive daily financial briefing covering current balances, budget utilization, and due debts/loans.",
        arguments: [
          {
            name: "date",
            description: "Target date for the briefing in ISO format (default: today)",
            required: false
          }
        ]
      },
      {
        name: "financial_planning",
        description: "Project when a financial goal (e.g. buying a laptop) can be achieved based on current net savings and debt obligations.",
        arguments: [
          {
            name: "goal_description",
            description: "Description of the financial goal (e.g. 'beli laptop')",
            required: true
          },
          {
            name: "target_amount",
            description: "Target cost or required savings amount",
            required: true
          }
        ]
      },
      {
        name: "debt_loan_advisor",
        description: "Analyze active debts and loans, assess available cash flow, and suggest repayment priorities.",
        arguments: []
      }
    ]
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "onboarding_assistant") {
      const currency = (args?.currency as string) || "IDR";
      return {
        description: "Step-by-step guidance for user registration, wallet setup, default categories seeding, and optional budgeting in Reedrich.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Onboarding Assistant. Guide the user through setting up their financial workspace step by step:

Authentication Note: You are already authenticated via OAuth / Bearer token. Never tell the user that access is blocked or ask them to log in in the chat. Greet the user warmly and directly execute financial tools or provide financial guidance.

1. User Registration & Authentication (If Unauthenticated):
   - If the user has no account or credentials, ask for their First Name, Last Name, Email, and WhatsApp number (with country code, e.g. '+62...').
   - Invoke tool \`register_user\` with \`firstName\`, \`lastName\`, \`email\`, and \`whatsappNumber\`.
   - Save the returned \`apiKey\` ('rd_live_...') and note the \`onboarding\` status.
   - If returning user with an API key, invoke tool \`login_user\` with \`apiKey\`.

2. Check Onboarding Status:
   - Review the \`onboarding\` object from the user's registration or login response.
   - If \`onboarding.needs\` contains 'wallet', proceed to Step 3.
   - If \`onboarding.needs\` contains 'categories', proceed to Step 4.

3. Create Primary Wallet:
   - Ask the user for their primary wallet details (e.g. Cash, Bank BCA, Mandiri, GoPay) using currency '${currency}'.
   - Tool to use: \`manage_wallet\` with \`action: "create"\`, \`name\`, \`institution\`, \`type\` (bank/ewallet/cash), \`balance\`, \`currency: "${currency}"\`.

4. Default Categories Setup (User Confirmation Required):
   - Ask the user: "Would you like me to set up standard categories for you (Makanan & Minuman 🍔, Transportasi 🚗, Tagihan & Utilitas 💡, Belanja 🛍️, Gaji 💼, etc.)?"
   - If the user confirms, invoke \`manage_category\` with \`action: "seed_defaults"\`.
   - If the user prefers custom categories, create them with \`manage_category\` using \`action: "create"\`.

5. Optional Budget Setup:
   - Once at least one wallet and category exist, offer to set monthly spending budgets for key categories.
   - Remind the user that budget setup is completely optional.
   - Tool to use: \`manage_budget\` with \`action: "create"\`, \`name\`, \`categoryId\`, \`amount\`, \`periodStart\`, \`periodEnd\`.

6. Completion:
   - Confirm that the user is now ready to record daily transactions using \`record_transaction\` or transfer funds using \`transfer_funds\`.`
            }
          }
        ]
      };
    }

    if (name === "daily_briefing") {
      const targetDate = (args?.date as string) || "";
      return {
        description: "Structured instructions for compiling a daily financial briefing.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Financial Analyst. Generate a comprehensive daily financial status report for the user${targetDate ? ` for date ${targetDate}` : ""}:

Authentication Note: You are already authenticated via OAuth / Bearer token. Never tell the user that access is blocked or ask them to log in in the chat. Greet the user warmly and directly execute financial tools or provide financial guidance.

1. Retrieve Financial State:
   - Read resource \`reedrich://wallets/list\` to get all account balances and total liquid assets.
   - Read resource \`reedrich://budgets/active\` to check current budget utilization and remaining limits.
   - Read resource \`reedrich://debts/active\` to check upcoming debt and loan obligations.
   - Call tool \`financial_summary\` with startDate and endDate${targetDate ? ` around ${targetDate}` : ""} to inspect cash flow (income vs expenses).

2. Analyze & Synthesize:
   - Total Net Worth & Liquid Balance across all institutions.
   - Spending health: highlight any budgets near or over 100% utilization.
   - Upcoming commitments: flag any debts or loans due soon.
   - Cash flow overview: income earned vs expenses incurred.

3. Deliver Briefing:
   - Provide a clear, structured markdown summary with actionable takeaways and positive reinforcement.`
            }
          }
        ]
      };
    }

    if (name === "financial_planning") {
      const goalDescription = (args?.goal_description as string) || "";
      const targetAmount = args?.target_amount;
      const hasCompleteArgs = Boolean(goalDescription && targetAmount !== undefined && targetAmount !== null);

      return {
        description: "Reasoning framework for projecting when a financial goal can be achieved.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Financial Planning Advisor. Help the user project when they can achieve their financial goal with mathematical precision:

Authentication Note: You are already authenticated via OAuth / Bearer token. Never tell the user that access is blocked or ask them to log in in the chat. Greet the user warmly and directly execute financial tools or provide financial guidance.

Goal: ${goalDescription || "[Not specified - ask user]"}
Target Amount: ${targetAmount !== undefined && targetAmount !== null ? targetAmount : "[Not specified - ask user]"}

${!hasCompleteArgs ? `NOTE: The user has not provided complete goal details (goal description or target amount). First ask the user what item/goal they want to achieve and the estimated target cost before calculating.` : ""}

Reasoning & Calculation Workflow:
1. Gather Financial Profile:
   - Call \`financial_summary\` to determine the user's historical monthly income, monthly expenses, and net savings rate (Net Savings = Total Income - Total Expenses).
   - Read \`reedrich://wallets/list\` to evaluate available idle savings that can be allocated toward this goal.
   - Read \`reedrich://debts/active\` to factor in monthly debt repayment obligations that reduce disposable savings.

2. Compute Timeline Projection:
   - Effective Monthly Savings Capacity = Average Net Monthly Savings - Monthly Debt Obligations.
   - Remaining Funding Gap = Target Amount - Allocatable Existing Balance.
   - If Effective Monthly Savings Capacity <= 0:
     * Explain that current expenses exceed or equal income, and suggest expense optimization areas before saving for this goal.
   - If Effective Monthly Savings Capacity > 0:
     * Estimated Months = Math.ceil(Remaining Funding Gap / Effective Monthly Savings Capacity).
     * Calculate the projected target completion month and year starting from the current date.

3. Present Financial Plan:
   - State the target month and year clearly (e.g. "Estimasi: sekitar bulan Maret 2027").
   - Breakdown the numbers: Current Savings Allocated, Monthly Savings Target, Remaining Gap.
   - Provide 2-3 practical tips on how cutting discretionary expenses could accelerate the timeline.`
            }
          }
        ]
      };
    }

    if (name === "debt_loan_advisor") {
      return {
        description: "Strategy and prioritization guide for managing personal debts and loans.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Debt & Loan Advisor. Help the user manage and optimize their liabilities and receivables:

Authentication Note: You are already authenticated via OAuth / Bearer token. Never tell the user that access is blocked or ask them to log in in the chat. Greet the user warmly and directly execute financial tools or provide financial guidance.

1. Retrieve Active Commitments:
   - Read resource \`reedrich://debts/active\` to get aggregate total debt and total receivable.
   - Call tool \`manage_debt_loan\` with \`action: "list"\` to get all individual debt and loan records.
   - Call tool \`financial_summary\` to understand monthly disposable cash flow.

2. Prioritization & Strategy:
   - Debts (Payables / Kewajiban):
     1. Overdue debts (past dueDate) require immediate action.
     2. Upcoming debts sorted by nearest due date.
     3. High-balance debts.
   - Loans (Receivables / Piutang):
     1. Overdue loans where follow-up / gentle reminder with counterparty is needed.
     2. Upcoming expected repayments.

3. Actionable Recommendations:
   - Present a clear prioritization schedule.
   - For repaying debts: suggest allocating a specific percentage of monthly disposable savings to clear debts faster using \`manage_debt_loan(action: "repay")\`.
   - For collecting loans: suggest checking in with counterparties whose due dates have passed.`
            }
          }
        ]
      };
    }

    throw new Error(`Prompt '${name}' not found`);
  });

  // ---------------------------------------------------------------------------
  // 3. Tools Registry
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Authentication Tools
      {
        name: "register_user",
        description: "Register a new user account with first name, last name, email, and WhatsApp number. NOTE: If the user is already authenticated via OAuth / HTTP Bearer, do NOT call this tool.",
        inputSchema: {
          type: "object",
          properties: {
            firstName: { type: "string", description: "User's first name (1-100 characters)" },
            lastName: { type: "string", description: "User's last name (1-100 characters)" },
            email: { type: "string", description: "Valid email address (e.g. user@example.com)" },
            whatsappNumber: { type: "string", description: "WhatsApp phone number with '+' and country code (e.g. +6281234567890)" }
          },
          required: ["firstName", "lastName", "email", "whatsappNumber"]
        }
      },
      {
        name: "login_user",
        description: "Authenticate with your persistent API Key (rd_live_...). NOTE: When connected via OAuth or HTTP Bearer token, you are ALREADY fully authenticated with ambient session access—do NOT call this tool and do NOT ask the user to log in.",
        inputSchema: {
          type: "object",
          properties: {
            apiKey: { type: "string", description: "Your persistent API Key (e.g. rd_live_...)" }
          },
          required: ["apiKey"]
        }
      },
      // Feedback & Support Tool
      {
        name: "submit_feedback",
        description: "Submit user feedback, feature request, question, or bug report directly to the internal database. Automatically logs submitter identity when authenticated.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short summary of feedback or issue (5-200 characters)" },
            content: { type: "string", description: "Detailed feedback, bug description, or feature request (10-4000 characters)" },
            feedback: { type: "string", description: "Alias for 'content' (10-4000 characters)" },
            type: {
              type: "string",
              enum: ["feedback", "bug", "feature_request", "question"],
              default: "feedback",
              description: "Category of feedback: feedback, bug, feature_request, or question"
            },
            name: { type: "string", description: "Optional: Submitter's full name (auto-resolved from profile if authenticated)" },
            email: { type: "string", description: "Optional: Submitter's email address (auto-resolved from profile if authenticated)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          },
          required: ["title"]
        }
      },
      // Finance Tools (Authenticated with Persistent API Key or JWT)
      {
        name: "record_transaction",
        description: "Record a financial transaction (expense or income) with optional admin fee and ISO timezone timestamp. Automatically and atomically updates wallet balance.",
        inputSchema: {
          type: "object",
          properties: {
            walletId: { type: "string", description: "Target Wallet UUID" },
            categoryId: { type: "string", description: "Target Category UUID" },
            budgetId: { type: "string", description: "Optional: Linked Budget UUID" },
            amount: { type: "number", minimum: 0.01, description: "Transaction amount (positive finite number)" },
            adminFee: { type: "number", minimum: 0, default: 0, description: "Optional administrative or transaction fee" },
            type: { type: "string", enum: ["expense", "income"], default: "expense" },
            description: { type: "string", description: "Transaction note or description (max 500 characters)" },
            isPlanned: { type: "boolean", default: false, description: "Set true for projected transactions without altering balance" },
            transactionDate: { type: "string", description: "ISO-8601 timestamp with timezone (e.g. 2026-08-17T10:31:42+07:00 or YYYY-MM-DD). Defaults to now." },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["walletId", "categoryId", "amount"]
        }
      },
      {
        name: "transfer_funds",
        description: "Transfer funds between two wallets with optional admin fee. Atomically debits source wallet (amount + adminFee) and credits target wallet (amount).",
        inputSchema: {
          type: "object",
          properties: {
            sourceWalletId: { type: "string", description: "Source / Sender Wallet UUID" },
            targetWalletId: { type: "string", description: "Destination / Receiver Wallet UUID" },
            amount: { type: "number", minimum: 0.01, description: "Transfer amount (positive finite number)" },
            adminFee: { type: "number", minimum: 0, default: 0, description: "Optional administrative / transfer fee (e.g. 2500, 6500)" },
            categoryId: { type: "string", description: "Optional Category UUID" },
            description: { type: "string", description: "Transfer note or memo (max 500 characters)" },
            isPlanned: { type: "boolean", default: false, description: "Set true for projected transfers without altering balance" },
            transactionDate: { type: "string", description: "ISO-8601 timestamp with timezone (e.g. 2026-08-17T10:31:42+07:00 or YYYY-MM-DD). Defaults to now." },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["sourceWalletId", "targetWalletId", "amount"]
        }
      },
      {
        name: "update_transaction",
        description: "Update an existing transaction (amount, admin fee, wallet, category, budget, date, note, or planned status) with automatic atomic balance reconciliation.",
        inputSchema: {
          type: "object",
          properties: {
            transactionId: { type: "string", description: "Transaction UUID to update" },
            amount: { type: "number", minimum: 0.01, description: "New transaction amount" },
            adminFee: { type: "number", minimum: 0, description: "New admin fee" },
            walletId: { type: "string", description: "New Source Wallet UUID" },
            targetWalletId: { type: "string", description: "New Target Wallet UUID (for transfers)" },
            categoryId: { type: "string", description: "New Category UUID" },
            budgetId: { type: "string", description: "New Budget UUID (or empty string/null to unlink)" },
            description: { type: "string", description: "New description (max 500 characters)" },
            transactionDate: { type: "string", description: "New ISO-8601 timestamp with timezone (e.g. 2026-08-17T10:31:42+07:00)" },
            isPlanned: { type: "boolean", description: "New planned status" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["transactionId"]
        }
      },
      {
        name: "manage_wallet",
        description: "Create, list, or update wallets. PROACTIVE TIP: For new accounts without wallets, call with action: 'create' to initialize the primary wallet (e.g. BCA, Cash).",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "update"], description: "Action to perform" },
            name: { type: "string", description: "Wallet / Pocket name (1-100 characters)" },
            institution: { type: "string", description: "Bank or Platform institution (e.g. 'BCA', 'Bank Jago', 'Bitget', 'OCBC', 'Cash')" },
            type: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"], description: "Wallet type" },
            balance: { type: "number", description: "Initial balance or updated balance (finite number)" },
            currency: { type: "string", default: "IDR", description: "Currency code (e.g. IDR, USD, USDT)" },
            walletId: { type: "string", description: "Required for update action (Wallet UUID)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "manage_category",
        description: "Manage categories: list existing categories, create a new category, or seed standard default categories.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "seed_defaults"], description: "Action to perform" },
            name: { type: "string", description: "Category name (1-100 characters, required for create)" },
            type: { type: "string", enum: ["expense", "income"], default: "expense" },
            icon: { type: "string", description: "Emoji icon representation (max 10 characters)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "manage_budget",
        description: "Manage financial budgets with active date windows. Create, list, or check budget status vs actual spending.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "status"], description: "Action to perform" },
            name: { type: "string", description: "Budget title (1-100 characters)" },
            categoryId: { type: "string", description: "Optional category filter UUID" },
            amount: { type: "number", minimum: 0.01, description: "Budget target limit amount (positive finite number)" },
            periodStart: { type: "string", description: "Start ISO-8601 date or timestamp with timezone" },
            periodEnd: { type: "string", description: "End ISO-8601 date or timestamp with timezone" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "list_transactions",
        description: "Query transactions with structured filters (wallet, target wallet, category, budget, type, date range, is_planned, pagination).",
        inputSchema: {
          type: "object",
          properties: {
            walletId: { type: "string", description: "Wallet UUID filter" },
            targetWalletId: { type: "string", description: "Target Wallet UUID filter (for transfers)" },
            categoryId: { type: "string", description: "Category UUID filter" },
            budgetId: { type: "string", description: "Budget UUID filter" },
            type: { type: "string", enum: ["expense", "income", "transfer"] },
            isPlanned: { type: "boolean" },
            startDate: { type: "string", description: "Start ISO-8601 date/timestamp filter" },
            endDate: { type: "string", description: "End ISO-8601 date/timestamp filter" },
            limit: { type: "integer", default: 50, maximum: 200 },
            offset: { type: "integer", default: 0, minimum: 0 },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (fp_live_...) if not set in headers" }
          }
        }
      },
      {
        name: "financial_summary",
        description: "Generate a complete financial overview (net worth by currency, consolidated net worth, cash flow, active goals pacing, recurring cashflow projections, wallets, debts). PROACTIVE TIP: Always call this first when starting a session or financial planning to inspect current account state.",
        inputSchema: {
          type: "object",
          properties: {
            startDate: { type: "string", description: "Start date filter" },
            endDate: { type: "string", description: "End date filter" },
            baseCurrency: { type: "string", description: "Optional base currency override for consolidated net worth (e.g. IDR, USD, EUR, SGD)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          }
        }
      },
      {
        name: "manage_debt_loan",
        description: "Manage personal debts (liabilities/payable) and loans (receivables). Create debt/loan, list with filters, record repayments (full/partial), or update details.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "list", "repay", "update"], description: "Action to perform" },
            debtLoanId: { type: "string", description: "Debt/Loan UUID (required for repay and update)" },
            type: { type: "string", enum: ["debt", "loan"], description: "Type: 'debt' (we owe) or 'loan' (counterparty owes us)" },
            personName: { type: "string", description: "Counterparty person/institution name (1-100 chars)" },
            amount: { type: "number", minimum: 0.01, description: "Principal amount for create, or repayment amount for repay (positive finite number)" },
            walletId: { type: "string", description: "Wallet UUID to fund/credit (optional for create, required for repay when adjusting wallet balance)" },
            dueDate: { type: "string", description: "Due date in ISO format (YYYY-MM-DD or ISO-8601 timestamp)" },
            notes: { type: "string", description: "Optional notes/description (max 500 chars)" },
            status: { type: "string", enum: ["unpaid", "partially_paid", "paid"], description: "Status filter for list action" },
            adjustWalletBalance: { type: "boolean", default: true, description: "Whether to update wallet balance on create/repay (default true)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "manage_goal",
        description: "Manage personal financial goals: create, list, update, contribute funds, or delete goals with automated pacing calculations.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "list", "update", "contribute", "delete"], description: "Action to perform" },
            goalId: { type: "string", description: "Goal UUID (required for update, contribute, and delete)" },
            name: { type: "string", description: "Goal name (1-100 characters, required for create)" },
            targetAmount: { type: "number", minimum: 0.01, description: "Target savings amount (positive finite number)" },
            currentAmount: { type: "number", minimum: 0, description: "Initial or updated current amount saved" },
            currency: { type: "string", default: "IDR", description: "Currency code (e.g. IDR, USD)" },
            targetDate: { type: "string", description: "Target completion date (YYYY-MM-DD)" },
            walletId: { type: "string", description: "Optional linked wallet UUID" },
            categoryId: { type: "string", description: "Optional category UUID" },
            status: { type: "string", enum: ["in_progress", "completed", "cancelled"], description: "Goal status" },
            notes: { type: "string", description: "Optional notes (max 500 chars)" },
            amount: { type: "number", minimum: 0.01, description: "Contribution amount (required for contribute action)" },
            adjustWalletBalance: { type: "boolean", default: false, description: "Whether to deduct contribution amount from linked/provided wallet (default false)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "manage_recurring_template",
        description: "Manage recurring transaction templates: create, list, update, or deactivate recurring schedules for expenses, incomes, or transfers.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "list", "update", "delete"], description: "Action to perform" },
            templateId: { type: "string", description: "Template UUID (required for update and delete)" },
            name: { type: "string", description: "Template title/name (1-100 chars, required for create)" },
            walletId: { type: "string", description: "Source wallet UUID (required for create)" },
            targetWalletId: { type: "string", description: "Target wallet UUID (required for transfer type)" },
            categoryId: { type: "string", description: "Category UUID" },
            amount: { type: "number", minimum: 0.01, description: "Transaction amount per occurrence" },
            adminFee: { type: "number", minimum: 0, description: "Admin fee per occurrence (default 0)" },
            type: { type: "string", enum: ["expense", "income", "transfer"], default: "expense", description: "Transaction type" },
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], default: "monthly", description: "Recurrence frequency" },
            interval: { type: "integer", minimum: 1, default: 1, description: "Recurrence interval (e.g. 1 = every month, 2 = every 2 months)" },
            startDate: { type: "string", description: "Start date (YYYY-MM-DD, required for create)" },
            nextRunDate: { type: "string", description: "Next scheduled execution date (YYYY-MM-DD)" },
            endDate: { type: "string", description: "Optional expiration end date (YYYY-MM-DD)" },
            isActive: { type: "boolean", default: true, description: "Whether the template is active" },
            notes: { type: "string", description: "Optional notes/description (max 500 chars)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          },
          required: ["action"]
        }
      },
      {
        name: "apply_recurring_template",
        description: "Apply a recurring template to immediately instantiate an actual transaction, atomically adjust wallet balance, and advance the next run date.",
        inputSchema: {
          type: "object",
          properties: {
            templateId: { type: "string", description: "Template UUID to apply" },
            executionDate: { type: "string", description: "Optional transaction date override (defaults to template nextRunDate)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" }
          },
          required: ["templateId"]
        }
      }
    ]
  }));

  // ---------------------------------------------------------------------------
  // 3. Tools Execution Handler
  // ---------------------------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // --- Tool: register_user ---
    if (name === "register_user") {
      const { firstName, lastName, email, whatsappNumber } = (args || {}) as any;

      if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0 || firstName.trim().length > 100) {
        throw new Error("Validation Error: 'firstName' is required and must be between 1 and 100 characters");
      }
      if (!lastName || typeof lastName !== "string" || lastName.trim().length === 0 || lastName.trim().length > 100) {
        throw new Error("Validation Error: 'lastName' is required and must be between 1 and 100 characters");
      }
      if (!isValidEmail(email) || (typeof email === "string" && email.length > 255)) {
        throw new Error("Validation Error: Invalid email format. Please provide a valid email (e.g. user@example.com)");
      }
      if (!isValidWhatsApp(whatsappNumber)) {
        throw new Error("Validation Error: Invalid WhatsApp number format. Must start with '+' followed by country code and 6-14 digits (e.g. +6281234567890)");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db.select().from(schema.users).where(eq(schema.users.userEmail, normalizedEmail)).get();
      if (existing) {
        throw new Error(`Registration Error: Email '${normalizedEmail}' is already registered. Please login with your API key using the 'login_user' tool.`);
      }

      // Secure server-side user ID (UUID V4 based)
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
        userCreatedAt: nowIso
      });

      const token = await generateUserToken({
        userId: newUserId,
        name: fullName,
        email: normalizedEmail,
        expiresInSeconds: DEFAULT_TOKEN_EXPIRY_SECONDS
      }, jwtSecret);

      const onboarding = await evaluateOnboarding(db, newUserId);

      const responsePayload = {
        userId: newUserId,
        name: fullName,
        email: normalizedEmail,
        whatsappNumber: cleanWhatsApp,
        apiKey,
        token,
        tokenType: "Bearer",
        expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
        onboarding,
        message: "Registration successful! Please set 'Authorization: Bearer <token>' in your MCP client headers for subsequent finance tool calls. Save your apiKey to login again via 'login_user' when your 15-minute token expires."
      };

      return { content: [{ type: "text", text: JSON.stringify(responsePayload, null, 2) }] };
    }

    // --- Tool: login_user ---
    if (name === "login_user") {
      const { apiKey } = (args || {}) as any;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
        throw new Error("Validation Error: 'apiKey' is required for login_user");
      }

      const cleanKey = apiKey.trim();
      const apiKeyHash = await hashApiKey(cleanKey);
      const user = await db.select().from(schema.users).where(eq(schema.users.userApiKeyHash, apiKeyHash)).get();
      if (!user) {
        throw new Error("Authentication Error: Invalid API Key. User not found. Please verify your API Key or register via 'register_user'.");
      }

      const fullName = `${user.userFirstName} ${user.userLastName}`.trim();
      const token = await generateUserToken({
        userId: user.userId,
        name: fullName,
        email: user.userEmail,
        expiresInSeconds: DEFAULT_TOKEN_EXPIRY_SECONDS
      }, jwtSecret);

      const onboarding = await evaluateOnboarding(db, user.userId);

      const responsePayload = {
        userId: user.userId,
        name: fullName,
        email: user.userEmail,
        token,
        tokenType: "Bearer",
        expiresIn: DEFAULT_TOKEN_EXPIRY_SECONDS,
        onboarding,
        message: "Login successful! Please update 'Authorization: Bearer <token>' in your MCP client headers for subsequent tool calls."
      };

      return { content: [{ type: "text", text: JSON.stringify(responsePayload, null, 2) }] };
    }

    // --- Tool: submit_feedback ---
    if (name === "submit_feedback") {
      const { title, feedback, content, type = "feedback", name: submitterName, email: submitterEmail } = (args || {}) as any;
      const feedbackContent = (content || feedback) as string | undefined;

      if (!title || typeof title !== "string" || title.trim().length < 5 || title.trim().length > 200) {
        throw new Error("Validation Error: 'title' is required (5-200 characters)");
      }
      if (!feedbackContent || typeof feedbackContent !== "string" || feedbackContent.trim().length < 10 || feedbackContent.trim().length > 4000) {
        throw new Error("Validation Error: 'content' or 'feedback' is required (10-4000 characters)");
      }

      const validTypes = ["feedback", "bug", "feature_request", "question"];
      if (!validTypes.includes(type)) {
        throw new Error(`Validation Error: 'type' must be one of: ${validTypes.join(", ")}`);
      }
      const feedbackType = type;

      let foundUserId: string | null = null;
      let userName = submitterName && typeof submitterName === "string" && submitterName.trim().length > 0 ? submitterName.trim() : null;
      let userEmail = submitterEmail && typeof submitterEmail === "string" && submitterEmail.trim().length > 0 ? submitterEmail.trim().toLowerCase() : null;

      const effectiveUserId = await resolveEffectiveUserId(args);
      if (effectiveUserId) {
        foundUserId = effectiveUserId;
        const user = await db.select().from(schema.users).where(eq(schema.users.userId, effectiveUserId)).get();
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
        throw new Error("Validation Error: Submitter 'name' is required when unauthenticated. Please provide 'name' in arguments or authenticate with your API key.");
      }
      if (!userEmail || !isValidEmail(userEmail)) {
        throw new Error(`Validation Error: A valid 'email' is required. Received: '${userEmail || ""}'. Please provide a valid email or authenticate with your API key.`);
      }

      const newFeedbackId = crypto.randomUUID();
      const now = currentIsoTimestamp();

      await db.insert(schema.feedbacks).values({
        feedbackId: newFeedbackId,
        feedbackUserId: foundUserId,
        feedbackTitle: title.trim(),
        feedbackContent: feedbackContent.trim(),
        feedbackType: feedbackType,
        feedbackSubmitterName: userName,
        feedbackSubmitterEmail: userEmail,
        feedbackStatus: "new",
        feedbackCreatedAt: now
      }).run();

      const responsePayload = {
        success: true,
        message: "Feedback submitted successfully and saved to internal database!",
        feedbackId: newFeedbackId,
        type: feedbackType,
        status: "new",
        submitter: {
          name: userName,
          email: userEmail,
          userId: foundUserId
        },
        submittedAt: now
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(responsePayload, null, 2)
          }
        ]
      };
    }

    // -------------------------------------------------------------------------
    // Guard: Require Authentication for All Finance Tools Below
    // -------------------------------------------------------------------------
    const effectiveUserId = await resolveEffectiveUserId(args);
    if (!effectiveUserId) {
      throw new Error("Unauthorized: Please provide your 'apiKey' in tool arguments (e.g. apiKey: 'fp_live_...'), or set 'Authorization: Bearer <apiKey>' in your MCP client headers, or call 'register_user' to create an account.");
    }

    // Helper for atomic wallet balance updates & reconciliations
    const applyBalanceDelta = async (
      txType: string,
      wId: string,
      targetWId: string | null,
      amt: number,
      fee: number,
      multiplier: 1 | -1
    ) => {
      if (txType === "expense") {
        const delta = -(amt + fee) * multiplier;
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${delta}` })
          .where(and(eq(schema.wallets.walletId, wId), eq(schema.wallets.walletUserId, effectiveUserId)));
      } else if (txType === "income") {
        const delta = (amt - fee) * multiplier;
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${delta}` })
          .where(and(eq(schema.wallets.walletId, wId), eq(schema.wallets.walletUserId, effectiveUserId)));
      } else if (txType === "transfer" && targetWId) {
        const sourceDelta = -(amt + fee) * multiplier;
        const targetDelta = amt * multiplier;
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${sourceDelta}` })
          .where(and(eq(schema.wallets.walletId, wId), eq(schema.wallets.walletUserId, effectiveUserId)));
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${targetDelta}` })
          .where(and(eq(schema.wallets.walletId, targetWId), eq(schema.wallets.walletUserId, effectiveUserId)));
      }
    };

    // --- Tool: manage_wallet ---
    if (name === "manage_wallet") {
      const { action, name: walletName, institution, type, balance, currency, walletId } = (args || {}) as any;
      
      if (action === "list") {
        const result = await db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, effectiveUserId));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      if (action === "create") {
        if (!walletName || typeof walletName !== "string" || walletName.trim().length === 0 || walletName.trim().length > 100) {
          throw new Error("Validation Error: Wallet 'name' is required (1-100 characters)");
        }
        const allowedTypes = ["bank", "cash", "e-wallet", "credit", "crypto", "investment"];
        const cleanType = type && allowedTypes.includes(type) ? type : "bank";
        const cleanBalance = isValidFiniteNumber(balance) ? balance : 0;
        const cleanCurrency = currency && typeof currency === "string" && currency.trim().length > 0 && currency.trim().length <= 10
          ? currency.trim().toUpperCase()
          : "IDR";
        const cleanInstitution = institution && typeof institution === "string" && institution.trim().length > 0
          ? institution.trim()
          : "General";

        const newWalletId = crypto.randomUUID();
        const nowIso = currentIsoTimestamp();
        const result = await db.insert(schema.wallets).values({
          walletId: newWalletId,
          walletUserId: effectiveUserId,
          walletName: walletName.trim(),
          walletInstitution: cleanInstitution,
          walletType: cleanType,
          walletBalance: cleanBalance,
          walletCurrency: cleanCurrency,
          walletCreatedAt: nowIso
        }).returning();
        return { content: [{ type: "text", text: JSON.stringify(result[0], null, 2) }] };
      }
      
      if (action === "update") {
        if (!isValidUUID(walletId)) {
          throw new Error("Validation Error: Valid string 'walletId' (UUID) is required for update action");
        }
        const cleanWalletId = walletId.trim();
        const existing = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
        if (!existing) {
          throw new Error(`Wallet ID ${cleanWalletId} not found or unauthorized`);
        }

        const updates: any = {};
        if (walletName && typeof walletName === "string" && walletName.trim().length > 0 && walletName.trim().length <= 100) {
          updates.walletName = walletName.trim();
        }
        if (institution && typeof institution === "string" && institution.trim().length > 0) {
          updates.walletInstitution = institution.trim();
        }
        if (balance !== undefined) {
          if (!isValidFiniteNumber(balance)) {
            throw new Error("Validation Error: 'balance' must be a valid finite number");
          }
          updates.walletBalance = balance;
        }
        if (type && ["bank", "cash", "e-wallet", "credit", "crypto", "investment"].includes(type)) {
          updates.walletType = type;
        }
        if (currency && typeof currency === "string" && currency.trim().length > 0 && currency.trim().length <= 10) {
          updates.walletCurrency = currency.trim().toUpperCase();
        }

        const result = await db.update(schema.wallets)
          .set(updates)
          .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId)))
          .returning();
        return { content: [{ type: "text", text: JSON.stringify(result[0], null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_wallet. Valid actions: list, create, update`);
    }

    // --- Tool: manage_category ---
    if (name === "manage_category") {
      const { action, name: catName, type, icon } = (args || {}) as any;
      
      if (action === "list") {
        const result = await db.select().from(schema.categories).where(eq(schema.categories.categoryUserId, effectiveUserId));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      if (action === "create") {
        if (!catName || typeof catName !== "string" || catName.trim().length === 0 || catName.trim().length > 100) {
          throw new Error("Validation Error: Category 'name' is required (1-100 characters)");
        }
        const cleanIcon = icon && typeof icon === "string" && icon.trim().length <= 10 ? icon.trim() : null;
        const newCategoryId = crypto.randomUUID();
        const nowIso = currentIsoTimestamp();

        const result = await db.insert(schema.categories).values({
          categoryId: newCategoryId,
          categoryUserId: effectiveUserId,
          categoryName: catName.trim(),
          categoryType: type === "income" ? "income" : "expense",
          categoryIcon: cleanIcon,
          categoryCreatedAt: nowIso
        }).returning();
        return { content: [{ type: "text", text: JSON.stringify(result[0], null, 2) }] };
      }

      if (action === "seed_defaults") {
        const existing = await db.select().from(schema.categories).where(eq(schema.categories.categoryUserId, effectiveUserId));
        const existingNames = new Set(existing.map(c => c.categoryName.trim().toLowerCase()));

        const toCreate = DEFAULT_CATEGORIES.filter(c => !existingNames.has(c.name.trim().toLowerCase()));
        const createdCategories: any[] = [];
        const nowIso = currentIsoTimestamp();

        for (const cat of toCreate) {
          const newCategoryId = crypto.randomUUID();
          const [inserted] = await db.insert(schema.categories).values({
            categoryId: newCategoryId,
            categoryUserId: effectiveUserId,
            categoryName: cat.name,
            categoryType: cat.type,
            categoryIcon: cat.icon,
            categoryCreatedAt: nowIso
          }).returning();
          createdCategories.push(inserted);
        }

        const skippedCount = DEFAULT_CATEGORIES.length - toCreate.length;
        const responseData = {
          message: `Seeded ${createdCategories.length} default categories (${skippedCount} skipped due to existing names).`,
          createdCount: createdCategories.length,
          skippedCount,
          categories: createdCategories
        };

        return { content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_category. Valid actions: list, create, seed_defaults`);
    }

    // --- Tool: manage_budget ---
    if (name === "manage_budget") {
      const { action, name: budgetName, categoryId, amount, periodStart, periodEnd } = (args || {}) as any;
      
      if (action === "list") {
        const result = await db.select().from(schema.budgets).where(eq(schema.budgets.budgetUserId, effectiveUserId));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      
      if (action === "create") {
        if (!budgetName || typeof budgetName !== "string" || budgetName.trim().length === 0 || budgetName.trim().length > 100) {
          throw new Error("Validation Error: Budget 'name' is required (1-100 characters)");
        }
        if (!isValidPositiveNumber(amount)) {
          throw new Error("Validation Error: Budget 'amount' must be a positive finite number");
        }
        if (!isValidIsoDateOrTimestamp(periodStart) || !isValidIsoDateOrTimestamp(periodEnd)) {
          throw new Error("Validation Error: 'periodStart' and 'periodEnd' must be valid ISO dates or timestamps (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)");
        }
        const cleanStart = normalizeToIsoTimestamp(periodStart);
        const cleanEnd = normalizeToIsoTimestamp(periodEnd);
        if (cleanStart > cleanEnd) {
          throw new Error("Validation Error: 'periodStart' cannot be after 'periodEnd'");
        }

        let cleanCategoryId: string | null = null;
        if (categoryId) {
          if (!isValidUUID(categoryId)) {
            throw new Error("Validation Error: 'categoryId' must be a valid string (UUID)");
          }
          const targetCatId = (categoryId as string).trim();
          const category = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, targetCatId), eq(schema.categories.categoryUserId, effectiveUserId))).get();
          if (!category) {
            throw new Error(`Category ID ${targetCatId} not found or unauthorized`);
          }
          cleanCategoryId = targetCatId;
        }

        const newBudgetId = crypto.randomUUID();
        const nowIso = currentIsoTimestamp();
        const result = await db.insert(schema.budgets).values({
          budgetId: newBudgetId,
          budgetUserId: effectiveUserId,
          budgetName: budgetName.trim(),
          budgetCategoryId: cleanCategoryId,
          budgetAmount: amount,
          budgetPeriodStart: cleanStart,
          budgetPeriodEnd: cleanEnd,
          budgetCreatedAt: nowIso
        }).returning();
        return { content: [{ type: "text", text: JSON.stringify(result[0], null, 2) }] };
      }
      
      if (action === "status") {
        const budgets = await db.select().from(schema.budgets).where(eq(schema.budgets.budgetUserId, effectiveUserId));
        const statusList = [];
        for (const b of budgets) {
          const conditions = [
            eq(schema.transactions.transactionUserId, effectiveUserId),
            eq(schema.transactions.transactionIsPlanned, 0),
            eq(schema.transactions.transactionType, "expense"),
            gte(schema.transactions.transactionDate, b.budgetPeriodStart),
            lte(schema.transactions.transactionDate, b.budgetPeriodEnd)
          ];
          if (b.budgetCategoryId) {
            conditions.push(eq(schema.transactions.transactionCategoryId, b.budgetCategoryId));
          } else {
            conditions.push(eq(schema.transactions.transactionBudgetId, b.budgetId));
          }

          const txs = await db.select().from(schema.transactions).where(and(...conditions));
          const spent = txs.reduce((sum, tx) => sum + tx.transactionAmount, 0);
          statusList.push({
            budget: b,
            spent: Number(spent.toFixed(2)),
            remaining: Number((b.budgetAmount - spent).toFixed(2)),
            percentUsed: b.budgetAmount > 0 ? Number(((spent / b.budgetAmount) * 100).toFixed(2)) : 0
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(statusList, null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_budget. Valid actions: list, create, status`);
    }

    // --- Tool: record_transaction ---
    if (name === "record_transaction") {
      const [walletCheck] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.wallets)
        .where(eq(schema.wallets.walletUserId, effectiveUserId));
      if (Number(walletCheck?.count || 0) === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Dompet belum tersedia.",
              actionRequired: "auto_create_wallet",
              instruction: "Buat dompet terlebih dahulu dengan manage_wallet(action: 'create', name: '...') dan pasang kategori default dengan manage_category(action: 'seed_defaults'), lalu catat transaksi ini."
            }, null, 2)
          }],
          isError: true
        };
      }

      const { walletId, categoryId, budgetId, amount, adminFee, type, description, isPlanned, transactionDate } = (args || {}) as any;
      
      if (!isValidPositiveNumber(amount)) {
        throw new Error("Validation Error: Transaction 'amount' must be a positive finite number greater than 0");
      }
      if (!isValidUUID(walletId)) {
        throw new Error("Validation Error: Valid string 'walletId' (UUID) is required");
      }
      if (!isValidUUID(categoryId)) {
        throw new Error("Validation Error: Valid string 'categoryId' (UUID) is required");
      }
      if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
        throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
      }
      if (transactionDate && !isValidIsoDateOrTimestamp(transactionDate)) {
        throw new Error("Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
      }
      if (description && (typeof description !== "string" || description.length > 500)) {
        throw new Error("Validation Error: 'description' cannot exceed 500 characters");
      }

      const cleanWalletId = walletId.trim();
      const cleanCategoryId = categoryId.trim();
      const cleanAdminFee = isValidFiniteNumber(adminFee) && adminFee >= 0 ? adminFee : 0;
      const txType = type === "income" ? "income" : "expense";

      const wallet = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
      if (!wallet) throw new Error(`Wallet ID ${cleanWalletId} not found or unauthorized`);

      const category = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, cleanCategoryId), eq(schema.categories.categoryUserId, effectiveUserId))).get();
      if (!category) throw new Error(`Category ID ${cleanCategoryId} not found or unauthorized`);

      let cleanBudgetId: string | null = null;
      if (budgetId) {
        if (!isValidUUID(budgetId)) {
          throw new Error("Validation Error: 'budgetId' must be a valid string (UUID)");
        }
        const targetBudgetId = (budgetId as string).trim();
        const budget = await db.select().from(schema.budgets).where(and(eq(schema.budgets.budgetId, targetBudgetId), eq(schema.budgets.budgetUserId, effectiveUserId))).get();
        if (!budget) throw new Error(`Budget ID ${targetBudgetId} not found or unauthorized`);
        cleanBudgetId = targetBudgetId;
      }

      const dateStr = normalizeToIsoTimestamp(transactionDate);
      const isPlannedInt = isPlanned ? 1 : 0;
      const newTransactionId = crypto.randomUUID();
      const nowIso = currentIsoTimestamp();

      const tx = await db.insert(schema.transactions).values({
        transactionId: newTransactionId,
        transactionUserId: effectiveUserId,
        transactionWalletId: cleanWalletId,
        transactionCategoryId: cleanCategoryId,
        transactionBudgetId: cleanBudgetId,
        transactionAmount: amount,
        transactionAdminFee: cleanAdminFee,
        transactionType: txType,
        transactionDescription: description ? description.trim() : null,
        transactionIsPlanned: isPlannedInt,
        transactionDate: dateStr,
        transactionCreatedAt: nowIso
      }).returning();

      // Atomic wallet balance update for actual transactions (isPlanned == 0)
      if (!isPlannedInt) {
        await applyBalanceDelta(txType, cleanWalletId, null, amount, cleanAdminFee, 1);
      }

      return { content: [{ type: "text", text: JSON.stringify(tx[0], null, 2) }] };
    }

    // --- Tool: transfer_funds ---
    if (name === "transfer_funds") {
      const [walletCheck] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.wallets)
        .where(eq(schema.wallets.walletUserId, effectiveUserId));
      if (Number(walletCheck?.count || 0) === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "No wallets found. You need at least 2 wallets to transfer funds. Please create wallets first using manage_wallet(action: 'create') or follow the onboarding_assistant prompt.",
              suggestion: "onboarding_assistant"
            }, null, 2)
          }],
          isError: true
        };
      }

      const { sourceWalletId, targetWalletId, amount, adminFee, categoryId, description, isPlanned, transactionDate } = (args || {}) as any;

      if (!isValidPositiveNumber(amount)) {
        throw new Error("Validation Error: Transfer 'amount' must be a positive finite number greater than 0");
      }
      if (!isValidUUID(sourceWalletId)) {
        throw new Error("Validation Error: Valid string 'sourceWalletId' (UUID) is required");
      }
      if (!isValidUUID(targetWalletId)) {
        throw new Error("Validation Error: Valid string 'targetWalletId' (UUID) is required");
      }
      if (sourceWalletId.trim() === targetWalletId.trim()) {
        throw new Error("Validation Error: 'sourceWalletId' and 'targetWalletId' cannot be the same wallet");
      }
      if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
        throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
      }
      if (transactionDate && !isValidIsoDateOrTimestamp(transactionDate)) {
        throw new Error("Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
      }
      if (description && (typeof description !== "string" || description.length > 500)) {
        throw new Error("Validation Error: 'description' cannot exceed 500 characters");
      }

      const cleanSourceWalletId = sourceWalletId.trim();
      const cleanTargetWalletId = targetWalletId.trim();
      const cleanAdminFee = isValidFiniteNumber(adminFee) && adminFee >= 0 ? adminFee : 0;

      const sourceWallet = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanSourceWalletId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
      if (!sourceWallet) throw new Error(`Source Wallet ID ${cleanSourceWalletId} not found or unauthorized`);

      const targetWallet = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanTargetWalletId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
      if (!targetWallet) throw new Error(`Target Wallet ID ${cleanTargetWalletId} not found or unauthorized`);

      let cleanCategoryId: string | null = null;
      if (categoryId && typeof categoryId === "string" && categoryId.trim().length > 0) {
        if (!isValidUUID(categoryId)) {
          throw new Error("Validation Error: 'categoryId' must be a valid string (UUID)");
        }
        const targetCatId = (categoryId as string).trim();
        const category = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, targetCatId), eq(schema.categories.categoryUserId, effectiveUserId))).get();
        if (!category) throw new Error(`Category ID ${targetCatId} not found or unauthorized`);
        cleanCategoryId = targetCatId;
      } else {
        let transferCat = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryUserId, effectiveUserId), eq(schema.categories.categoryName, "Transfer"))).get();
        if (!transferCat) {
          const newCatId = crypto.randomUUID();
          const created = await db.insert(schema.categories).values({
            categoryId: newCatId,
            categoryUserId: effectiveUserId,
            categoryName: "Transfer",
            categoryType: "expense",
            categoryIcon: "🔄",
            categoryCreatedAt: currentIsoTimestamp()
          }).returning();
          transferCat = created[0];
        }
        cleanCategoryId = transferCat.categoryId;
      }

      const dateStr = normalizeToIsoTimestamp(transactionDate);
      const isPlannedInt = isPlanned ? 1 : 0;
      const newTransactionId = crypto.randomUUID();
      const nowIso = currentIsoTimestamp();

      const tx = await db.insert(schema.transactions).values({
        transactionId: newTransactionId,
        transactionUserId: effectiveUserId,
        transactionWalletId: cleanSourceWalletId,
        transactionTargetWalletId: cleanTargetWalletId,
        transactionCategoryId: cleanCategoryId,
        transactionAmount: amount,
        transactionAdminFee: cleanAdminFee,
        transactionType: "transfer",
        transactionDescription: description ? description.trim() : null,
        transactionIsPlanned: isPlannedInt,
        transactionDate: dateStr,
        transactionCreatedAt: nowIso
      }).returning();

      // Atomic wallet balance update for actual transfer (isPlanned == 0)
      if (!isPlannedInt) {
        await applyBalanceDelta("transfer", cleanSourceWalletId, cleanTargetWalletId, amount, cleanAdminFee, 1);
      }

      return { content: [{ type: "text", text: JSON.stringify(tx[0], null, 2) }] };
    }

    // --- Tool: update_transaction ---
    if (name === "update_transaction") {
      const { transactionId, amount, adminFee, walletId, targetWalletId, categoryId, budgetId, description, transactionDate, isPlanned } = (args || {}) as any;

      if (!isValidUUID(transactionId)) {
        throw new Error("Validation Error: Valid string 'transactionId' (UUID) is required");
      }
      const cleanTxId = transactionId.trim();
      const existingTx = await db.select().from(schema.transactions).where(and(eq(schema.transactions.transactionId, cleanTxId), eq(schema.transactions.transactionUserId, effectiveUserId))).get();
      if (!existingTx) {
        throw new Error(`Transaction ID ${cleanTxId} not found or unauthorized`);
      }

      if (amount !== undefined && !isValidPositiveNumber(amount)) {
        throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
      }
      if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
        throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
      }
      if (transactionDate !== undefined && !isValidIsoDateOrTimestamp(transactionDate)) {
        throw new Error("Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
      }
      if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
        throw new Error("Validation Error: 'description' cannot exceed 500 characters");
      }

      let newWalletId = existingTx.transactionWalletId;
      if (walletId !== undefined) {
        if (!isValidUUID(walletId)) throw new Error("Validation Error: 'walletId' must be a valid UUID");
        const cleanWId = (walletId as string).trim();
        const w = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanWId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
        if (!w) throw new Error(`Wallet ID ${cleanWId} not found or unauthorized`);
        newWalletId = cleanWId;
      }

      let newTargetWalletId = existingTx.transactionTargetWalletId;
      if (targetWalletId !== undefined) {
        if (targetWalletId === null || targetWalletId === "") {
          newTargetWalletId = null;
        } else {
          if (!isValidUUID(targetWalletId)) throw new Error("Validation Error: 'targetWalletId' must be a valid UUID");
          const cleanTWId = (targetWalletId as string).trim();
          const tw = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanTWId), eq(schema.wallets.walletUserId, effectiveUserId))).get();
          if (!tw) throw new Error(`Target Wallet ID ${cleanTWId} not found or unauthorized`);
          newTargetWalletId = cleanTWId;
        }
      }

      let newCategoryId = existingTx.transactionCategoryId;
      if (categoryId !== undefined) {
        if (categoryId === null || categoryId === "") {
          newCategoryId = null;
        } else {
          if (!isValidUUID(categoryId)) throw new Error("Validation Error: 'categoryId' must be a valid UUID");
          const cleanCatId = (categoryId as string).trim();
          const cat = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, cleanCatId), eq(schema.categories.categoryUserId, effectiveUserId))).get();
          if (!cat) throw new Error(`Category ID ${cleanCatId} not found or unauthorized`);
          newCategoryId = cleanCatId;
        }
      }

      let newBudgetId = existingTx.transactionBudgetId;
      if (budgetId !== undefined) {
        if (budgetId === null || budgetId === "") {
          newBudgetId = null;
        } else {
          if (!isValidUUID(budgetId)) throw new Error("Validation Error: 'budgetId' must be a valid UUID");
          const cleanBId = (budgetId as string).trim();
          const b = await db.select().from(schema.budgets).where(and(eq(schema.budgets.budgetId, cleanBId), eq(schema.budgets.budgetUserId, effectiveUserId))).get();
          if (!b) throw new Error(`Budget ID ${cleanBId} not found or unauthorized`);
          newBudgetId = cleanBId;
        }
      }

      const newAmount = amount !== undefined ? amount : existingTx.transactionAmount;
      const newAdminFee = adminFee !== undefined ? adminFee : existingTx.transactionAdminFee;
      const newIsPlannedInt = isPlanned !== undefined ? (isPlanned ? 1 : 0) : existingTx.transactionIsPlanned;

      // -----------------------------------------------------------------------
      // Atomic Balance Reconciliation
      // -----------------------------------------------------------------------
      // 1. Revert previous transaction impact if it was an actual transaction
      if (existingTx.transactionIsPlanned === 0) {
        await applyBalanceDelta(existingTx.transactionType, existingTx.transactionWalletId, existingTx.transactionTargetWalletId, existingTx.transactionAmount, existingTx.transactionAdminFee, -1);
      }

      // 2. Apply new transaction impact if the updated transaction is an actual transaction
      if (newIsPlannedInt === 0) {
        await applyBalanceDelta(existingTx.transactionType, newWalletId, newTargetWalletId, newAmount, newAdminFee, 1);
      }

      const updates: any = {
        transactionAmount: newAmount,
        transactionAdminFee: newAdminFee,
        transactionWalletId: newWalletId,
        transactionTargetWalletId: newTargetWalletId,
        transactionCategoryId: newCategoryId,
        transactionBudgetId: newBudgetId,
        transactionIsPlanned: newIsPlannedInt
      };

      if (description !== undefined) updates.transactionDescription = description ? description.trim() : null;
      if (transactionDate !== undefined) updates.transactionDate = normalizeToIsoTimestamp(transactionDate);

      const updated = await db.update(schema.transactions)
        .set(updates)
        .where(and(eq(schema.transactions.transactionId, cleanTxId), eq(schema.transactions.transactionUserId, effectiveUserId)))
        .returning();

      return { content: [{ type: "text", text: JSON.stringify(updated[0], null, 2) }] };
    }

    // --- Tool: list_transactions ---
    if (name === "list_transactions") {
      const { walletId, targetWalletId, categoryId, budgetId, type, isPlanned, startDate, endDate, limit = 50, offset = 0 } = (args || {}) as any;
      const conditions = [eq(schema.transactions.transactionUserId, effectiveUserId)];
      
      if (walletId !== undefined && typeof walletId === "string" && walletId.trim() !== "") {
        conditions.push(eq(schema.transactions.transactionWalletId, walletId.trim()));
      }
      if (targetWalletId !== undefined && typeof targetWalletId === "string" && targetWalletId.trim() !== "") {
        conditions.push(eq(schema.transactions.transactionTargetWalletId, targetWalletId.trim()));
      }
      if (categoryId !== undefined && typeof categoryId === "string" && categoryId.trim() !== "") {
        conditions.push(eq(schema.transactions.transactionCategoryId, categoryId.trim()));
      }
      if (budgetId !== undefined && typeof budgetId === "string" && budgetId.trim() !== "") {
        conditions.push(eq(schema.transactions.transactionBudgetId, budgetId.trim()));
      }
      if (type !== undefined && (type === "expense" || type === "income" || type === "transfer")) {
        conditions.push(eq(schema.transactions.transactionType, type));
      }
      if (isPlanned !== undefined) {
        conditions.push(eq(schema.transactions.transactionIsPlanned, isPlanned ? 1 : 0));
      }
      if (startDate !== undefined) {
        if (!isValidIsoDateOrTimestamp(startDate)) throw new Error("Validation Error: 'startDate' must be a valid ISO date or timestamp");
        conditions.push(gte(schema.transactions.transactionDate, normalizeToIsoTimestamp(startDate)));
      }
      if (endDate !== undefined) {
        if (!isValidIsoDateOrTimestamp(endDate)) throw new Error("Validation Error: 'endDate' must be a valid ISO date or timestamp");
        // If end date is YYYY-MM-DD, allow up to end of the day YYYY-MM-DDT23:59:59.999Z
        const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
          ? `${endDate.trim()}T23:59:59.999Z`
          : normalizeToIsoTimestamp(endDate);
        conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
      }

      const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
      const safeOffset = Math.max(0, Number(offset) || 0);

      const txs = await db.select()
        .from(schema.transactions)
        .where(and(...conditions))
        .orderBy(desc(schema.transactions.transactionDate), desc(schema.transactions.transactionCreatedAt))
        .limit(safeLimit)
        .offset(safeOffset);

      return { content: [{ type: "text", text: JSON.stringify(txs, null, 2) }] };
    }

    // --- Tool: financial_summary ---
    if (name === "financial_summary") {
      const { startDate, endDate, baseCurrency } = (args || {}) as any;
      
      if (startDate !== undefined && !isValidIsoDateOrTimestamp(startDate)) throw new Error("Validation Error: 'startDate' must be a valid ISO date or timestamp");
      if (endDate !== undefined && !isValidIsoDateOrTimestamp(endDate)) throw new Error("Validation Error: 'endDate' must be a valid ISO date or timestamp");

      // 1. Group net worth by currency and institution across all user wallets
      const walletsData = await db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, effectiveUserId));
      const netWorthByCurrency: Record<string, number> = {};
      const netWorthByInstitution: Record<string, number> = {};
      const currencyCounts: Record<string, number> = {};

      for (const w of walletsData) {
        const curr = (w.walletCurrency || "IDR").toUpperCase();
        netWorthByCurrency[w.walletCurrency] = Number(((netWorthByCurrency[w.walletCurrency] || 0) + w.walletBalance).toFixed(2));
        netWorthByInstitution[w.walletInstitution] = Number(((netWorthByInstitution[w.walletInstitution] || 0) + w.walletBalance).toFixed(2));
        currencyCounts[curr] = (currencyCounts[curr] || 0) + 1;
      }

      // Base currency resolution: explicit override or auto-detection from wallet frequency / default IDR
      let resolvedBaseCurrency = "IDR";
      if (baseCurrency && typeof baseCurrency === "string" && baseCurrency.trim().length > 0) {
        resolvedBaseCurrency = baseCurrency.trim().toUpperCase();
      } else {
        let maxCount = 0;
        for (const [curr, count] of Object.entries(currencyCounts)) {
          if (count > maxCount) {
            maxCount = count;
            resolvedBaseCurrency = curr;
          }
        }
      }

      // Fetch exchange rates (with 3s timeout & fallback)
      const fxRates = await getExchangeRates(options?.fetchFn);
      let consolidatedEstimatedTotal = 0;
      const isEstimated = Object.keys(netWorthByCurrency).some(curr => curr.toUpperCase() !== resolvedBaseCurrency);

      for (const [curr, balance] of Object.entries(netWorthByCurrency)) {
        const converted = convertCurrency(balance, curr, resolvedBaseCurrency, fxRates.rates);
        consolidatedEstimatedTotal += converted;
      }

      const consolidatedNetWorth = {
        baseCurrency: resolvedBaseCurrency,
        estimatedTotal: Number(consolidatedEstimatedTotal.toFixed(2)),
        isEstimated,
        exchangeRatesSource: fxRates.source,
      };

      // 2. Query non-planned transactions
      const conditions = [
        eq(schema.transactions.transactionUserId, effectiveUserId),
        eq(schema.transactions.transactionIsPlanned, 0)
      ];
      if (startDate !== undefined) conditions.push(gte(schema.transactions.transactionDate, normalizeToIsoTimestamp(startDate)));
      if (endDate !== undefined) {
        const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
          ? `${endDate.trim()}T23:59:59.999Z`
          : normalizeToIsoTimestamp(endDate);
        conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
      }

      const txs = await db.select().from(schema.transactions).where(and(...conditions));
      
      // 3. Map categories for human-readable breakdown
      const categoriesData = await db.select().from(schema.categories).where(eq(schema.categories.categoryUserId, effectiveUserId));
      const categoryMap = new Map(categoriesData.map(c => [c.categoryId, c.categoryName]));

      let totalIncome = 0;
      let totalExpense = 0;
      let totalAdminFees = 0;
      let transfersCount = 0;
      const categoryBreakdown: Record<string, number> = {};

      for (const tx of txs) {
        const fee = tx.transactionAdminFee || 0;
        totalAdminFees += fee;

        if (tx.transactionType === "income") {
          totalIncome += (tx.transactionAmount - fee);
        } else if (tx.transactionType === "expense") {
          const totalCost = tx.transactionAmount + fee;
          totalExpense += totalCost;
          const catName = tx.transactionCategoryId ? (categoryMap.get(tx.transactionCategoryId) || `Category #${tx.transactionCategoryId}`) : "Uncategorized";
          categoryBreakdown[catName] = Number(((categoryBreakdown[catName] || 0) + totalCost).toFixed(2));
        } else if (tx.transactionType === "transfer") {
          transfersCount += 1;
          if (fee > 0) {
            totalExpense += fee;
            const catName = tx.transactionCategoryId ? (categoryMap.get(tx.transactionCategoryId) || `Category #${tx.transactionCategoryId}`) : "Transfer Fees";
            categoryBreakdown[catName] = Number(((categoryBreakdown[catName] || 0) + fee).toFixed(2));
          }
        }
      }

      // 4. Query active debts & loans for summary totals
      const activeDebtsLoans = await db.select().from(schema.debtsLoans)
        .where(
          and(
            eq(schema.debtsLoans.debtLoanUserId, effectiveUserId),
            sql`debt_loan_status != 'paid'`
          )
        );

      let totalDebt = 0;
      let totalReceivable = 0;
      for (const dl of activeDebtsLoans) {
        if (dl.debtLoanType === "debt") {
          totalDebt += dl.debtLoanRemainingAmount;
        } else if (dl.debtLoanType === "loan") {
          totalReceivable += dl.debtLoanRemainingAmount;
        }
      }

      // 5. Query active goals and compute pacing
      const goalsData = await db.select().from(schema.goals)
        .where(
          and(
            eq(schema.goals.goalUserId, effectiveUserId),
            sql`goal_status != 'cancelled'`
          )
        );

      const activeGoals = goalsData.map(g => {
        const pacing = calculateGoalPacing(
          g.goalTargetAmount,
          g.goalCurrentAmount,
          g.goalTargetDate,
          g.goalStatus
        );
        return {
          goalId: g.goalId,
          name: g.goalName,
          currency: g.goalCurrency,
          walletId: g.goalWalletId,
          categoryId: g.goalCategoryId,
          ...pacing,
        };
      });

      // 6. Query recurring templates & forward 30-day cashflow projection
      const templatesData = await db.select().from(schema.recurringTemplates)
        .where(
          and(
            eq(schema.recurringTemplates.templateUserId, effectiveUserId),
            eq(schema.recurringTemplates.templateIsActive, 1)
          )
        );

      const cashflowProjections = projectRecurringCashflow(
        templatesData.map(t => ({
          templateId: t.templateId,
          templateName: t.templateName,
          templateWalletId: t.templateWalletId,
          templateTargetWalletId: t.templateTargetWalletId,
          templateCategoryId: t.templateCategoryId,
          templateAmount: t.templateAmount,
          templateAdminFee: t.templateAdminFee,
          templateType: t.templateType as 'expense' | 'income' | 'transfer',
          templateFrequency: t.templateFrequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
          templateInterval: t.templateInterval,
          templateStartDate: t.templateStartDate,
          templateNextRunDate: t.templateNextRunDate,
          templateEndDate: t.templateEndDate,
          templateIsActive: t.templateIsActive,
          templateNotes: t.templateNotes,
        })),
        30
      );

      const summary: Record<string, any> = {
        netWorthByCurrency,
        netWorthByInstitution,
        consolidatedNetWorth,
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpense: Number(totalExpense.toFixed(2)),
        totalAdminFees: Number(totalAdminFees.toFixed(2)),
        netSavings: Number((totalIncome - totalExpense).toFixed(2)),
        totalDebt: Number(totalDebt.toFixed(2)),
        totalReceivable: Number(totalReceivable.toFixed(2)),
        activeGoals,
        cashflowProjections,
        walletsCount: walletsData.length,
        transactionsCount: txs.length,
        transfersCount,
        categoryBreakdown
      };

      if (walletsData.length === 0) {
        summary.accountStatus = "new_account_needs_onboarding";
        summary.isNewUser = true;
        summary.guidance = "Akun Reedrich ini baru terhubung dan belum memiliki dompet. Tawarkan untuk membuat dompet pertama (misal: Bank BCA, Cash, GoPay) via manage_wallet(action: 'create') dan pasang kategori via manage_category(action: 'seed_defaults').";
      }
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }

    // --- Tool: manage_debt_loan ---
    if (name === "manage_debt_loan") {
      const {
        action,
        debtLoanId,
        type,
        personName,
        amount,
        walletId,
        dueDate,
        notes,
        status,
        adjustWalletBalance,
      } = (args || {}) as any;

      if (!action || typeof action !== "string") {
        throw new Error("Validation Error: 'action' is required for manage_debt_loan. Valid actions: create, list, repay, update");
      }

      // 1. Action: create
      if (action === "create") {
        if (!personName || typeof personName !== "string" || personName.trim().length === 0 || personName.trim().length > 100) {
          throw new Error("Validation Error: 'personName' is required (1-100 characters)");
        }
        if (!isValidPositiveNumber(amount)) {
          throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
        }
        const cleanType = type === "debt" ? "debt" : "loan";
        const cleanPersonName = personName.trim();
        const shouldAdjustWallet = adjustWalletBalance !== false;

        let cleanWalletId: string | null = null;
        if (walletId) {
          if (!isValidUUID(walletId)) {
            throw new Error("Validation Error: 'walletId' must be a valid UUID string");
          }
          const targetWallet = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (!targetWallet) {
            throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
          }
          cleanWalletId = walletId.trim();
        }

        if (dueDate && !isValidIsoDateOrTimestamp(dueDate)) {
          throw new Error("Validation Error: 'dueDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
        }
        if (notes && (typeof notes !== "string" || notes.length > 500)) {
          throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
        }

        const newDebtLoanId = crypto.randomUUID();
        const nowIso = currentIsoTimestamp();
        const cleanDueDate = dueDate ? dueDate.trim() : null;

        const newRecord = await db.insert(schema.debtsLoans).values({
          debtLoanId: newDebtLoanId,
          debtLoanUserId: effectiveUserId,
          debtLoanPersonName: cleanPersonName,
          debtLoanType: cleanType,
          debtLoanAmount: amount,
          debtLoanRemainingAmount: amount,
          debtLoanWalletId: cleanWalletId,
          debtLoanDueDate: cleanDueDate,
          debtLoanStatus: "unpaid",
          debtLoanNotes: notes ? notes.trim() : null,
          debtLoanCreatedAt: nowIso,
        }).returning();

        // Atomic wallet balance adjustment on create
        if (shouldAdjustWallet && cleanWalletId) {
          if (cleanType === "loan") {
            // Giving loan -> deduct from wallet balance
            await db.update(schema.wallets)
              .set({ walletBalance: sql`wallet_balance - ${amount}` })
              .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
          } else if (cleanType === "debt") {
            // Borrowing -> credit to wallet balance
            await db.update(schema.wallets)
              .set({ walletBalance: sql`wallet_balance + ${amount}` })
              .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(newRecord[0], null, 2) }] };
      }

      // 2. Action: list
      if (action === "list") {
        const conditions = [eq(schema.debtsLoans.debtLoanUserId, effectiveUserId)];
        if (status && ["unpaid", "partially_paid", "paid"].includes(status)) {
          conditions.push(eq(schema.debtsLoans.debtLoanStatus, status));
        }
        if (type && ["debt", "loan"].includes(type)) {
          conditions.push(eq(schema.debtsLoans.debtLoanType, type));
        }

        const results = await db.select().from(schema.debtsLoans)
          .where(and(...conditions))
          .orderBy(desc(schema.debtsLoans.debtLoanCreatedAt));

        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      // 3. Action: repay
      if (action === "repay") {
        if (!isValidUUID(debtLoanId)) {
          throw new Error("Validation Error: Valid string 'debtLoanId' (UUID) is required for repay");
        }
        if (!isValidPositiveNumber(amount)) {
          throw new Error("Validation Error: Repayment 'amount' must be a positive finite number greater than 0");
        }

        const cleanId = (debtLoanId as string).trim();
        const existingRecord = await db.select().from(schema.debtsLoans)
          .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, effectiveUserId)))
          .get();

        if (!existingRecord) {
          throw new Error(`Debt/Loan ID ${cleanId} not found or unauthorized`);
        }

        if (existingRecord.debtLoanStatus === "paid" || existingRecord.debtLoanRemainingAmount <= 0) {
          throw new Error(`Debt/Loan ${cleanId} is already fully paid`);
        }

        if (amount > existingRecord.debtLoanRemainingAmount + 0.001) {
          throw new Error(`Validation Error: Repayment amount (${amount}) cannot exceed remaining balance (${existingRecord.debtLoanRemainingAmount})`);
        }

        const shouldAdjustWallet = adjustWalletBalance !== false;
        let cleanWalletId = existingRecord.debtLoanWalletId;
        if (walletId) {
          if (!isValidUUID(walletId)) {
            throw new Error("Validation Error: 'walletId' must be a valid UUID string");
          }
          const targetWallet = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (!targetWallet) {
            throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
          }
          cleanWalletId = walletId.trim();
        }

        const newRemaining = Number((existingRecord.debtLoanRemainingAmount - amount).toFixed(2));
        const newStatus = newRemaining <= 0.001 ? "paid" : "partially_paid";
        const finalRemaining = newRemaining <= 0.001 ? 0 : newRemaining;

        const updated = await db.update(schema.debtsLoans)
          .set({
            debtLoanRemainingAmount: finalRemaining,
            debtLoanStatus: newStatus,
          })
          .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, effectiveUserId)))
          .returning();

        // Atomic wallet balance adjustment on repay
        if (shouldAdjustWallet && cleanWalletId) {
          if (existingRecord.debtLoanType === "loan") {
            // Debtor pays us back -> credit our wallet
            await db.update(schema.wallets)
              .set({ walletBalance: sql`wallet_balance + ${amount}` })
              .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
          } else if (existingRecord.debtLoanType === "debt") {
            // We pay creditor back -> deduct from our wallet
            await db.update(schema.wallets)
              .set({ walletBalance: sql`wallet_balance - ${amount}` })
              .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(updated[0], null, 2) }] };
      }

      // 4. Action: update
      if (action === "update") {
        if (!isValidUUID(debtLoanId)) {
          throw new Error("Validation Error: Valid string 'debtLoanId' (UUID) is required for update");
        }
        const cleanId = (debtLoanId as string).trim();
        const existingRecord = await db.select().from(schema.debtsLoans)
          .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, effectiveUserId)))
          .get();

        if (!existingRecord) {
          throw new Error(`Debt/Loan ID ${cleanId} not found or unauthorized`);
        }

        const updateData: Partial<typeof schema.debtsLoans.$inferInsert> = {};
        if (personName !== undefined) {
          if (typeof personName !== "string" || personName.trim().length === 0 || personName.trim().length > 100) {
            throw new Error("Validation Error: 'personName' must be 1-100 characters");
          }
          updateData.debtLoanPersonName = personName.trim();
        }
        if (dueDate !== undefined) {
          if (dueDate && !isValidIsoDateOrTimestamp(dueDate)) {
            throw new Error("Validation Error: 'dueDate' must be in valid ISO format");
          }
          updateData.debtLoanDueDate = dueDate ? dueDate.trim() : null;
        }
        if (notes !== undefined) {
          if (notes && (typeof notes !== "string" || notes.length > 500)) {
            throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
          }
          updateData.debtLoanNotes = notes ? notes.trim() : null;
        }

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: JSON.stringify(existingRecord, null, 2) }] };
        }

        const updated = await db.update(schema.debtsLoans)
          .set(updateData)
          .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, effectiveUserId)))
          .returning();

        return { content: [{ type: "text", text: JSON.stringify(updated[0], null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_debt_loan. Valid actions: create, list, repay, update`);
    }

    // --- Tool: manage_goal ---
    if (name === "manage_goal") {
      const {
        action,
        goalId,
        name: goalNameInput,
        targetAmount,
        currentAmount,
        currency,
        targetDate,
        walletId,
        categoryId,
        status: goalStatusInput,
        notes,
        amount,
        adjustWalletBalance,
      } = (args || {}) as any;

      if (!action || typeof action !== "string") {
        throw new Error("Validation Error: 'action' is required for manage_goal. Valid actions: create, list, update, contribute, delete");
      }

      // 1. Action: create
      if (action === "create") {
        if (!goalNameInput || typeof goalNameInput !== "string" || goalNameInput.trim().length === 0 || goalNameInput.trim().length > 100) {
          throw new Error("Validation Error: 'name' is required (1-100 characters)");
        }
        if (!isValidPositiveNumber(targetAmount)) {
          throw new Error("Validation Error: 'targetAmount' must be a positive finite number greater than 0");
        }
        const initialCurrent = currentAmount !== undefined ? (isValidFiniteNumber(currentAmount) && currentAmount >= 0 ? currentAmount : null) : 0.0;
        if (initialCurrent === null) {
          throw new Error("Validation Error: 'currentAmount' must be a non-negative finite number");
        }

        let cleanWalletId: string | null = null;
        if (walletId) {
          if (!isValidUUID(walletId)) throw new Error("Validation Error: 'walletId' must be a valid UUID string");
          const w = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (!w) throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
          cleanWalletId = walletId.trim();
        }

        let cleanCategoryId: string | null = null;
        if (categoryId) {
          if (!isValidUUID(categoryId)) throw new Error("Validation Error: 'categoryId' must be a valid UUID string");
          const cat = await db.select().from(schema.categories)
            .where(and(eq(schema.categories.categoryId, categoryId.trim()), eq(schema.categories.categoryUserId, effectiveUserId)))
            .get();
          if (!cat) throw new Error(`Category ID ${categoryId.trim()} not found or unauthorized`);
          cleanCategoryId = categoryId.trim();
        }

        if (targetDate && !isValidIsoDateOrTimestamp(targetDate)) {
          throw new Error("Validation Error: 'targetDate' must be in valid ISO format (e.g. YYYY-MM-DD)");
        }
        if (notes && (typeof notes !== "string" || notes.length > 500)) {
          throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
        }

        const cleanCurrency = currency && typeof currency === "string" && currency.trim().length > 0 ? currency.trim().toUpperCase() : "IDR";
        const isAutoCompleted = initialCurrent >= targetAmount;
        const finalStatus = isAutoCompleted ? "completed" : (goalStatusInput === "completed" || goalStatusInput === "cancelled" ? goalStatusInput : "in_progress");

        const newGoal = await db.insert(schema.goals).values({
          goalUserId: effectiveUserId,
          goalName: goalNameInput.trim(),
          goalTargetAmount: targetAmount,
          goalCurrentAmount: initialCurrent,
          goalCurrency: cleanCurrency,
          goalTargetDate: targetDate ? targetDate.trim().split("T")[0] : null,
          goalWalletId: cleanWalletId,
          goalCategoryId: cleanCategoryId,
          goalStatus: finalStatus,
          goalNotes: notes ? notes.trim() : null,
        }).returning();

        const pacing = calculateGoalPacing(
          newGoal[0].goalTargetAmount,
          newGoal[0].goalCurrentAmount,
          newGoal[0].goalTargetDate,
          newGoal[0].goalStatus
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...newGoal[0], pacing }, null, 2)
          }]
        };
      }

      // 2. Action: list
      if (action === "list") {
        const conditions = [eq(schema.goals.goalUserId, effectiveUserId)];
        if (goalStatusInput && ["in_progress", "completed", "cancelled"].includes(goalStatusInput)) {
          conditions.push(eq(schema.goals.goalStatus, goalStatusInput));
        }

        const goalsList = await db.select().from(schema.goals)
          .where(and(...conditions))
          .orderBy(desc(schema.goals.goalCreatedAt));

        const enrichedGoals = goalsList.map(g => {
          const pacing = calculateGoalPacing(
            g.goalTargetAmount,
            g.goalCurrentAmount,
            g.goalTargetDate,
            g.goalStatus
          );
          return { ...g, pacing };
        });

        return { content: [{ type: "text", text: JSON.stringify(enrichedGoals, null, 2) }] };
      }

      // 3. Action: contribute
      if (action === "contribute") {
        if (!isValidUUID(goalId)) {
          throw new Error("Validation Error: Valid string 'goalId' (UUID) is required for contribute");
        }
        if (!isValidPositiveNumber(amount)) {
          throw new Error("Validation Error: Contribution 'amount' must be a positive finite number greater than 0");
        }

        const cleanGoalId = (goalId as string).trim();
        const existingGoal = await db.select().from(schema.goals)
          .where(and(eq(schema.goals.goalId, cleanGoalId), eq(schema.goals.goalUserId, effectiveUserId)))
          .get();

        if (!existingGoal) {
          throw new Error(`Goal ID ${cleanGoalId} not found or unauthorized`);
        }

        const newCurrent = Number((existingGoal.goalCurrentAmount + amount).toFixed(2));
        const newStatus = newCurrent >= existingGoal.goalTargetAmount ? "completed" : existingGoal.goalStatus;

        const updated = await db.update(schema.goals)
          .set({
            goalCurrentAmount: newCurrent,
            goalStatus: newStatus,
          })
          .where(and(eq(schema.goals.goalId, cleanGoalId), eq(schema.goals.goalUserId, effectiveUserId)))
          .returning();

        // Optional: adjust wallet balance
        const shouldAdjust = adjustWalletBalance === true;
        const targetWalletId = walletId ? walletId.trim() : existingGoal.goalWalletId;

        if (shouldAdjust && targetWalletId) {
          const w = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, targetWalletId), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (w) {
            await db.update(schema.wallets)
              .set({ walletBalance: sql`wallet_balance - ${amount}` })
              .where(and(eq(schema.wallets.walletId, targetWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));

            // Record transaction
            await db.insert(schema.transactions).values({
              transactionUserId: effectiveUserId,
              transactionWalletId: targetWalletId,
              transactionCategoryId: existingGoal.goalCategoryId,
              transactionAmount: amount,
              transactionAdminFee: 0.0,
              transactionType: "expense",
              transactionDescription: `Goal contribution: ${existingGoal.goalName}`,
              transactionIsPlanned: 0,
              transactionDate: currentIsoTimestamp(),
            });
          }
        }

        const pacing = calculateGoalPacing(
          updated[0].goalTargetAmount,
          updated[0].goalCurrentAmount,
          updated[0].goalTargetDate,
          updated[0].goalStatus
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...updated[0], pacing }, null, 2)
          }]
        };
      }

      // 4. Action: update
      if (action === "update") {
        if (!isValidUUID(goalId)) {
          throw new Error("Validation Error: Valid string 'goalId' (UUID) is required for update");
        }
        const cleanGoalId = (goalId as string).trim();
        const existingGoal = await db.select().from(schema.goals)
          .where(and(eq(schema.goals.goalId, cleanGoalId), eq(schema.goals.goalUserId, effectiveUserId)))
          .get();

        if (!existingGoal) {
          throw new Error(`Goal ID ${cleanGoalId} not found or unauthorized`);
        }

        const updateData: Partial<typeof schema.goals.$inferInsert> = {};
        if (goalNameInput !== undefined) {
          if (typeof goalNameInput !== "string" || goalNameInput.trim().length === 0 || goalNameInput.trim().length > 100) {
            throw new Error("Validation Error: 'name' must be 1-100 characters");
          }
          updateData.goalName = goalNameInput.trim();
        }
        if (targetAmount !== undefined) {
          if (!isValidPositiveNumber(targetAmount)) {
            throw new Error("Validation Error: 'targetAmount' must be a positive finite number greater than 0");
          }
          updateData.goalTargetAmount = targetAmount;
        }
        if (currentAmount !== undefined) {
          if (!isValidFiniteNumber(currentAmount) || currentAmount < 0) {
            throw new Error("Validation Error: 'currentAmount' must be a non-negative finite number");
          }
          updateData.goalCurrentAmount = currentAmount;
        }
        if (currency !== undefined) {
          if (typeof currency !== "string" || currency.trim().length === 0) {
            throw new Error("Validation Error: 'currency' must be a valid currency string");
          }
          updateData.goalCurrency = currency.trim().toUpperCase();
        }
        if (targetDate !== undefined) {
          if (targetDate && !isValidIsoDateOrTimestamp(targetDate)) {
            throw new Error("Validation Error: 'targetDate' must be in valid ISO format");
          }
          updateData.goalTargetDate = targetDate ? targetDate.trim().split("T")[0] : null;
        }
        if (walletId !== undefined) {
          if (walletId) {
            if (!isValidUUID(walletId)) throw new Error("Validation Error: 'walletId' must be a valid UUID string");
            const w = await db.select().from(schema.wallets)
              .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
              .get();
            if (!w) throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
            updateData.goalWalletId = walletId.trim();
          } else {
            updateData.goalWalletId = null;
          }
        }
        if (categoryId !== undefined) {
          if (categoryId) {
            if (!isValidUUID(categoryId)) throw new Error("Validation Error: 'categoryId' must be a valid UUID string");
            const cat = await db.select().from(schema.categories)
              .where(and(eq(schema.categories.categoryId, categoryId.trim()), eq(schema.categories.categoryUserId, effectiveUserId)))
              .get();
            if (!cat) throw new Error(`Category ID ${categoryId.trim()} not found or unauthorized`);
            updateData.goalCategoryId = categoryId.trim();
          } else {
            updateData.goalCategoryId = null;
          }
        }
        if (goalStatusInput !== undefined) {
          if (!["in_progress", "completed", "cancelled"].includes(goalStatusInput)) {
            throw new Error("Validation Error: 'status' must be 'in_progress', 'completed', or 'cancelled'");
          }
          updateData.goalStatus = goalStatusInput;
        }
        if (notes !== undefined) {
          if (notes && (typeof notes !== "string" || notes.length > 500)) {
            throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
          }
          updateData.goalNotes = notes ? notes.trim() : null;
        }

        if (Object.keys(updateData).length === 0) {
          const pacing = calculateGoalPacing(
            existingGoal.goalTargetAmount,
            existingGoal.goalCurrentAmount,
            existingGoal.goalTargetDate,
            existingGoal.goalStatus
          );
          return { content: [{ type: "text", text: JSON.stringify({ ...existingGoal, pacing }, null, 2) }] };
        }

        const updated = await db.update(schema.goals)
          .set(updateData)
          .where(and(eq(schema.goals.goalId, cleanGoalId), eq(schema.goals.goalUserId, effectiveUserId)))
          .returning();

        const pacing = calculateGoalPacing(
          updated[0].goalTargetAmount,
          updated[0].goalCurrentAmount,
          updated[0].goalTargetDate,
          updated[0].goalStatus
        );

        return { content: [{ type: "text", text: JSON.stringify({ ...updated[0], pacing }, null, 2) }] };
      }

      // 5. Action: delete
      if (action === "delete") {
        if (!isValidUUID(goalId)) {
          throw new Error("Validation Error: Valid string 'goalId' (UUID) is required for delete");
        }
        const cleanGoalId = (goalId as string).trim();
        const deleted = await db.delete(schema.goals)
          .where(and(eq(schema.goals.goalId, cleanGoalId), eq(schema.goals.goalUserId, effectiveUserId)))
          .returning();

        if (deleted.length === 0) {
          throw new Error(`Goal ID ${cleanGoalId} not found or unauthorized`);
        }

        return { content: [{ type: "text", text: JSON.stringify({ message: "Goal deleted successfully", goal: deleted[0] }, null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_goal. Valid actions: create, list, update, contribute, delete`);
    }

    // --- Tool: manage_recurring_template ---
    if (name === "manage_recurring_template") {
      const {
        action,
        templateId,
        name: templateNameInput,
        walletId,
        targetWalletId,
        categoryId,
        amount,
        adminFee,
        type: templateTypeInput,
        frequency,
        interval,
        startDate,
        nextRunDate,
        endDate,
        isActive,
        notes,
      } = (args || {}) as any;

      if (!action || typeof action !== "string") {
        throw new Error("Validation Error: 'action' is required for manage_recurring_template. Valid actions: create, list, update, delete");
      }

      // 1. Action: create
      if (action === "create") {
        if (!templateNameInput || typeof templateNameInput !== "string" || templateNameInput.trim().length === 0 || templateNameInput.trim().length > 100) {
          throw new Error("Validation Error: 'name' is required (1-100 characters)");
        }
        if (!isValidUUID(walletId)) {
          throw new Error("Validation Error: 'walletId' is required and must be a valid UUID string");
        }
        const sourceWallet = await db.select().from(schema.wallets)
          .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
          .get();
        if (!sourceWallet) {
          throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
        }

        const cleanType = (templateTypeInput === "income" || templateTypeInput === "transfer") ? templateTypeInput : "expense";

        let cleanTargetWalletId: string | null = null;
        if (cleanType === "transfer") {
          if (!isValidUUID(targetWalletId)) {
            throw new Error("Validation Error: 'targetWalletId' is required for transfer recurring templates");
          }
          if (targetWalletId.trim() === walletId.trim()) {
            throw new Error("Validation Error: 'walletId' and 'targetWalletId' cannot be identical for transfers");
          }
          const destWallet = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, targetWalletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (!destWallet) {
            throw new Error(`Target Wallet ID ${targetWalletId.trim()} not found or unauthorized`);
          }
          cleanTargetWalletId = targetWalletId.trim();
        }

        let cleanCategoryId: string | null = null;
        if (categoryId) {
          if (!isValidUUID(categoryId)) throw new Error("Validation Error: 'categoryId' must be a valid UUID string");
          const cat = await db.select().from(schema.categories)
            .where(and(eq(schema.categories.categoryId, categoryId.trim()), eq(schema.categories.categoryUserId, effectiveUserId)))
            .get();
          if (!cat) throw new Error(`Category ID ${categoryId.trim()} not found or unauthorized`);
          cleanCategoryId = categoryId.trim();
        }

        if (!isValidPositiveNumber(amount)) {
          throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
        }

        const cleanAdminFee = adminFee !== undefined ? (isValidFiniteNumber(adminFee) && adminFee >= 0 ? adminFee : null) : 0.0;
        if (cleanAdminFee === null) {
          throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
        }

        const cleanFrequency = ["daily", "weekly", "monthly", "yearly"].includes(frequency) ? frequency : "monthly";
        const cleanInterval = interval !== undefined ? (Number.isInteger(interval) && interval >= 1 ? interval : null) : 1;
        if (cleanInterval === null) {
          throw new Error("Validation Error: 'interval' must be an integer greater than or equal to 1");
        }

        if (!startDate || !isValidIsoDateOrTimestamp(startDate)) {
          throw new Error("Validation Error: 'startDate' is required in valid ISO format (e.g. YYYY-MM-DD)");
        }
        const cleanStartDate = startDate.trim().split("T")[0];

        const cleanNextRunDate = nextRunDate && isValidIsoDateOrTimestamp(nextRunDate)
          ? nextRunDate.trim().split("T")[0]
          : cleanStartDate;

        if (endDate && !isValidIsoDateOrTimestamp(endDate)) {
          throw new Error("Validation Error: 'endDate' must be in valid ISO format (e.g. YYYY-MM-DD)");
        }
        const cleanEndDate = endDate ? endDate.trim().split("T")[0] : null;

        if (notes && (typeof notes !== "string" || notes.length > 500)) {
          throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
        }

        const activeFlag = isActive === false ? 0 : 1;

        const newTemplate = await db.insert(schema.recurringTemplates).values({
          templateUserId: effectiveUserId,
          templateName: templateNameInput.trim(),
          templateWalletId: walletId.trim(),
          templateTargetWalletId: cleanTargetWalletId,
          templateCategoryId: cleanCategoryId,
          templateAmount: amount,
          templateAdminFee: cleanAdminFee,
          templateType: cleanType,
          templateFrequency: cleanFrequency,
          templateInterval: cleanInterval,
          templateStartDate: cleanStartDate,
          templateNextRunDate: cleanNextRunDate,
          templateEndDate: cleanEndDate,
          templateIsActive: activeFlag,
          templateNotes: notes ? notes.trim() : null,
        }).returning();

        return { content: [{ type: "text", text: JSON.stringify(newTemplate[0], null, 2) }] };
      }

      // 2. Action: list
      if (action === "list") {
        const conditions = [eq(schema.recurringTemplates.templateUserId, effectiveUserId)];
        if (isActive !== undefined) {
          conditions.push(eq(schema.recurringTemplates.templateIsActive, isActive ? 1 : 0));
        }

        const list = await db.select().from(schema.recurringTemplates)
          .where(and(...conditions))
          .orderBy(desc(schema.recurringTemplates.templateCreatedAt));

        return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
      }

      // 3. Action: update
      if (action === "update") {
        if (!isValidUUID(templateId)) {
          throw new Error("Validation Error: Valid string 'templateId' (UUID) is required for update");
        }
        const cleanTemplateId = (templateId as string).trim();
        const existingTemplate = await db.select().from(schema.recurringTemplates)
          .where(and(eq(schema.recurringTemplates.templateId, cleanTemplateId), eq(schema.recurringTemplates.templateUserId, effectiveUserId)))
          .get();

        if (!existingTemplate) {
          throw new Error(`Recurring Template ID ${cleanTemplateId} not found or unauthorized`);
        }

        const updateData: Partial<typeof schema.recurringTemplates.$inferInsert> = {};
        if (templateNameInput !== undefined) {
          if (typeof templateNameInput !== "string" || templateNameInput.trim().length === 0 || templateNameInput.trim().length > 100) {
            throw new Error("Validation Error: 'name' must be 1-100 characters");
          }
          updateData.templateName = templateNameInput.trim();
        }
        if (walletId !== undefined) {
          if (!isValidUUID(walletId)) throw new Error("Validation Error: 'walletId' must be a valid UUID string");
          const w = await db.select().from(schema.wallets)
            .where(and(eq(schema.wallets.walletId, walletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
            .get();
          if (!w) throw new Error(`Wallet ID ${walletId.trim()} not found or unauthorized`);
          updateData.templateWalletId = walletId.trim();
        }
        if (targetWalletId !== undefined) {
          if (targetWalletId) {
            if (!isValidUUID(targetWalletId)) throw new Error("Validation Error: 'targetWalletId' must be a valid UUID string");
            const tw = await db.select().from(schema.wallets)
              .where(and(eq(schema.wallets.walletId, targetWalletId.trim()), eq(schema.wallets.walletUserId, effectiveUserId)))
              .get();
            if (!tw) throw new Error(`Target Wallet ID ${targetWalletId.trim()} not found or unauthorized`);
            updateData.templateTargetWalletId = targetWalletId.trim();
          } else {
            updateData.templateTargetWalletId = null;
          }
        }
        if (categoryId !== undefined) {
          if (categoryId) {
            if (!isValidUUID(categoryId)) throw new Error("Validation Error: 'categoryId' must be a valid UUID string");
            const cat = await db.select().from(schema.categories)
              .where(and(eq(schema.categories.categoryId, categoryId.trim()), eq(schema.categories.categoryUserId, effectiveUserId)))
              .get();
            if (!cat) throw new Error(`Category ID ${categoryId.trim()} not found or unauthorized`);
            updateData.templateCategoryId = categoryId.trim();
          } else {
            updateData.templateCategoryId = null;
          }
        }
        if (amount !== undefined) {
          if (!isValidPositiveNumber(amount)) throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
          updateData.templateAmount = amount;
        }
        if (adminFee !== undefined) {
          if (!isValidFiniteNumber(adminFee) || adminFee < 0) throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
          updateData.templateAdminFee = adminFee;
        }
        if (templateTypeInput !== undefined) {
          if (!["expense", "income", "transfer"].includes(templateTypeInput)) {
            throw new Error("Validation Error: 'type' must be 'expense', 'income', or 'transfer'");
          }
          updateData.templateType = templateTypeInput;
        }
        if (frequency !== undefined) {
          if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
            throw new Error("Validation Error: 'frequency' must be 'daily', 'weekly', 'monthly', or 'yearly'");
          }
          updateData.templateFrequency = frequency;
        }
        if (interval !== undefined) {
          if (!Number.isInteger(interval) || interval < 1) {
            throw new Error("Validation Error: 'interval' must be an integer >= 1");
          }
          updateData.templateInterval = interval;
        }
        if (startDate !== undefined) {
          if (!isValidIsoDateOrTimestamp(startDate)) throw new Error("Validation Error: 'startDate' must be in valid ISO format");
          updateData.templateStartDate = startDate.trim().split("T")[0];
        }
        if (nextRunDate !== undefined) {
          if (!isValidIsoDateOrTimestamp(nextRunDate)) throw new Error("Validation Error: 'nextRunDate' must be in valid ISO format");
          updateData.templateNextRunDate = nextRunDate.trim().split("T")[0];
        }
        if (endDate !== undefined) {
          if (endDate && !isValidIsoDateOrTimestamp(endDate)) throw new Error("Validation Error: 'endDate' must be in valid ISO format");
          updateData.templateEndDate = endDate ? endDate.trim().split("T")[0] : null;
        }
        if (isActive !== undefined) {
          updateData.templateIsActive = isActive ? 1 : 0;
        }
        if (notes !== undefined) {
          if (notes && (typeof notes !== "string" || notes.length > 500)) {
            throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
          }
          updateData.templateNotes = notes ? notes.trim() : null;
        }

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: JSON.stringify(existingTemplate, null, 2) }] };
        }

        const updated = await db.update(schema.recurringTemplates)
          .set(updateData)
          .where(and(eq(schema.recurringTemplates.templateId, cleanTemplateId), eq(schema.recurringTemplates.templateUserId, effectiveUserId)))
          .returning();

        return { content: [{ type: "text", text: JSON.stringify(updated[0], null, 2) }] };
      }

      // 4. Action: delete
      if (action === "delete") {
        if (!isValidUUID(templateId)) {
          throw new Error("Validation Error: Valid string 'templateId' (UUID) is required for delete");
        }
        const cleanTemplateId = (templateId as string).trim();
        const deleted = await db.delete(schema.recurringTemplates)
          .where(and(eq(schema.recurringTemplates.templateId, cleanTemplateId), eq(schema.recurringTemplates.templateUserId, effectiveUserId)))
          .returning();

        if (deleted.length === 0) {
          throw new Error(`Recurring Template ID ${cleanTemplateId} not found or unauthorized`);
        }

        return { content: [{ type: "text", text: JSON.stringify({ message: "Recurring template deleted successfully", template: deleted[0] }, null, 2) }] };
      }

      throw new Error(`Invalid action '${action}' for manage_recurring_template. Valid actions: create, list, update, delete`);
    }

    // --- Tool: apply_recurring_template ---
    if (name === "apply_recurring_template") {
      const { templateId, executionDate } = (args || {}) as any;

      if (!isValidUUID(templateId)) {
        throw new Error("Validation Error: Valid string 'templateId' (UUID) is required for apply_recurring_template");
      }
      const cleanTemplateId = (templateId as string).trim();
      const template = await db.select().from(schema.recurringTemplates)
        .where(and(eq(schema.recurringTemplates.templateId, cleanTemplateId), eq(schema.recurringTemplates.templateUserId, effectiveUserId)))
        .get();

      if (!template) {
        throw new Error(`Recurring Template ID ${cleanTemplateId} not found or unauthorized`);
      }

      if (executionDate !== undefined && !isValidIsoDateOrTimestamp(executionDate)) {
        throw new Error("Validation Error: 'executionDate' must be in valid ISO format");
      }
      const txDate = executionDate ? normalizeToIsoTimestamp(executionDate) : `${template.templateNextRunDate}T12:00:00.000Z`;

      const fee = template.templateAdminFee || 0.0;
      const amt = template.templateAmount;
      const totalOutflow = amt + fee;

      // Check wallet existence
      const sourceWallet = await db.select().from(schema.wallets)
        .where(and(eq(schema.wallets.walletId, template.templateWalletId), eq(schema.wallets.walletUserId, effectiveUserId)))
        .get();
      if (!sourceWallet) {
        throw new Error(`Source wallet ID ${template.templateWalletId} not found or unauthorized`);
      }

      // Execute atomic transaction creation
      const newTx = await db.insert(schema.transactions).values({
        transactionUserId: effectiveUserId,
        transactionWalletId: template.templateWalletId,
        transactionTargetWalletId: template.templateTargetWalletId,
        transactionCategoryId: template.templateCategoryId,
        transactionAmount: amt,
        transactionAdminFee: fee,
        transactionType: template.templateType,
        transactionDescription: `[Recurring] ${template.templateName}`,
        transactionIsPlanned: 0,
        transactionDate: txDate,
      }).returning();

      // Reconcile wallet balance atomically
      if (template.templateType === "expense") {
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance - ${totalOutflow}` })
          .where(and(eq(schema.wallets.walletId, template.templateWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
      } else if (template.templateType === "income") {
        const netIncome = amt - fee;
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${netIncome}` })
          .where(and(eq(schema.wallets.walletId, template.templateWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
      } else if (template.templateType === "transfer" && template.templateTargetWalletId) {
        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance - ${totalOutflow}` })
          .where(and(eq(schema.wallets.walletId, template.templateWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));

        await db.update(schema.wallets)
          .set({ walletBalance: sql`wallet_balance + ${amt}` })
          .where(and(eq(schema.wallets.walletId, template.templateTargetWalletId), eq(schema.wallets.walletUserId, effectiveUserId)));
      }

      // Advance template nextRunDate
      const nextDate = calculateNextRunDate(
        template.templateNextRunDate,
        template.templateFrequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
        template.templateInterval
      );

      const updatedTemplate = await db.update(schema.recurringTemplates)
        .set({ templateNextRunDate: nextDate })
        .where(and(eq(schema.recurringTemplates.templateId, cleanTemplateId), eq(schema.recurringTemplates.templateUserId, effectiveUserId)))
        .returning();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "Recurring template successfully applied",
            transaction: newTx[0],
            template: updatedTemplate[0],
          }, null, 2)
        }]
      };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}
