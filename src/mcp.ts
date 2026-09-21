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
import { currentIsoTimestamp } from "./utils/date";
import { resolveUserId } from "./middleware/auth";
import { registerUser, loginUser, evaluateOnboarding } from "./services/auth";
import { submitFeedback } from "./services/feedback";
import { listWallets, createWallet, updateWallet } from "./services/wallet";
import {
  DEFAULT_CATEGORIES,
  listCategories,
  createCategory,
  seedDefaults,
} from "./services/category";
import { listBudgets, createBudget, budgetStatus } from "./services/budget";
import {
  listTransactions,
  recordTransaction,
  updateTransaction,
  WalletRequiredError,
} from "./services/transaction";
import { transferFunds, InsufficientWalletsError } from "./services/transfer";
import { financialSummary } from "./services/summary";
import {
  listDebtsLoans,
  createDebtLoan,
  repayDebtLoan,
  updateDebtLoan,
} from "./services/debt-loan";
import {
  listGoals,
  createGoal,
  contributeGoal,
  updateGoal,
  deleteGoal,
  linkGoalWallet,
  unlinkGoalWallet,
} from "./services/goal";
import {
  listRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  applyRecurringTemplate,
} from "./services/recurring";

export { DEFAULT_CATEGORIES } from "./services/category";
export { evaluateOnboarding } from "./services/auth";
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
  async function resolveEffectiveUserId(args?: unknown): Promise<string | null> {
    if (userId) return userId;
    const toolArgs =
      args && typeof args === "object"
        ? (args as { apiKey?: unknown; token?: unknown })
        : null;
    return resolveUserId(db, jwtSecret, { toolArgs });
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
   - Read resource \`reedrich://wallets/list\` to inspect account balances, distinguishing spendable wallets from locked capital reserves (\`walletIsLocked: 1\`).
   - Read resource \`reedrich://budgets/active\` to check current budget utilization and remaining limits.
   - Read resource \`reedrich://debts/active\` to check upcoming debt and loan obligations.
   - Call tool \`financial_summary\` with startDate and endDate${targetDate ? ` around ${targetDate}` : ""} to inspect \`safeToSpend\`, \`dailySafeToSpend\`, \`spendableCash\`, \`lockedCash\`, and cash flow.

2. Analyze & Synthesize:
   - Safe-to-Spend Allowance: Prioritize reporting how much cash is safe to spend today (\`safeToSpend\`, \`dailySafeToSpend\`) without touching protected capital reserves, reassuring the user that locked savings remain intact.
   - Total Net Worth & Segregated Liquidity (\`spendableCash\` vs \`lockedCash\`) across all institutions.
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
   - Call \`financial_summary\` to determine the user's historical monthly income, monthly expenses, net savings rate, and inspect derived goal progress (\`isDerived\`, \`linkedWallets\` breakdown) alongside \`spendableCash\` versus \`lockedCash\`.
   - Read \`reedrich://wallets/list\` to evaluate available idle spendable balances (\`isLocked: false\`), strictly avoiding unprompted allocation of locked emergency reserves (\`isLocked: true\`). For goals with linked wallets, use the derived \`currentAmount\` (sum of linked balances) as the allocated balance.
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
            isLocked: { type: "boolean", description: "Optional: Lock wallet (true) to protect savings/emergency funds from daily Safe-to-Spend runway calculations, or unlock (false)" },
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
        description: "Generate a complete financial overview (Safe-to-Spend runway, spendable vs locked cash, net worth by currency, consolidated net worth, cash flow, active goals pacing, recurring cashflow projections, wallets, debts). PROACTIVE TIP: Always call this first when starting a session or financial planning to inspect current account state.",
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
        description: "Manage personal financial goals: create, list, update, link/unlink wallets, or delete goals with derived progress computed from linked wallet balances.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "list", "update", "link_wallet", "unlink_wallet", "delete"], description: "Action to perform" },
            goalId: { type: "string", description: "Goal UUID (required for update, link_wallet, unlink_wallet, and delete)" },
            name: { type: "string", description: "Goal name (1-100 characters, required for create)" },
            targetAmount: { type: "number", minimum: 0.01, description: "Target savings amount (positive finite number)" },
            currentAmount: { type: "number", minimum: 0, description: "Initial stored amount (used only for goals without linked wallets)" },
            currency: { type: "string", default: "IDR", description: "Currency code (e.g. IDR, USD)" },
            targetDate: { type: "string", description: "Target completion date (YYYY-MM-DD)" },
            walletId: { type: "string", description: "Optional linked wallet UUID (single)" },
            walletIds: { type: "array", items: { type: "string" }, description: "Optional linked wallet UUIDs (multiple)" },
            categoryId: { type: "string", description: "Optional category UUID" },
            status: { type: "string", enum: ["in_progress", "completed", "cancelled"], description: "Goal status" },
            notes: { type: "string", description: "Optional notes (max 500 chars)" },
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
      const result = await registerUser(db, jwtSecret, (args || {}) as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // --- Tool: login_user ---
    if (name === "login_user") {
      const { apiKey } = (args || {}) as any;
      const result = await loginUser(db, jwtSecret, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // --- Tool: submit_feedback ---
    if (name === "submit_feedback") {
      const effectiveUserId = await resolveEffectiveUserId(args);
      const result = await submitFeedback(db, effectiveUserId, (args || {}) as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // -------------------------------------------------------------------------
    // Guard: Require Authentication for All Finance Tools Below
    // -------------------------------------------------------------------------
    const effectiveUserId = await resolveEffectiveUserId(args);
    if (!effectiveUserId) {
      throw new Error(
        "Unauthorized: Please provide your 'apiKey' in tool arguments (e.g. apiKey: 'fp_live_...'), or set 'Authorization: Bearer <apiKey>' in your MCP client headers, or call 'register_user' to create an account."
      );
    }

    // --- Tool: manage_wallet ---
    if (name === "manage_wallet") {
      const { action, walletId, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listWallets(db, effectiveUserId, params.isLocked);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createWallet(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const result = await updateWallet(db, effectiveUserId, walletId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_wallet. Valid actions: list, create, update`);
    }

    // --- Tool: manage_category ---
    if (name === "manage_category") {
      const { action, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listCategories(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createCategory(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "seed_defaults") {
        const result = await seedDefaults(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_category. Valid actions: list, create, seed_defaults`);
    }

    // --- Tool: manage_budget ---
    if (name === "manage_budget") {
      const { action, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listBudgets(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createBudget(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "status") {
        const result = await budgetStatus(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_budget. Valid actions: list, create, status`);
    }

    // --- Tool: record_transaction ---
    if (name === "record_transaction") {
      try {
        const result = await recordTransaction(db, effectiveUserId, (args || {}) as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: err.message,
                actionRequired: err.actionRequired,
                instruction: err.instruction,
              }, null, 2),
            }],
            isError: true,
          };
        }
        throw err;
      }
    }

    // --- Tool: transfer_funds ---
    if (name === "transfer_funds") {
      try {
        const result = await transferFunds(db, effectiveUserId, (args || {}) as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (err instanceof InsufficientWalletsError) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: err.message,
                suggestion: err.suggestion,
              }, null, 2),
            }],
            isError: true,
          };
        }
        throw err;
      }
    }

    // --- Tool: update_transaction ---
    if (name === "update_transaction") {
      const { transactionId, ...params } = (args || {}) as any;
      const result = await updateTransaction(db, effectiveUserId, transactionId, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // --- Tool: list_transactions ---
    if (name === "list_transactions") {
      const result = await listTransactions(db, effectiveUserId, (args || {}) as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // --- Tool: financial_summary ---
    if (name === "financial_summary") {
      const result = await financialSummary(db, effectiveUserId, (args || {}) as any, options?.fetchFn);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // --- Tool: manage_debt_loan ---
    if (name === "manage_debt_loan") {
      const { action, debtLoanId, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listDebtsLoans(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createDebtLoan(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "repay") {
        const result = await repayDebtLoan(db, effectiveUserId, debtLoanId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const result = await updateDebtLoan(db, effectiveUserId, debtLoanId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_debt_loan. Valid actions: create, list, repay, update`);
    }

    // --- Tool: manage_goal ---
    if (name === "manage_goal") {
      const { action, goalId, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listGoals(db, effectiveUserId, params.status);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createGoal(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "link_wallet") {
        const result = await linkGoalWallet(db, effectiveUserId, goalId, params.walletId || (Array.isArray(params.walletIds) ? params.walletIds[0] : undefined), options?.fetchFn);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "unlink_wallet") {
        const result = await unlinkGoalWallet(db, effectiveUserId, goalId, params.walletId || (Array.isArray(params.walletIds) ? params.walletIds[0] : undefined), options?.fetchFn);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const result = await updateGoal(db, effectiveUserId, goalId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "contribute") {
        const result = await contributeGoal(db, effectiveUserId, goalId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "delete") {
        const deleted = await deleteGoal(db, effectiveUserId, goalId);
        return { content: [{ type: "text", text: JSON.stringify({ message: "Goal deleted successfully", goal: deleted }, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_goal. Valid actions: create, list, update, link_wallet, unlink_wallet, delete`);
    }
    // --- Tool: manage_recurring_template ---
    if (name === "manage_recurring_template") {
      const { action, templateId, ...params } = (args || {}) as any;
      if (action === "list") {
        const result = await listRecurringTemplates(db, effectiveUserId, params.isActive);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createRecurringTemplate(db, effectiveUserId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const result = await updateRecurringTemplate(db, effectiveUserId, templateId, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "delete") {
        const deleted = await deleteRecurringTemplate(db, effectiveUserId, templateId);
        return { content: [{ type: "text", text: JSON.stringify({ message: "Recurring template deleted successfully", template: deleted }, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_recurring_template. Valid actions: create, list, update, delete`);
    }

    // --- Tool: apply_recurring_template ---
    if (name === "apply_recurring_template") {
      const { templateId, executionDate } = (args || {}) as any;
      const result = await applyRecurringTemplate(db, effectiveUserId, templateId, executionDate);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}
