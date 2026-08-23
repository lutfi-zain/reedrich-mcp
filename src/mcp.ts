import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { sql, eq } from "drizzle-orm";
import * as schema from "./db/schema";
import {
  DEFAULT_CATEGORIES,
  evaluateOnboarding,
  registerUser,
  loginUser,
  resolveUserFromKeyOrToken,
  listWallets,
  createWallet,
  updateWallet,
  listCategories,
  createCategory,
  seedDefaultCategories,
  listBudgets,
  createBudget,
  getBudgetStatus,
  recordTransaction,
  updateTransaction,
  listTransactions,
  transferFunds,
  createDebtLoan,
  listDebtsLoans,
  repayDebtLoan,
  updateDebtLoan,
  getActiveDebtsLoansSummary,
  getFinancialSummary,
  submitFeedback,
  type OnboardingStatus,
} from "./services";

export { DEFAULT_CATEGORIES, evaluateOnboarding, type OnboardingStatus };

export type MCPOptions = {
  githubToken?: string;
  githubRepo?: string;
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

    if (args && typeof args === "object") {
      const candidate = (args as { apiKey?: string; token?: string }).apiKey || (args as { apiKey?: string; token?: string }).token;
      if (candidate && typeof candidate === "string") {
        const resolved = await resolveUserFromKeyOrToken(db, jwtSecret, candidate);
        if (resolved) return resolved.userId;
      }
    }

    return null;
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
        description: "Returns table structures and relationship definitions for Reedrich DB.",
      },
      {
        uri: "reedrich://wallets/list",
        name: "User Wallets List",
        mimeType: "application/json",
        description: "Returns current list of active wallets and balances for the authenticated user.",
      },
      {
        uri: "reedrich://budgets/active",
        name: "Active Budgets Utilization",
        mimeType: "application/json",
        description: "Returns currently active budgets and calculated spending utilization.",
      },
      {
        uri: "reedrich://debts/active",
        name: "Active Debts and Loans",
        mimeType: "application/json",
        description: "Returns active/unpaid debts and loans with calculated totals for the authenticated user.",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "reedrich://db/schema") {
      const schemaDef = {
        tables: {
          users: [
            "user_id (PK UUID)", "user_first_name", "user_last_name", "user_email (UNIQUE)",
            "user_whatsapp_number", "user_api_key_hash (UNIQUE)", "user_created_at",
          ],
          wallets: [
            "wallet_id (PK UUID)", "wallet_user_id (FK CASCADE)", "wallet_name", "wallet_institution",
            "wallet_type", "wallet_balance", "wallet_currency", "wallet_created_at",
          ],
          categories: [
            "category_id (PK UUID)", "category_user_id (FK CASCADE)", "category_name", "category_type",
            "category_icon", "category_created_at",
          ],
          budgets: [
            "budget_id (PK UUID)", "budget_user_id (FK CASCADE)", "budget_name", "budget_category_id (FK SET NULL)",
            "budget_amount", "budget_period_start", "budget_period_end", "budget_created_at",
          ],
          transactions: [
            "transaction_id (PK UUID)", "transaction_user_id (FK CASCADE)", "transaction_wallet_id (FK CASCADE)",
            "transaction_target_wallet_id (FK SET NULL)", "transaction_category_id (FK SET NULL)", "transaction_budget_id (FK SET NULL)",
            "transaction_amount", "transaction_admin_fee", "transaction_type", "transaction_description",
            "transaction_is_planned", "transaction_date (ISO-8601 TZ)", "transaction_created_at",
          ],
          debts_loans: [
            "debt_loan_id (PK UUID)", "debt_loan_user_id (FK CASCADE)", "debt_loan_person_name", "debt_loan_type (debt|loan)",
            "debt_loan_amount", "debt_loan_remaining_amount", "debt_loan_wallet_id (FK SET NULL)", "debt_loan_due_date",
            "debt_loan_status (unpaid|partially_paid|paid)", "debt_loan_notes", "debt_loan_created_at",
          ],
        },
        indexes: {
          users: ["users_email_idx", "users_api_key_hash_idx"],
          wallets: ["wallets_user_id_idx", "wallets_institution_idx"],
          categories: ["categories_user_id_idx"],
          budgets: ["budgets_user_period_idx", "budgets_category_id_idx"],
          transactions: [
            "transactions_user_date_idx", "transactions_wallet_id_idx", "transactions_target_wallet_id_idx",
            "transactions_category_id_idx", "transactions_budget_id_idx",
          ],
          debts_loans: [
            "debts_loans_user_status_idx", "debts_loans_user_due_date_idx", "debts_loans_wallet_id_idx",
          ],
        },
      };
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(schemaDef, null, 2),
          },
        ],
      };
    }

    // Require authentication for user-specific resources
    const effectiveUserId = await resolveEffectiveUserId();
    if (!effectiveUserId) {
      throw new Error("Unauthorized: Session token is missing or expired. Please set 'Authorization: Bearer <apiKey>' in your MCP client headers or call 'login_user' / 'register_user'.");
    }

    if (uri === "reedrich://wallets/list") {
      const userWallets = await listWallets(db, effectiveUserId);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(userWallets, null, 2),
          },
        ],
      };
    }

    if (uri === "reedrich://budgets/active") {
      const statusList = await getBudgetStatus(db, effectiveUserId);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(statusList, null, 2),
          },
        ],
      };
    }

    if (uri === "reedrich://debts/active") {
      const debtsSummary = await getActiveDebtsLoansSummary(db, effectiveUserId);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              totalDebt: debtsSummary.totalDebt,
              totalReceivable: debtsSummary.totalReceivable,
              activeCount: debtsSummary.activeCount,
              records: debtsSummary.activeRecords,
            }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource '${uri}' not found`);
  });

  // ---------------------------------------------------------------------------
  // 2. Prompts Registry & Handlers
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "onboarding_assistant",
        description: "Step-by-step guidance for setting up a new user account with primary wallets and default categories.",
        arguments: [
          {
            name: "currency",
            description: "Primary currency for the user's financial setup (default: 'IDR')",
            required: false,
          },
        ],
      },
      {
        name: "daily_briefing",
        description: "Structured template for compiling a comprehensive daily financial briefing (balances, budgets, debts, cash flow).",
        arguments: [
          {
            name: "date",
            description: "Target date in ISO format (YYYY-MM-DD) for the daily briefing",
            required: false,
          },
        ],
      },
      {
        name: "financial_planning",
        description: "Reasoning framework for projecting when a target financial goal can be achieved based on income, expenses, and debts.",
        arguments: [
          {
            name: "goal_description",
            description: "Description of the target goal (e.g. 'Beli Mobil Baru', 'Dana Darurat 6 Bulan')",
            required: true,
          },
          {
            name: "target_amount",
            description: "Total cost / target amount needed in user currency",
            required: true,
          },
        ],
      },
      {
        name: "debt_loan_advisor",
        description: "Actionable strategy and prioritization guide for managing personal debts (payables) and loans (receivables).",
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "onboarding_assistant") {
      const currency = ((args?.currency as string) || "IDR");
      return {
        description: "Step-by-step guidance for setting up a new user account with wallets and default categories in Reedrich.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Onboarding Assistant. Guide the user through setting up their financial workspace step by step:

1. Check Onboarding Status:
   - Review the \`onboarding\` object from the user's login or registration response.
   - If \`hasWallets\` is false, ask the user if they want to create their primary wallet (e.g. Cash, Bank BCA, Mandiri, GoPay) using currency '${currency}'.
   - Tool to use: \`manage_wallet\` with \`action: "create"\`, \`name\`, \`institution\`, \`type\` (bank/ewallet/cash), \`balance\`, \`currency: "${currency}"\`.

2. Default Categories Setup (User Confirmation Required):
   - Ask the user: "Would you like me to set up standard categories for you (Makanan & Minuman 🍔, Transportasi 🚗, Tagihan & Utilitas 💡, Belanja 🛍️, Gaji 💼, etc.)?"
   - If the user confirms, invoke \`manage_category\` with \`action: "seed_defaults"\`.
   - If the user prefers custom categories, create them with \`manage_category\` using \`action: "create"\`.

3. Optional Budget Setup:
   - Once at least one wallet and category exist, offer to set monthly spending budgets for key categories.
   - Remind the user that budget setup is completely optional.
   - Tool to use: \`manage_budget\` with \`action: "create"\`, \`name\`, \`categoryId\`, \`amount\`, \`periodStart\`, \`periodEnd\`.

4. Completion:
   - Confirm that the user is now ready to record daily transactions using \`record_transaction\` or transfer funds using \`transfer_funds\`.`,
            },
          },
        ],
      };
    }

    if (name === "daily_briefing") {
      const targetDate = ((args?.date as string) || "");
      return {
        description: "Structured instructions for compiling a daily financial briefing.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are the Reedrich Financial Analyst. Generate a comprehensive daily financial status report for the user${targetDate ? ` for date ${targetDate}` : ""}:

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
   - Provide a clear, structured markdown summary with actionable takeaways and positive reinforcement.`,
            },
          },
        ],
      };
    }

    if (name === "financial_planning") {
      const goalDescription = ((args?.goal_description as string) || "");
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
   - Provide 2-3 practical tips on how cutting discretionary expenses could accelerate the timeline.`,
            },
          },
        ],
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
   - For collecting loans: suggest checking in with counterparties whose due dates have passed.`,
            },
          },
        ],
      };
    }

    throw new Error(`Prompt '${name}' not found`);
  });

  // ---------------------------------------------------------------------------
  // 3. Tools Registry
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "register_user",
        description: "Register a new user account with first name, last name, email, and WhatsApp number. Returns a persistent API Key (rd_live_...) and 15-minute JWT.",
        inputSchema: {
          type: "object",
          properties: {
            firstName: { type: "string", description: "User's first name (1-100 characters)" },
            lastName: { type: "string", description: "User's last name (1-100 characters)" },
            email: { type: "string", description: "Valid email address (e.g. user@example.com)" },
            whatsappNumber: { type: "string", description: "WhatsApp phone number with '+' and country code (e.g. +6281234567890)" },
          },
          required: ["firstName", "lastName", "email", "whatsappNumber"],
        },
      },
      {
        name: "login_user",
        description: "Authenticate with your persistent API Key (rd_live_... or legacy fp_live_...) to obtain a fresh 15-minute JWT session token.",
        inputSchema: {
          type: "object",
          properties: {
            apiKey: { type: "string", description: "Your persistent API Key (e.g. rd_live_...)" },
          },
          required: ["apiKey"],
        },
      },
      {
        name: "submit_feedback",
        description: "Submit user feedback, feature request, question, or bug report. Automatically creates a GitHub issue in the repository and logs the submitter's name, email, and timestamp.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short summary of feedback or issue (5-200 characters)" },
            feedback: { type: "string", description: "Detailed feedback, bug description, or feature request (10-4000 characters)" },
            type: {
              type: "string",
              enum: ["feedback", "bug", "feature_request", "question"],
              default: "feedback",
              description: "Category of feedback: feedback, bug, feature_request, or question",
            },
            name: { type: "string", description: "Optional: Submitter's full name (auto-resolved from profile if authenticated)" },
            email: { type: "string", description: "Optional: Submitter's email address (auto-resolved from profile if authenticated)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["title", "feedback"],
        },
      },
      {
        name: "record_transaction",
        description: "Record a financial transaction (expense or income) with optional admin fee and ISO timezone timestamp. Automatically and atomically updates wallet balance.",
        inputSchema: {
          type: "object",
          properties: {
            walletId: { type: "string", description: "Valid UUID of the source wallet/pocket where funds were spent or received" },
            categoryId: { type: "string", description: "Valid UUID of the transaction category" },
            budgetId: { type: "string", description: "Optional: UUID of the associated spending budget" },
            amount: { type: "number", description: "Transaction nominal amount (positive finite number > 0)" },
            adminFee: { type: "number", default: 0.0, description: "Optional admin/convenience fee incurred (e.g. 2500, 6500). Defaults to 0" },
            type: { type: "string", enum: ["expense", "income"], description: "Type of transaction: expense or income" },
            description: { type: "string", description: "Optional memo or description for the transaction (max 500 characters)" },
            isPlanned: { type: "boolean", default: false, description: "Whether this transaction is a planned/future simulation or actual recorded spending" },
            transactionDate: { type: "string", description: "Optional ISO-8601 timestamp with timezone (e.g. 2026-08-23T14:30:00+07:00 or YYYY-MM-DD). Defaults to current UTC timestamp" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["walletId", "categoryId", "amount", "type"],
        },
      },
      {
        name: "transfer_funds",
        description: "Transfer funds between two wallets with optional admin fee. Atomically debits source wallet (amount + adminFee) and credits target wallet (amount).",
        inputSchema: {
          type: "object",
          properties: {
            sourceWalletId: { type: "string", description: "Valid UUID of the sending/origin wallet" },
            targetWalletId: { type: "string", description: "Valid UUID of the receiving/destination wallet" },
            amount: { type: "number", description: "Transfer principal amount (positive finite number > 0)" },
            adminFee: { type: "number", default: 0.0, description: "Optional transfer/admin fee incurred on source wallet (e.g. 6500 for BI-FAST). Defaults to 0" },
            categoryId: { type: "string", description: "Optional category ID for transfer fee tracking (defaults to 'Transfer Antar Dompet')" },
            description: { type: "string", description: "Optional memo for the transfer (max 500 characters)" },
            isPlanned: { type: "boolean", default: false, description: "Whether this is a planned future transfer simulation (does not update wallet balance) or actual transfer" },
            transactionDate: { type: "string", description: "Optional ISO-8601 timestamp (e.g. 2026-08-23T14:30:00+07:00). Defaults to current timestamp" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["sourceWalletId", "targetWalletId", "amount"],
        },
      },
      {
        name: "update_transaction",
        description: "Update an existing transaction (amount, admin fee, wallet, category, budget, date, note, or planned status) with automatic atomic balance reconciliation.",
        inputSchema: {
          type: "object",
          properties: {
            transactionId: { type: "string", description: "UUID of the transaction to update" },
            amount: { type: "number", description: "New nominal amount (> 0)" },
            adminFee: { type: "number", description: "New admin fee (>= 0)" },
            walletId: { type: "string", description: "New source wallet UUID" },
            targetWalletId: { type: "string", description: "New target wallet UUID (or empty string/null to unset)" },
            categoryId: { type: "string", description: "New category UUID" },
            budgetId: { type: "string", description: "New budget UUID" },
            description: { type: "string", description: "New description / memo" },
            transactionDate: { type: "string", description: "New ISO date / timestamp" },
            isPlanned: { type: "boolean", description: "Change planned/simulation status" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["transactionId"],
        },
      },
      {
        name: "manage_wallet",
        description: "Manage wallets and pockets: list all wallets, create a new wallet/pocket (with institution grouping like BCA, Bank Jago, Bitget), or update an existing wallet.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "update"], description: "Action to perform: list, create, or update" },
            walletId: { type: "string", description: "Required for 'update': UUID of the wallet to update" },
            name: { type: "string", description: "Required for 'create', optional for 'update': Name of wallet/pocket (e.g. 'Tabungan Utama', 'Kantong Jajan')" },
            institution: { type: "string", description: "Financial institution or bank name (e.g. 'Bank BCA', 'Bank Jago', 'GoPay', 'Bibit', 'Cash'). Defaults to 'General'" },
            type: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"], description: "Pocket type category. Defaults to 'bank'" },
            balance: { type: "number", description: "Initial balance or updated balance" },
            currency: { type: "string", description: "Currency ISO code (e.g. 'IDR', 'USD'). Defaults to 'IDR'" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_category",
        description: "Manage categories: list existing categories, create a new category, or seed standard default categories.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "seed_defaults"], description: "Action: list, create, or seed_defaults" },
            name: { type: "string", description: "Required for 'create': Category name (e.g. 'Kopi & Nongkrong', 'Langganan AI')" },
            type: { type: "string", enum: ["expense", "income"], default: "expense", description: "Type: expense or income" },
            icon: { type: "string", description: "Optional emoji icon (e.g. '☕', '🤖')" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_budget",
        description: "Manage financial budgets with active date windows. Create, list, or check budget status vs actual spending.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["list", "create", "status"], description: "Action: list, create, or status" },
            name: { type: "string", description: "Required for 'create': Name of the budget (e.g. 'Makan Bulanan')" },
            categoryId: { type: "string", description: "Optional category UUID to bind this budget to a specific expense category" },
            amount: { type: "number", description: "Budget limit amount (> 0)" },
            periodStart: { type: "string", description: "Start date (YYYY-MM-DD or ISO timestamp)" },
            periodEnd: { type: "string", description: "End date (YYYY-MM-DD or ISO timestamp)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["action"],
        },
      },
      {
        name: "manage_debt_loan",
        description: "Manage personal debts (liabilities/payable) and loans (receivables). Create debt/loan, list with filters, record repayments (full/partial), or update details.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["create", "list", "repay", "update"], description: "Action: create, list, repay, or update" },
            debtLoanId: { type: "string", description: "Required for 'repay' and 'update': UUID of debt/loan record" },
            type: { type: "string", enum: ["debt", "loan"], description: "Type: 'debt' (payable/hutang kita) or 'loan' (receivable/piutang kita)" },
            personName: { type: "string", description: "Counterparty person/institution name (e.g. 'Budi Santoso', 'Bank BCA')" },
            amount: { type: "number", description: "Principal amount (> 0) on create, or repayment amount on repay" },
            walletId: { type: "string", description: "Optional wallet UUID to automatically credit/debit on create or repay" },
            dueDate: { type: "string", description: "Optional due date (YYYY-MM-DD)" },
            notes: { type: "string", description: "Optional notes / memo" },
            status: { type: "string", enum: ["unpaid", "partially_paid", "paid"], description: "Filter status for list or new status for update" },
            adjustWalletBalance: { type: "boolean", default: true, description: "Whether to automatically adjust wallet balance (default: true)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
          required: ["action"],
        },
      },
      {
        name: "list_transactions",
        description: "Query transactions with structured filters (wallet, target wallet, category, budget, type, date range, is_planned, pagination).",
        inputSchema: {
          type: "object",
          properties: {
            walletId: { type: "string", description: "Filter by source wallet UUID" },
            targetWalletId: { type: "string", description: "Filter by destination wallet UUID for transfers" },
            categoryId: { type: "string", description: "Filter by category UUID" },
            budgetId: { type: "string", description: "Filter by budget UUID" },
            type: { type: "string", enum: ["expense", "income", "transfer"], description: "Filter by transaction type" },
            isPlanned: { type: "boolean", description: "Filter by actual (false) or simulated/planned (true)" },
            startDate: { type: "string", description: "Start date filter in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)" },
            endDate: { type: "string", description: "End date filter in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)" },
            limit: { type: "number", default: 50, description: "Max number of records (1-200, default: 50)" },
            offset: { type: "number", default: 0, description: "Pagination offset (default: 0)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
        },
      },
      {
        name: "financial_summary",
        description: "Generate a complete financial report grouped by currency and institution (net worth, income, expenses, admin fees, category breakdown, total debt, total receivable).",
        inputSchema: {
          type: "object",
          properties: {
            startDate: { type: "string", description: "Optional start date filter in ISO format (YYYY-MM-DD or ISO timestamp)" },
            endDate: { type: "string", description: "Optional end date filter in ISO format (YYYY-MM-DD or ISO timestamp)" },
            apiKey: { type: "string", description: "Optional: Your persistent API Key (rd_live_...) if not set in headers" },
          },
        },
      },
    ],
  }));

  // ---------------------------------------------------------------------------
  // 4. Tool Execution Handlers
  // ---------------------------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // --- Tool: register_user ---
    if (name === "register_user") {
      const { firstName, lastName, email, whatsappNumber } = (args || {}) as any;
      const result = await registerUser(db, jwtSecret, { firstName, lastName, email, whatsappNumber });
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
      const resolvedUserId = await resolveEffectiveUserId(args);
      const { title, feedback, type, name: userName, email: userEmail } = (args || {}) as any;
      const result = await submitFeedback(db, resolvedUserId, { title, feedback, type, name: userName, email: userEmail }, {
        githubToken: options?.githubToken,
        githubRepo: options?.githubRepo,
        fetchFn: options?.fetchFn,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // -------------------------------------------------------------------------
    // Guard: Require Authentication for All Finance Tools Below
    // -------------------------------------------------------------------------
    const effectiveUserId = await resolveEffectiveUserId(args);
    if (!effectiveUserId) {
      throw new Error("Unauthorized: Please provide your 'apiKey' in tool arguments (e.g. apiKey: 'fp_live_...'), or set 'Authorization: Bearer <apiKey>' in your MCP client headers, or call 'register_user' to create an account.");
    }

    // --- Tool: manage_wallet ---
    if (name === "manage_wallet") {
      const { action, name: walletName, institution, type, balance, currency, walletId } = (args || {}) as any;
      if (action === "list") {
        const result = await listWallets(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createWallet(db, effectiveUserId, { name: walletName, institution, type, balance, currency });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const result = await updateWallet(db, effectiveUserId, { walletId, name: walletName, institution, type, balance, currency });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_wallet. Valid actions: list, create, update`);
    }

    // --- Tool: manage_category ---
    if (name === "manage_category") {
      const { action, name: catName, type, icon } = (args || {}) as any;
      if (action === "list") {
        const result = await listCategories(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createCategory(db, effectiveUserId, { name: catName, type, icon });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "seed_defaults") {
        const result = await seedDefaultCategories(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_category. Valid actions: list, create, seed_defaults`);
    }

    // --- Tool: manage_budget ---
    if (name === "manage_budget") {
      const { action, name: budgetName, categoryId, amount, periodStart, periodEnd } = (args || {}) as any;
      if (action === "list") {
        const result = await listBudgets(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "create") {
        const result = await createBudget(db, effectiveUserId, { name: budgetName, categoryId, amount, periodStart, periodEnd });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "status") {
        const result = await getBudgetStatus(db, effectiveUserId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
              error: "Cannot record transaction: No wallets found. You must create at least one wallet before recording transactions.",
              suggestion: "onboarding_assistant",
              message: "Please create at least one wallet first (e.g. Cash, Bank BCA, Mandiri, GoPay) using tool 'manage_wallet' with action: 'create'.",
              actionRequired: "create_wallet",
              onboardingStep: "wallet_creation",
            }, null, 2),
          }],
          isError: true,
        };
      }

      const { walletId, categoryId, budgetId, amount, adminFee, type, description, isPlanned, transactionDate } = (args || {}) as any;
      const tx = await recordTransaction(db, effectiveUserId, { walletId, categoryId, budgetId, amount, adminFee, type, description, isPlanned, transactionDate });
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }] };
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
              error: "Cannot transfer funds: No wallets found. You must create at least two wallets before transferring funds.",
              suggestion: "onboarding_assistant",
              message: "Please create at least two wallets first (e.g. Bank BCA and GoPay) using tool 'manage_wallet' with action: 'create'.",
              actionRequired: "create_wallet",
              onboardingStep: "wallet_creation",
            }, null, 2),
          }],
          isError: true,
        };
      }

      if (Number(walletCheck?.count || 0) < 2) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Cannot transfer funds: You only have one wallet.",
              message: "A fund transfer requires at least two distinct wallets. Please create an additional wallet using tool 'manage_wallet' with action: 'create'.",
              actionRequired: "create_additional_wallet",
              onboardingStep: "wallet_creation",
            }, null, 2),
          }],
          isError: true,
        };
      }

      const { sourceWalletId, targetWalletId, amount, adminFee, categoryId, description, isPlanned, transactionDate } = (args || {}) as any;
      const tx = await transferFunds(db, effectiveUserId, { sourceWalletId, targetWalletId, amount, adminFee, categoryId, description, isPlanned, transactionDate });
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }] };
    }

    // --- Tool: update_transaction ---
    if (name === "update_transaction") {
      const { transactionId, amount, adminFee, walletId, targetWalletId, categoryId, budgetId, description, transactionDate, isPlanned } = (args || {}) as any;
      const updated = await updateTransaction(db, effectiveUserId, { transactionId, amount, adminFee, walletId, targetWalletId, categoryId, budgetId, description, transactionDate, isPlanned });
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    // --- Tool: list_transactions ---
    if (name === "list_transactions") {
      const { walletId, targetWalletId, categoryId, budgetId, type, isPlanned, startDate, endDate, limit, offset } = (args || {}) as any;
      const txs = await listTransactions(db, effectiveUserId, { walletId, targetWalletId, categoryId, budgetId, type, isPlanned, startDate, endDate, limit, offset });
      return { content: [{ type: "text", text: JSON.stringify(txs, null, 2) }] };
    }

    // --- Tool: financial_summary ---
    if (name === "financial_summary") {
      const { startDate, endDate } = (args || {}) as any;
      const summary = await getFinancialSummary(db, effectiveUserId, { startDate, endDate });
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }

    // --- Tool: manage_debt_loan ---
    if (name === "manage_debt_loan") {
      const { action, debtLoanId, type, personName, amount, walletId, dueDate, notes, status, adjustWalletBalance } = (args || {}) as any;

      if (action === "create") {
        const record = await createDebtLoan(db, effectiveUserId, { personName, type, amount, walletId, dueDate, notes, adjustWalletBalance });
        return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
      }
      if (action === "list") {
        const results = await listDebtsLoans(db, effectiveUserId, { type, status });
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      if (action === "repay") {
        const result = await repayDebtLoan(db, effectiveUserId, { debtLoanId, amount, walletId, notes, adjustWalletBalance });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      if (action === "update") {
        const updated = await updateDebtLoan(db, effectiveUserId, { debtLoanId, personName, dueDate, notes, status });
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }
      throw new Error(`Invalid action '${action}' for manage_debt_loan. Valid actions: create, list, repay, update`);
    }

    throw new Error(`Tool '${name}' not found`);
  });

  return server;
}
