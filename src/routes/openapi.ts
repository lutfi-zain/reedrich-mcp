export function generateOpenApiSpec(baseUrl: string = "https://reedrich-mcp.lutfidmz.workers.dev") {
  return {
    openapi: "3.0.0",
    info: {
      title: "Reedrich Financial Intelligence API",
      version: "1.0.0",
      description: "Mathematical Intelligence & Personal Financial Planning Engine for AI Assistants and Custom GPT Actions.",
      contact: {
        name: "Reedrich Support",
        url: "https://github.com/lutfi-zain/reedrich-mcp",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Cloudflare Workers Edge Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your 15-minute JWT session token or persistent API key (rd_live_...)",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
          required: ["error"],
        },
        Wallet: {
          type: "object",
          properties: {
            walletId: { type: "string", format: "uuid" },
            walletUserId: { type: "string" },
            walletName: { type: "string" },
            walletInstitution: { type: "string" },
            walletType: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"] },
            walletBalance: { type: "number" },
            walletCurrency: { type: "string", example: "IDR" },
            walletCreatedAt: { type: "string" },
          },
        },
        Category: {
          type: "object",
          properties: {
            categoryId: { type: "string", format: "uuid" },
            categoryUserId: { type: "string" },
            categoryName: { type: "string" },
            categoryType: { type: "string", enum: ["expense", "income"] },
            categoryIcon: { type: "string", nullable: true },
            categoryCreatedAt: { type: "string" },
          },
        },
        Budget: {
          type: "object",
          properties: {
            budgetId: { type: "string", format: "uuid" },
            budgetUserId: { type: "string" },
            budgetName: { type: "string" },
            budgetCategoryId: { type: "string", format: "uuid", nullable: true },
            budgetAmount: { type: "number" },
            budgetPeriodStart: { type: "string" },
            budgetPeriodEnd: { type: "string" },
            budgetCreatedAt: { type: "string" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            transactionId: { type: "string", format: "uuid" },
            transactionUserId: { type: "string" },
            transactionWalletId: { type: "string", format: "uuid" },
            transactionTargetWalletId: { type: "string", format: "uuid", nullable: true },
            transactionCategoryId: { type: "string", format: "uuid", nullable: true },
            transactionBudgetId: { type: "string", format: "uuid", nullable: true },
            transactionAmount: { type: "number" },
            transactionAdminFee: { type: "number" },
            transactionType: { type: "string", enum: ["expense", "income", "transfer"] },
            transactionDescription: { type: "string", nullable: true },
            transactionIsPlanned: { type: "integer", enum: [0, 1] },
            transactionDate: { type: "string" },
            transactionCreatedAt: { type: "string" },
          },
        },
        DebtLoan: {
          type: "object",
          properties: {
            debtLoanId: { type: "string", format: "uuid" },
            debtLoanUserId: { type: "string" },
            debtLoanPersonName: { type: "string" },
            debtLoanType: { type: "string", enum: ["debt", "loan"] },
            debtLoanAmount: { type: "number" },
            debtLoanRemainingAmount: { type: "number" },
            debtLoanWalletId: { type: "string", format: "uuid", nullable: true },
            debtLoanDueDate: { type: "string", nullable: true },
            debtLoanStatus: { type: "string", enum: ["unpaid", "partially_paid", "paid"] },
            debtLoanNotes: { type: "string", nullable: true },
            debtLoanCreatedAt: { type: "string" },
          },
        },
        FinancialSummary: {
          type: "object",
          properties: {
            netWorthByCurrency: { type: "object", additionalProperties: { type: "number" } },
            netWorthByInstitution: { type: "object", additionalProperties: { type: "number" } },
            totalIncome: { type: "number" },
            totalExpense: { type: "number" },
            totalAdminFees: { type: "number" },
            netSavings: { type: "number" },
            totalDebt: { type: "number" },
            totalReceivable: { type: "number" },
            walletsCount: { type: "integer" },
            transactionsCount: { type: "integer" },
            transfersCount: { type: "integer" },
            categoryBreakdown: { type: "object", additionalProperties: { type: "number" } },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    paths: {
      "/api/v1/summary": {
        get: {
          summary: "Get Financial Summary & Net Worth",
          description: "Generates a complete financial overview (net worth, income, expenses, admin fees, category breakdown, debts, receivables).",
          operationId: "getFinancialSummary",
          parameters: [
            { name: "startDate", in: "query", schema: { type: "string" }, description: "Filter start date (YYYY-MM-DD or ISO timestamp)" },
            { name: "endDate", in: "query", schema: { type: "string" }, description: "Filter end date (YYYY-MM-DD or ISO timestamp)" },
          ],
          responses: {
            "200": {
              description: "Financial summary calculation",
              content: { "application/json": { schema: { $ref: "#/components/schemas/FinancialSummary" } } },
            },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/wallets": {
        get: {
          summary: "List all user wallets",
          description: "Returns all active wallets and balances for the authenticated user.",
          operationId: "listWallets",
          responses: {
            "200": {
              description: "List of wallets",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Wallet" } } } },
            },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
        post: {
          summary: "Create a new wallet or pocket",
          description: "Creates a wallet (e.g. Cash, Bank BCA, Mandiri, GoPay) with institution and initial balance.",
          operationId: "createWallet",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Wallet name (e.g. 'Tabungan Utama', 'Kantong Jajan')" },
                    institution: { type: "string", description: "Institution name (e.g. 'Bank BCA', 'Bank Jago', 'GoPay', 'Cash'). Default: 'General'" },
                    type: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"], default: "bank" },
                    balance: { type: "number", default: 0, description: "Initial balance" },
                    currency: { type: "string", default: "IDR", description: "Currency code (default: IDR)" },
                  },
                  required: ["name"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Wallet successfully created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Wallet" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/wallets/{id}": {
        put: {
          summary: "Update wallet details or balance",
          description: "Updates an existing wallet's name, institution, type, or balance.",
          operationId: "updateWallet",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" }, description: "Wallet UUID" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    institution: { type: "string" },
                    type: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"] },
                    balance: { type: "number" },
                    currency: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Wallet successfully updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Wallet" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/categories": {
        get: {
          summary: "List all transaction categories",
          description: "Returns custom and default categories created by the user.",
          operationId: "listCategories",
          responses: {
            "200": {
              description: "List of categories",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Category" } } } },
            },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
        post: {
          summary: "Create a custom category or seed defaults",
          description: "Creates a single category or bulk-seeds 10 standard default categories (action: seed_defaults).",
          operationId: "createCategory",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["create", "seed_defaults"], default: "create" },
                    name: { type: "string", description: "Category name (e.g. 'Kopi & Nongkrong')" },
                    type: { type: "string", enum: ["expense", "income"], default: "expense" },
                    icon: { type: "string", description: "Optional emoji icon" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Category created or seeded" },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/budgets": {
        get: {
          summary: "List all budgets and status",
          description: "Returns all budgets with calculated spending utilization and remaining balance.",
          operationId: "listBudgets",
          parameters: [
            { name: "status", in: "query", schema: { type: "boolean" }, description: "If true, computes spending and percentage used" },
          ],
          responses: {
            "200": { description: "List of budgets" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
        post: {
          summary: "Create a new budget",
          description: "Sets a monthly spending limit for a specific category or overall expenses.",
          operationId: "createBudget",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Budget name (e.g. 'Makan & Minuman Bulanan')" },
                    categoryId: { type: "string", format: "uuid", description: "Optional category UUID" },
                    amount: { type: "number", description: "Budget limit amount (> 0)" },
                    periodStart: { type: "string", description: "Period start date (YYYY-MM-DD)" },
                    periodEnd: { type: "string", description: "Period end date (YYYY-MM-DD)" },
                  },
                  required: ["name", "amount", "periodStart", "periodEnd"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Budget created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Budget" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/transactions": {
        get: {
          summary: "Query transactions with filters",
          description: "Lists transactions with wallet, category, type, date range, and pagination filters.",
          operationId: "listTransactions",
          parameters: [
            { name: "walletId", in: "query", schema: { type: "string" } },
            { name: "categoryId", in: "query", schema: { type: "string" } },
            { name: "budgetId", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string", enum: ["expense", "income", "transfer"] } },
            { name: "isPlanned", in: "query", schema: { type: "boolean" } },
            { name: "startDate", in: "query", schema: { type: "string" } },
            { name: "endDate", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": {
              description: "List of transactions",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Transaction" } } } },
            },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
        post: {
          summary: "Record an income or expense transaction",
          description: "Records an expense/income transaction and atomically updates the wallet balance.",
          operationId: "recordTransaction",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    walletId: { type: "string", format: "uuid", description: "Source wallet UUID" },
                    categoryId: { type: "string", format: "uuid", description: "Category UUID" },
                    budgetId: { type: "string", format: "uuid", description: "Optional budget UUID" },
                    amount: { type: "number", description: "Nominal amount (> 0)" },
                    adminFee: { type: "number", default: 0, description: "Admin/convenience fee" },
                    type: { type: "string", enum: ["expense", "income"], default: "expense" },
                    description: { type: "string", description: "Memo / notes" },
                    isPlanned: { type: "boolean", default: false },
                    transactionDate: { type: "string", description: "ISO timestamp or YYYY-MM-DD" },
                  },
                  required: ["walletId", "categoryId", "amount", "type"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Transaction recorded",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/transactions/{id}": {
        put: {
          summary: "Update an existing transaction",
          description: "Updates transaction amount, admin fee, wallet, category, or notes with automatic balance reconciliation.",
          operationId: "updateTransaction",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" }, description: "Transaction UUID" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    amount: { type: "number" },
                    adminFee: { type: "number" },
                    walletId: { type: "string", format: "uuid" },
                    targetWalletId: { type: "string", format: "uuid", nullable: true },
                    categoryId: { type: "string", format: "uuid", nullable: true },
                    budgetId: { type: "string", format: "uuid", nullable: true },
                    description: { type: "string" },
                    transactionDate: { type: "string" },
                    isPlanned: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Transaction updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/transfers": {
        post: {
          summary: "Transfer funds between two wallets",
          description: "Atomically debits source wallet (amount + fee) and credits target wallet (amount).",
          operationId: "transferFunds",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sourceWalletId: { type: "string", format: "uuid" },
                    targetWalletId: { type: "string", format: "uuid" },
                    amount: { type: "number", description: "Transfer principal (> 0)" },
                    adminFee: { type: "number", default: 0, description: "Transfer admin fee" },
                    categoryId: { type: "string", format: "uuid", description: "Optional category" },
                    description: { type: "string", description: "Memo" },
                    isPlanned: { type: "boolean", default: false },
                    transactionDate: { type: "string" },
                  },
                  required: ["sourceWalletId", "targetWalletId", "amount"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Transfer recorded",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/debts-loans": {
        get: {
          summary: "List debts and loans",
          description: "Returns personal debts (payables) and loans (receivables) with status/type filters.",
          operationId: "listDebtsLoans",
          parameters: [
            { name: "type", in: "query", schema: { type: "string", enum: ["debt", "loan"] } },
            { name: "status", in: "query", schema: { type: "string", enum: ["unpaid", "partially_paid", "paid"] } },
          ],
          responses: {
            "200": {
              description: "List of debts/loans",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/DebtLoan" } } } },
            },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
        post: {
          summary: "Create a new debt or loan record",
          description: "Records a new debt (payable) or loan (receivable) with optional automatic wallet balance adjustment.",
          operationId: "createDebtLoan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    personName: { type: "string", description: "Counterparty person/institution name" },
                    type: { type: "string", enum: ["debt", "loan"], description: "Type: debt or loan" },
                    amount: { type: "number", description: "Principal amount (> 0)" },
                    walletId: { type: "string", format: "uuid", description: "Optional wallet to credit/debit" },
                    dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
                    notes: { type: "string", description: "Notes" },
                    adjustWalletBalance: { type: "boolean", default: true },
                  },
                  required: ["personName", "type", "amount"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Debt/loan created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/debts-loans/repay": {
        post: {
          summary: "Record repayment on a debt or loan",
          description: "Records full or partial repayment against an active debt or loan and updates wallet balance.",
          operationId: "repayDebtLoan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    debtLoanId: { type: "string", format: "uuid" },
                    amount: { type: "number", description: "Repayment amount (> 0)" },
                    walletId: { type: "string", format: "uuid", description: "Wallet used for repayment" },
                    notes: { type: "string", description: "Repayment notes" },
                    adjustWalletBalance: { type: "boolean", default: true },
                  },
                  required: ["debtLoanId", "amount"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Repayment recorded",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
            "401": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "/api/v1/feedback": {
        post: {
          summary: "Submit user feedback or report a bug",
          description: "Submits feedback directly to the repository GitHub Issues.",
          operationId: "submitFeedback",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Issue title" },
                    feedback: { type: "string", description: "Details and description" },
                    type: { type: "string", enum: ["feedback", "bug", "feature_request", "question"], default: "feedback" },
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                  required: ["title", "feedback"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Feedback submitted successfully" },
            "400": { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  };
}
