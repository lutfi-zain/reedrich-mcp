/**
 * OpenAPI 3.0.0 specification generator for Reedrich Financial Intelligence API.
 * Supports OpenAI Custom GPT Actions, Scalar API Reference, and Swagger UI.
 */
import { APP_VERSION } from "../version";
export function generateOpenApiSpec(origin: string): Record<string, unknown> {
  return {
    openapi: "3.0.0",
    info: {
      title: "Reedrich Financial Intelligence API",
      version: APP_VERSION,
      description:
        "Mathematical Intelligence & Personal Financial Planning Engine deployed at the Cloudflare Workers edge. Exposes unified REST endpoints for wallets, categories, budgets, transactions, debts/loans, goals, and consolidated net worth analytics.",
      contact: {
        name: "Reedrich Support",
        url: "https://github.com/lutfi-zain/reedrich-mcp",
      },
    },
    servers: [
      {
        url: origin,
        description: "Cloudflare Workers Edge Server",
      },
    ],
    tags: [
      {
        name: "Analytics & Reporting",
        description: "Consolidated multi-currency net worth, savings rate, and financial health briefing.",
      },
      {
        name: "Wallets",
        description: "Personal accounts, bank accounts, cash, and digital wallet balances.",
      },
      {
        name: "Transactions",
        description: "Income, expense, and fund transfer transaction history with structured filtering.",
      },
      {
        name: "Budgets",
        description: "Category and period-based spending limits with live utilization metrics.",
      },
      {
        name: "Categories",
        description: "Expense and income classification categories.",
      },
      {
        name: "Goals",
        description: "Target savings goals with dynamic timeline pacing and completion projections.",
      },
      {
        name: "Debts & Loans",
        description: "Liabilities (debts/payable) and receivables (loans given) tracking.",
      },
      {
        name: "Recurring Templates",
        description: "Automated recurring transaction templates and forward cashflow projections.",
      },
      {
        name: "Feedback",
        description: "Submit bug reports, feature requests, and developer questions.",
      },
      {
        name: "Transfers",
        description: "Fund transfers between user accounts and wallets with atomic reconciliation.",
      },
      {
        name: "User Profile",
        description: "Authenticated user identity, profile details, and account metadata.",
      },
      {
        name: "OAuth 2.0 PKCE",
        description: "Stateless RFC 7636 PKCE authorization with Google Identity Federation.",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Enter your 15-minute JWT session token or persistent API key (rd_live_...)",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Persistent API Key header (rd_live_... or fp_live_...)",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              example: "VALIDATION",
              description: "Error code (VALIDATION, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, INTERNAL)",
            },
            message: {
              type: "string",
              example: "Validation Error: 'amount' must be a positive finite number",
            },
            field: {
              type: "string",
              nullable: true,
              example: "amount",
            },
          },
          required: ["error", "message"],
        },
        UserProfile: {
          type: "object",
          properties: {
            userId: { type: "string", format: "uuid" },
            firstName: { type: "string", example: "Budi" },
            lastName: { type: "string", example: "Setiawan" },
            fullName: { type: "string", example: "Budi Setiawan" },
            email: { type: "string", format: "email", example: "budi@example.com" },
            whatsappNumber: { type: "string", example: "+6281234567890" },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["userId", "firstName", "lastName", "fullName", "email", "whatsappNumber", "createdAt"],
        },
        Wallet: {
          type: "object",
          properties: {
            walletId: { type: "string", format: "uuid" },
            walletUserId: { type: "string" },
            walletName: { type: "string", example: "BCA Main" },
            walletInstitution: { type: "string", example: "BCA" },
            walletType: {
              type: "string",
              enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"],
              example: "bank",
            },
            walletBalance: { type: "number", example: 12500000.5 },
            walletCurrency: { type: "string", example: "IDR" },
            walletIsLocked: {
              type: "integer",
              enum: [0, 1],
              example: 0,
              description: "Whether the wallet is locked (1) for protected savings/emergency reserves or spendable (0)",
            },
            lastTransaction: {
              type: "object",
              nullable: true,
              description: "Latest non-planned transaction for this wallet, or null if no mutations exist",
              properties: {
                transactionId: { type: "string", format: "uuid" },
                date: { type: "string", format: "date-time" },
                type: { type: "string", enum: ["expense", "income", "transfer"] },
                direction: { type: "string", enum: ["in", "out"] },
                amount: { type: "number" },
                description: { type: "string" },
                category: { type: "string", nullable: true },
              },
            },
            walletCreatedAt: { type: "string", format: "date-time" },
          },
          required: ["walletId", "walletName", "walletBalance", "walletCurrency"],
        },
        Category: {
          type: "object",
          properties: {
            categoryId: { type: "string", format: "uuid" },
            categoryUserId: { type: "string" },
            categoryName: { type: "string", example: "Makanan & Minuman" },
            categoryType: { type: "string", enum: ["expense", "income"], example: "expense" },
            categoryIcon: { type: "string", nullable: true, example: "🍔" },
            categoryCreatedAt: { type: "string", format: "date-time" },
          },
          required: ["categoryId", "categoryName", "categoryType"],
        },
        Budget: {
          type: "object",
          properties: {
            budget: {
              type: "object",
              properties: {
                budgetId: { type: "string", format: "uuid" },
                budgetUserId: { type: "string" },
                budgetName: { type: "string", example: "Monthly Food" },
                budgetCategoryId: { type: "string", format: "uuid", nullable: true },
                budgetAmount: { type: "number", example: 2500000 },
                budgetPeriodStart: { type: "string", format: "date-time" },
                budgetPeriodEnd: { type: "string", format: "date-time" },
                budgetCreatedAt: { type: "string", format: "date-time" },
              },
            },
            spent: { type: "number", example: 1250000 },
            remaining: { type: "number", example: 1250000 },
            percentUsed: { type: "number", example: 50.0 },
          },
          required: ["budget", "spent", "remaining", "percentUsed"],
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
            transactionAmount: { type: "number", example: 150000 },
            transactionAdminFee: { type: "number", example: 2500 },
            transactionType: { type: "string", enum: ["expense", "income", "transfer"] },
            transactionDescription: { type: "string", nullable: true, example: "Groceries at supermarket" },
            transactionIsPlanned: { type: "integer", enum: [0, 1], description: "1 = planned forecast (no balance impact), 0 = realized" },
            transactionTemplateId: { type: "string", format: "uuid", nullable: true, description: "Originating recurring template (materialized or fallback-linked rows)" },
            transactionOccurrenceDate: { type: "string", format: "date", nullable: true, description: "Scheduled occurrence day (YYYY-MM-DD) for template-linked rows" },
            transactionRealizedAt: { type: "string", format: "date-time", nullable: true, description: "Timestamp of the 1→0 realize flip; null while still planned" },
            transactionPlannedAmount: { type: "number", nullable: true, description: "Original planned amount retained when realized with an actualAmount override" },
            transactionDate: { type: "string", format: "date-time" },
          },
          required: ["transactionId", "transactionWalletId", "transactionAmount", "transactionType", "transactionDate"],
        },
        DebtLoan: {
          type: "object",
          properties: {
            debtLoanId: { type: "string", format: "uuid" },
            debtLoanUserId: { type: "string" },
            debtLoanPersonName: { type: "string", example: "Budi Santoso" },
            debtLoanType: { type: "string", enum: ["debt", "loan"] },
            debtLoanAmount: { type: "number", example: 1000000 },
            debtLoanRemainingAmount: { type: "number", example: 500000 },
            debtLoanWalletId: { type: "string", format: "uuid", nullable: true },
            debtLoanDueDate: { type: "string", nullable: true, example: "2026-10-01" },
            debtLoanStatus: { type: "string", enum: ["unpaid", "partially_paid", "paid"] },
            debtLoanNotes: { type: "string", nullable: true },
            debtLoanCreatedAt: { type: "string", format: "date-time" },
          },
          required: ["debtLoanId", "debtLoanPersonName", "debtLoanType", "debtLoanAmount", "debtLoanStatus"],
        },
        Goal: {
          type: "object",
          properties: {
            goalId: { type: "string", format: "uuid" },
            goalUserId: { type: "string" },
            goalName: { type: "string", example: "Emergency Fund" },
            goalTargetAmount: { type: "number", example: 50000000 },
            goalCurrentAmount: { type: "number", example: 15000000, description: "Derived sum of linked wallet balances when links exist (isDerived: true); stored counter fallback otherwise" },
            goalCurrency: { type: "string", example: "IDR" },
            goalTargetDate: { type: "string", format: "date", nullable: true, example: "2027-12-31" },
            goalWalletId: { type: "string", format: "uuid", nullable: true, description: "Legacy single-wallet link (superseded by goal_wallets links)" },
            goalCategoryId: { type: "string", format: "uuid", nullable: true },
            goalStatus: { type: "string", enum: ["in_progress", "completed", "cancelled"] },
            goalNotes: { type: "string", nullable: true },
            goalCreatedAt: { type: "string", format: "date-time" },
            isDerived: { type: "boolean", example: true, description: "True when currentAmount is derived from linked wallets" },
            linkedWallets: {
              type: "array",
              description: "Per-wallet contribution breakdown (empty for unlinked goals)",
              items: {
                type: "object",
                properties: {
                  walletId: { type: "string", format: "uuid" },
                  walletName: { type: "string", example: "BCA Pocket Sewa Rumah" },
                  balance: { type: "number", example: 5000000 },
                  currency: { type: "string", example: "IDR" },
                  convertedAmount: { type: "number", example: 5000000 },
                  usedPeg: { type: "boolean", example: false, description: "True when the conversion used the USD stablecoin peg" },
                },
              },
            },
            pacing: {
              type: "object",
              properties: {
                progressPercentage: { type: "number", example: 30.0 },
                remainingAmount: { type: "number", example: 35000000 },
                isCompleted: { type: "boolean" },
                daysRemaining: { type: "integer", nullable: true },
                requiredDailySavings: { type: "number", nullable: true },
                requiredMonthlySavings: { type: "number", nullable: true },
              },
            },
          },
          required: ["goalId", "goalName", "goalTargetAmount", "goalCurrentAmount", "goalStatus"],
        },
        GoalRequest: {
          type: "object",
          properties: {
            name: { type: "string", description: "Goal name (1-100 characters)", example: "Laptop Baru" },
            targetAmount: { type: "number", description: "Target savings amount", example: 20000000 },
            currentAmount: { type: "number", default: 0, description: "Initial saved balance", example: 5000000 },
            currency: { type: "string", default: "IDR", example: "IDR" },
            targetDate: { type: "string", format: "date", description: "Optional target completion date (YYYY-MM-DD)", example: "2026-12-31" },
            walletId: { type: "string", format: "uuid", description: "Optional dedicated wallet UUID (also creates a goal_wallets link)" },
            walletIds: { type: "array", items: { type: "string", format: "uuid" }, description: "Optional linked wallet UUIDs (multiple)" },
            categoryId: { type: "string", format: "uuid", description: "Optional linked category UUID" },
            notes: { type: "string", description: "Optional notes (up to 500 chars)" },
          },
          required: ["name", "targetAmount"],
        },
        RecurringTemplate: {
          type: "object",
          properties: {
            templateId: { type: "string", format: "uuid" },
            templateUserId: { type: "string" },
            templateName: { type: "string", example: "Internet Wifi" },
            templateWalletId: { type: "string", format: "uuid" },
            templateTargetWalletId: { type: "string", format: "uuid", nullable: true },
            templateCategoryId: { type: "string", format: "uuid", nullable: true },
            templateAmount: { type: "number", example: 450000 },
            templateAdminFee: { type: "number", example: 5000 },
            templateType: { type: "string", enum: ["expense", "income", "transfer"] },
            templateFrequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
            templateInterval: { type: "integer", example: 1 },
            templateStartDate: { type: "string", format: "date", example: "2026-09-01" },
            templateNextRunDate: { type: "string", format: "date", example: "2026-10-01" },
            templateEndDate: { type: "string", format: "date", nullable: true },
            templateIsActive: { type: "integer", enum: [0, 1] },
            templateNotes: { type: "string", nullable: true },
            templateCreatedAt: { type: "string", format: "date-time" },
          },
          required: ["templateId", "templateName", "templateWalletId", "templateAmount", "templateFrequency"],
        },
        RecurringTemplateRequest: {
          type: "object",
          properties: {
            name: { type: "string", example: "Spotify Family" },
            walletId: { type: "string", format: "uuid" },
            targetWalletId: { type: "string", format: "uuid", nullable: true },
            categoryId: { type: "string", format: "uuid", nullable: true },
            amount: { type: "number", example: 86900 },
            adminFee: { type: "number", default: 0, example: 0 },
            type: { type: "string", enum: ["expense", "income", "transfer"], default: "expense" },
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], default: "monthly" },
            interval: { type: "integer", default: 1 },
            startDate: { type: "string", format: "date", example: "2026-09-15" },
            nextRunDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date", nullable: true },
            isActive: { type: "boolean", default: true },
            notes: { type: "string", nullable: true },
          },
          required: ["name", "walletId", "amount", "startDate"],
        },
        FinancialSummary: {
          type: "object",
          properties: {
            netWorthByCurrency: { type: "object", additionalProperties: { type: "number" } },
            netWorthByInstitution: { type: "object", additionalProperties: { type: "number" } },
            consolidatedNetWorth: {
              type: "object",
              properties: {
                baseCurrency: { type: "string", example: "IDR" },
                estimatedTotal: { type: "number", example: 25400000 },
                isEstimated: { type: "boolean" },
                exchangeRatesSource: { type: "string" },
              },
              required: ["baseCurrency", "estimatedTotal"],
            },
            spendableCash: {
              type: "object",
              properties: {
                byCurrency: { type: "object", additionalProperties: { type: "number" } },
                estimatedTotal: { type: "number", example: 10000000 },
                currency: { type: "string", example: "IDR" },
              },
              required: ["byCurrency", "estimatedTotal", "currency"],
            },
            lockedCash: {
              type: "object",
              properties: {
                byCurrency: { type: "object", additionalProperties: { type: "number" } },
                estimatedTotal: { type: "number", example: 15400000 },
                currency: { type: "string", example: "IDR" },
              },
              required: ["byCurrency", "estimatedTotal", "currency"],
            },
            safeToSpend: {
              type: "number",
              example: 4500000,
              description: "Spendable cash remaining after deducting upcoming planned expenses, 30-day recurring bills, and active debts",
            },
            dailySafeToSpend: {
              type: "number",
              example: 375000,
              description: "Daily safe-to-spend allowance for the remaining days in the active period",
            },
            safeToSpendDetails: {
              type: "object",
              properties: {
                remainingDays: { type: "integer", example: 12 },
                plannedExpensesDeducted: { type: "number", example: 1500000 },
                recurringExpensesDeducted: { type: "number", example: 2000000 },
                activeDebtDeducted: { type: "number", example: 2000000 },
                isDeficit: { type: "boolean", example: false },
              },
            },
            totalIncome: { type: "number" },
            totalExpense: { type: "number" },
            totalAdminFees: { type: "number" },
            netSavings: { type: "number" },
            totalDebt: { type: "number" },
            totalReceivable: { type: "number" },
            activeGoals: { type: "array", description: "Active financial goals ordered by currentAmount descending (converted to baseCurrency)", items: { type: "object" } },
            cashflowProjections: { type: "array", items: { type: "object" } },
            walletsCount: { type: "integer" },
            transactionsCount: { type: "integer" },
            transfersCount: { type: "integer" },
            categoryBreakdown: { type: "object", additionalProperties: { type: "number" } },
          },
          required: [
            "netWorthByCurrency",
            "netWorthByInstitution",
            "consolidatedNetWorth",
            "totalIncome",
            "totalExpense",
            "netSavings",
          ],
        },
        FeedbackRequest: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short summary (5-200 chars)", example: "Dark mode support" },
            content: { type: "string", description: "Detailed feedback (10-4000 chars)", example: "Please add dark mode option." },
            feedback: { type: "string", description: "Alias for content" },
            type: { type: "string", enum: ["feedback", "bug", "feature_request", "question"], default: "feedback" },
            name: { type: "string", description: "Submitter name (optional if authenticated)" },
            email: { type: "string", description: "Submitter email (optional if authenticated)" },
          },
          required: ["title"],
        },
        FeedbackResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            feedbackId: { type: "string" },
            type: { type: "string" },
            status: { type: "string" },
            submitter: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                userId: { type: "string", nullable: true },
              },
            },
            submittedAt: { type: "string", format: "date-time" },
          },
          required: ["success", "feedbackId"],
        },
        TransactionEnvelope: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/Transaction" },
            },
            pagination: {
              type: "object",
              properties: {
                total: { type: "integer", example: 1420 },
                limit: { type: "integer", example: 50 },
                offset: { type: "integer", example: 0 },
                hasNext: { type: "boolean", example: true },
                totalPages: { type: "integer", example: 29 },
              },
              required: ["total", "limit", "offset", "hasNext", "totalPages"],
            },
          },
          required: ["items", "pagination"],
        },
        HorizonBoard: {
          type: "object",
          properties: {
            baseCurrency: { type: "string", example: "IDR" },
            generatedAt: { type: "string", format: "date-time" },
            startingNetWorth: {
              type: "object",
              properties: {
                total: { type: "number", example: 70000000 },
                spendable: { type: "number", example: 20000000 },
                locked: { type: "number", example: 50000000 },
              },
              required: ["total", "spendable", "locked"],
            },
            periods: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  periodKey: { type: "string", example: "2026-10" },
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                  cashflow: {
                    type: "object",
                    properties: {
                      income: { type: "number", example: 15000000 },
                      expense: { type: "number", example: 8000000 },
                      net: { type: "number", example: 7000000 },
                    },
                    required: ["income", "expense", "net"],
                  },
                  netWorth: {
                    type: "object",
                    properties: {
                      total: { type: "number", example: 77000000 },
                      spendable: { type: "number", example: 25000000 },
                      locked: { type: "number", example: 52000000 },
                    },
                    required: ["total", "spendable", "locked"],
                  },
                  walletBalances: {
                    type: "array",
                    description: "Projected wallet balances ordered by balance descending (converted to baseCurrency)",
                    items: {
                      type: "object",
                      properties: {
                        walletId: { type: "string", format: "uuid" },
                        walletName: { type: "string", example: "BCA Main" },
                        balance: { type: "number", example: 25000000 },
                        currency: { type: "string", example: "IDR" },
                        isLocked: { type: "integer", enum: [0, 1] },
                      },
                      required: ["walletId", "walletName", "balance", "currency", "isLocked"],
                    },
                  },
                  goals: {
                    type: "array",
                    description: "Projected goal milestone progress ordered by currentAmount descending (converted to baseCurrency)",
                    items: {
                      type: "object",
                      properties: {
                        goalId: { type: "string", format: "uuid" },
                        name: { type: "string", example: "Dana Pensiun" },
                        currentAmount: { type: "number", example: 52000000 },
                        targetAmount: { type: "number", example: 100000000 },
                        progressPercentage: { type: "number", example: 52.0 },
                        isReached: { type: "boolean", example: false },
                      },
                      required: ["goalId", "name", "currentAmount", "targetAmount", "progressPercentage", "isReached"],
                    },
                  },
                },
                required: ["periodKey", "startDate", "endDate", "cashflow", "netWorth", "walletBalances", "goals"],
              },
            },
          },
          required: ["baseCurrency", "generatedAt", "startingNetWorth", "periods"],
        },
        AccountDetail: {
          type: "object",
          properties: {
            netWorth: {
              type: "object",
              properties: {
                consolidated: {
                  type: "object",
                  properties: {
                    total: { type: "number" },
                    currency: { type: "string" },
                    isEstimated: { type: "boolean" },
                    fxSource: { type: "string" },
                  },
                },
                byCurrency: { type: "object", additionalProperties: { type: "number" } },
                byInstitution: { type: "object", additionalProperties: { type: "number" } },
              },
            },
            wallets: {
              type: "object",
              properties: {
                spendable: {
                  type: "object",
                  properties: {
                    total: { type: "number" },
                    items: { type: "array", description: "Spendable wallets ordered by balance descending (converted to baseCurrency)", items: { $ref: "#/components/schemas/Wallet" } },
                  },
                },
                locked: {
                  type: "object",
                  properties: {
                    total: { type: "number" },
                    items: { type: "array", description: "Locked reserve wallets ordered by balance descending (converted to baseCurrency)", items: { $ref: "#/components/schemas/Wallet" } },
                  },
                },
              },
            },
            monthlyCashFlow: {
              type: "object",
              properties: {
                period: {
                  type: "object",
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" },
                  },
                },
                totalIncome: { type: "number" },
                totalExpense: { type: "number" },
                netSavings: { type: "number" },
                categoryBreakdown: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      categoryName: { type: "string" },
                      amount: { type: "number" },
                      percentage: { type: "number" },
                    },
                  },
                },
              },
            },
            budgets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  budgetId: { type: "string", format: "uuid" },
                  budgetName: { type: "string" },
                  categoryId: { type: "string", format: "uuid", nullable: true },
                  categoryName: { type: "string" },
                  amount: { type: "number" },
                  periodStart: { type: "string", format: "date-time" },
                  periodEnd: { type: "string", format: "date-time" },
                  spent: { type: "number" },
                  remaining: { type: "number" },
                  percentUsed: { type: "number" },
                  status: { type: "string", enum: ["upcoming", "on_track", "warning", "exceeded", "completed"] },
                  daysRemaining: { type: "integer" },
                  dailyAllowance: { type: "number" },
                },
              },
            },
            goals: {
              type: "array",
              description: "Active goals ordered by currentAmount descending (converted to baseCurrency)",
              items: {
                type: "object",
                properties: {
                  goalId: { type: "string", format: "uuid" },
                  goalName: { type: "string" },
                  targetAmount: { type: "number" },
                  currentAmount: { type: "number" },
                  targetDate: { type: "string", nullable: true },
                  currency: { type: "string" },
                  status: { type: "string" },
                  progressPercentage: { type: "number" },
                  isDerived: { type: "boolean" },
                  daysRemaining: { type: "integer", nullable: true },
                  requiredMonthlySavings: { type: "number", nullable: true },
                  isReached: { type: "boolean" },
                  linkedWalletsBreakdown: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        walletId: { type: "string", format: "uuid" },
                        walletName: { type: "string" },
                        balance: { type: "number" },
                        currency: { type: "string" },
                        convertedAmount: { type: "number" },
                        usedPeg: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
            obligations: {
              type: "object",
              properties: {
                totalDebt: { type: "number" },
                totalReceivable: { type: "number" },
                activeDebts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      debtLoanId: { type: "string", format: "uuid" },
                      personName: { type: "string" },
                      amount: { type: "number" },
                      remainingAmount: { type: "number" },
                      dueDate: { type: "string", nullable: true },
                      status: { type: "string" },
                      type: { type: "string", enum: ["debt", "loan"] },
                      walletId: { type: "string", format: "uuid", nullable: true },
                      notes: { type: "string", nullable: true },
                    },
                  },
                },
                activeLoans: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      debtLoanId: { type: "string", format: "uuid" },
                      personName: { type: "string" },
                      amount: { type: "number" },
                      remainingAmount: { type: "number" },
                      dueDate: { type: "string", nullable: true },
                      status: { type: "string" },
                      type: { type: "string", enum: ["debt", "loan"] },
                      walletId: { type: "string", format: "uuid", nullable: true },
                      notes: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/oauth/authorize": {
        get: {
          tags: ["OAuth 2.0 PKCE"],
          summary: "Authorize with PKCE S256",
          description:
            "RFC 7636 authorization endpoint. Renders interactive HTML consent or, when provider=google (or idp=google) is provided, returns an immediate 302 redirect directly to Google OAuth 2.0.",
          operationId: "oauthAuthorize",
          parameters: [
            {
              name: "response_type",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["code"] },
            },
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "redirect_uri",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "code_challenge",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "code_challenge_method",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["S256"] },
            },
            {
              name: "state",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "scope",
              in: "query",
              required: false,
              schema: { type: "string", default: "mcp" },
            },
            {
              name: "provider",
              in: "query",
              required: false,
              description: "Direct identity provider bypass (e.g. 'google'). Directs immediately to Google Sign-In without intermediate consent UI.",
              schema: { type: "string", enum: ["google"] },
            },
            {
              name: "idp",
              in: "query",
              required: false,
              description: "Alias for 'provider'.",
              schema: { type: "string", enum: ["google"] },
            },
          ],
          responses: {
            "200": {
              description: "Interactive HTML consent page rendered when unauthenticated and no provider specified.",
              content: { "text/html": {} },
            },
            "302": {
              description: "Redirect to downstream redirect_uri with code, or direct redirect to Google when provider=google.",
            },
            "400": {
              description: "Invalid OAuth parameters or unsupported provider.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/me": {
        get: {
          tags: ["User Profile"],
          summary: "Get Current User Profile",
          description: "Returns the profile details (name, email, WhatsApp number, registration timestamp) of the currently authenticated principal.",
          operationId: "getCurrentUserProfile",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          responses: {
            "200": {
              description: "Current user profile",
              content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "404": {
              description: "User not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["User Profile"],
          summary: "Update Current User Profile",
          description: "Updates the authenticated user's first name, last name, or WhatsApp contact number. Email is immutable.",
          operationId: "updateCurrentUserProfile",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    firstName: { type: "string", description: "First name (1-100 chars)" },
                    lastName: { type: "string", description: "Last name (1-100 chars)" },
                    whatsappNumber: { type: "string", description: "WhatsApp number with country code (e.g. +6281234567890)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated user profile",
              content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/user/profile": {
        get: {
          tags: ["User Profile"],
          summary: "Get Current User Profile (Alias)",
          description: "Semantic resource alias for GET /api/v1/me.",
          operationId: "getUserProfileAlias",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          responses: {
            "200": {
              description: "Current user profile",
              content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "404": {
              description: "User not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["User Profile"],
          summary: "Update Current User Profile (Alias)",
          description: "Semantic resource alias for PATCH /api/v1/me. Updates first name, last name, or WhatsApp number.",
          operationId: "updateUserProfileAlias",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    firstName: { type: "string", description: "First name (1-100 chars)" },
                    lastName: { type: "string", description: "Last name (1-100 chars)" },
                    whatsappNumber: { type: "string", description: "WhatsApp number with country code (e.g. +6281234567890)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated user profile",
              content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/analytics/horizon": {
        get: {
          tags: ["Analytics & Reporting"],
          summary: "Get Multi-Period Horizon Board Projections",
          description: "Generates forward-looking financial roadmap projections across 1 to 24 future calendar months with month-by-month cashflow, roll-forward wallet balance accumulation, spendable vs locked net worth trajectory, and derived goal milestones.",
          operationId: "getHorizonProjections",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "months", in: "query", schema: { type: "integer", minimum: 1, maximum: 24, default: 6 }, description: "Number of calendar months to project (1-24, default 6)" },
            { name: "periods", in: "query", schema: { type: "string" }, description: "Optional period definitions: 2D array of date intervals [[startDate, endDate], ...], a JSON string thereof, or legacy comma-separated YYYY-MM months" },
            { name: "filter", in: "query", schema: { type: "string", enum: ["realized", "planned", "all"], default: "all" }, description: "Status filter for roll-forward movements (default 'all')" },
            { name: "baseCurrency", in: "query", schema: { type: "string", default: "IDR" }, description: "Base currency for consolidated net worth and cashflows (default IDR)" },
          ],
          responses: {
            "200": {
              description: "Horizon board projections successfully generated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HorizonBoard" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/account-detail": {
        get: {
          tags: ["Analytics & Reporting"],
          summary: "Get Comprehensive Financial Snapshot",
          description:
            "Returns a unified, atomic account snapshot: consolidated net worth with live FX, wallets partitioned into spendable and locked with last transaction metadata, monthly cashflow, active budgets, goal pacing, and active obligations.",
          operationId: "getAccountDetail",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            {
              name: "startDate",
              in: "query",
              required: false,
              description: "Filter start date (ISO-8601 string, e.g. YYYY-MM-DD)",
              schema: { type: "string" },
            },
            {
              name: "endDate",
              in: "query",
              required: false,
              description: "Filter end date (ISO-8601 string, e.g. YYYY-MM-DD)",
              schema: { type: "string" },
            },
            {
              name: "baseCurrency",
              in: "query",
              required: false,
              description: "Base currency for net worth and conversions (default IDR)",
              schema: { type: "string", default: "IDR" },
            },
          ],
          responses: {
            "200": {
              description: "Comprehensive account detail snapshot successfully retrieved.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AccountDetail" },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Invalid date format",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/summary": {
        get: {
          tags: ["Analytics & Reporting"],
          summary: "Get Consolidated Financial Summary with Safe-to-Spend Runway",
          description:
            "Returns multi-currency net worth, spendable vs locked cash, deterministic safe-to-spend runway, total income, expenses, debt totals, active goal pacing, and 30-day cashflow projections.",
          operationId: "getFinancialSummary",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            {
              name: "startDate",
              in: "query",
              required: false,
              description: "Filter start date (ISO-8601 string, e.g. YYYY-MM-DD)",
              schema: { type: "string" },
            },
            {
              name: "endDate",
              in: "query",
              required: false,
              description: "Filter end date (ISO-8601 string, e.g. YYYY-MM-DD)",
              schema: { type: "string" },
            },
            {
              name: "baseCurrency",
              in: "query",
              required: false,
              description: "Target currency for consolidated valuation (defaults to most frequent wallet currency or IDR)",
              schema: { type: "string", default: "IDR" },
            },
          ],
          responses: {
            "200": {
              description: "Comprehensive financial summary successfully generated.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FinancialSummary" },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Invalid date format",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/wallets": {
        get: {
          tags: ["Wallets"],
          summary: "List User Wallets",
          description: "Returns all active accounts, bank accounts, and digital wallets for the authenticated user, ordered deterministically by wallet balance descending.",
          operationId: "listWallets",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "startDate", in: "query", schema: { type: "string" }, description: "Optional start date for point-in-time balance snapshot" },
            { name: "endDate", in: "query", schema: { type: "string" }, description: "Optional end date for point-in-time balance snapshot" },
            { name: "filter", in: "query", schema: { type: "string", enum: ["realized", "planned", "all"], default: "all" }, description: "Optional status filter for snapshot calculations" },
            { name: "isLocked", in: "query", schema: { type: "boolean" }, description: "Filter by wallet lock status" },
          ],
          responses: {
            "200": {
              description: "Array of user wallets",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Wallet" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Wallets"],
          summary: "Create User Wallet",
          description: "Creates a new personal account, bank account, or digital wallet for the authenticated user.",
          operationId: "createWallet",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Wallet name (1-100 chars)" },
                    institution: { type: "string", description: "Bank or platform institution (e.g. BCA, Jago, Cash)", default: "General" },
                    type: { type: "string", enum: ["bank", "cash", "e-wallet", "credit", "crypto", "investment"], default: "bank" },
                    balance: { type: "number", description: "Initial balance", default: 0 },
                    currency: { type: "string", description: "Currency code (default IDR)", default: "IDR" },
                    isLocked: { type: "boolean", description: "Lock wallet from daily Safe-to-Spend runway", default: false },
                  },
                  required: ["name"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Wallet created successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Wallet" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/wallets/{walletId}": {
        get: {
          tags: ["Wallets"],
          summary: "Get Wallet by ID",
          description: "Returns an individual wallet belonging to the authenticated user with latest transaction metadata.",
          operationId: "getWalletById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "walletId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Wallet details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Wallet" } } },
            },
            "404": {
              description: "Wallet not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Wallets"],
          summary: "Update User Wallet",
          description: "Updates an existing wallet's name, institution, type, balance, currency, or lock status.",
          operationId: "updateWallet",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "walletId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
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
                    isLocked: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Wallet updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Wallet" } } },
            },
            "404": {
              description: "Wallet not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Wallets"],
          summary: "Delete User Wallet",
          description: "Permanently deletes an empty wallet. Requires balance to be 0 and no active goal or recurring template links.",
          operationId: "deleteWallet",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "walletId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Wallet deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string" },
                      deletedWalletId: { type: "string", format: "uuid" },
                    },
                    required: ["success", "message", "deletedWalletId"],
                  },
                },
              },
            },
            "404": {
              description: "Wallet not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error (non-zero balance or active links)",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/categories": {
        get: {
          tags: ["Categories"],
          summary: "List User Categories",
          description: "Returns all expense and income categories configured for the authenticated user.",
          operationId: "listCategories",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          responses: {
            "200": {
              description: "Array of user categories",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Categories"],
          summary: "Create Category",
          description: "Creates a new custom expense or income category for the authenticated user.",
          operationId: "createCategory",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Category name (1-100 chars)" },
                    type: { type: "string", enum: ["expense", "income"], default: "expense" },
                    icon: { type: "string", description: "Emoji icon", nullable: true },
                  },
                  required: ["name"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Category created successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/categories/seed": {
        post: {
          tags: ["Categories"],
          summary: "Seed Default Categories",
          description: "Seeds standard recommended default categories (food, transportation, shopping, bills, entertainment, health, salary, etc.) for the user.",
          operationId: "seedDefaultCategories",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          responses: {
            "200": {
              description: "Default categories seeded successfully",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Category" } } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/categories/{categoryId}": {
        get: {
          tags: ["Categories"],
          summary: "Get Category by ID",
          description: "Returns an individual category belonging to the authenticated user.",
          operationId: "getCategoryById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "categoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Category details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
            },
            "404": {
              description: "Category not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Categories"],
          summary: "Update Category",
          description: "Updates category name or icon. System category 'Adjustment' cannot be renamed.",
          operationId: "updateCategory",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "categoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "New category name (1-100 chars)" },
                    icon: { type: "string", description: "Emoji icon representation (max 10 chars)", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Category updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
            },
            "400": {
              description: "Validation error or renaming Adjustment blocked",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "404": {
              description: "Category not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Categories"],
          summary: "Delete Category",
          description: "Permanently deletes a custom category. System category 'Adjustment' is protected and cannot be deleted.",
          operationId: "deleteCategory",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "categoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Category deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string" },
                      deletedCategoryId: { type: "string", format: "uuid" },
                    },
                    required: ["success", "message", "deletedCategoryId"],
                  },
                },
              },
            },
            "400": {
              description: "Validation error (attempting to delete Adjustment)",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "404": {
              description: "Category not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/budgets": {
        get: {
          tags: ["Budgets"],
          summary: "List Active Budgets & Spending Utilization",
          description: "Returns active budgets with calculated spending utilization, remaining balance, and percentage used.",
          operationId: "listBudgets",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          responses: {
            "200": {
              description: "Array of budgets with live utilization metrics",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Budget" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Budgets"],
          summary: "Create Budget",
          description: "Creates a spending limit for a specific category and date range.",
          operationId: "createBudget",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Budget title" },
                    categoryId: { type: "string", format: "uuid", nullable: true },
                    amount: { type: "number", minimum: 0.01, description: "Budget limit amount" },
                    periodStart: { type: "string", format: "date-time" },
                    periodEnd: { type: "string", format: "date-time" },
                  },
                  required: ["name", "amount", "periodStart", "periodEnd"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Budget created successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Budget" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/budgets/{budgetId}": {
        get: {
          tags: ["Budgets"],
          summary: "Get Budget by ID",
          description: "Returns an individual budget with live spending utilization, remaining balance, and percent used.",
          operationId: "getBudgetById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "budgetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Budget details with live metrics",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Budget" } } },
            },
            "404": {
              description: "Budget not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Budgets"],
          summary: "Update Budget",
          description: "Updates budget title, target amount, start/end dates, or linked category.",
          operationId: "updateBudget",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "budgetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Budget title" },
                    amount: { type: "number", minimum: 0.01, description: "Budget limit amount" },
                    periodStart: { type: "string", format: "date-time" },
                    periodEnd: { type: "string", format: "date-time" },
                    categoryId: { type: "string", format: "uuid", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Budget updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Budget" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "404": {
              description: "Budget not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Budgets"],
          summary: "Delete Budget",
          description: "Permanently deletes a budget limit. Associated transactions retain their records with category unlinked.",
          operationId: "deleteBudget",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "budgetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Budget deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string" },
                      deletedBudgetId: { type: "string", format: "uuid" },
                    },
                    required: ["success", "message", "deletedBudgetId"],
                  },
                },
              },
            },
            "404": {
              description: "Budget not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/transactions": {
        get: {
          tags: ["Transactions"],
          summary: "List Transactions with Structured Filters",
          description: "Query transactions with filters by wallet, category, budget, type, date range, and pagination.",
          operationId: "listTransactions",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search keyword in description (case-insensitive substring, alias: search)" },
            { name: "search", in: "query", schema: { type: "string" }, description: "Search keyword alias for q" },
            { name: "walletId", in: "query", schema: { type: "string" }, description: "Wallet statement filter: matches transactions where the wallet is source OR transfer destination (single UUID or comma-separated UUIDs)" },
            { name: "targetWalletId", in: "query", schema: { type: "string" }, description: "Directed destination filter: with walletId it narrows to flows from source to destination; alone it matches transactions sent to the destination (transfers)" },
            { name: "categoryId", in: "query", schema: { type: "string" }, description: "Filter by category UUID or comma-separated UUIDs" },
            { name: "budgetId", in: "query", schema: { type: "string" }, description: "Filter by budget UUID or comma-separated UUIDs" },
            { name: "type", in: "query", schema: { type: "string", enum: ["expense", "income", "transfer"] }, description: "Filter by transaction type" },
            { name: "status", in: "query", schema: { type: "string", enum: ["realized", "planned", "all"] }, description: "Status filter: 'realized' = actual, 'planned' = forecast, 'all' = both" },
            { name: "isPlanned", in: "query", schema: { type: "boolean" }, description: "Legacy planned filter (true for planned, false for actual)" },
            { name: "startDate", in: "query", schema: { type: "string" }, description: "Transactions on or after this ISO date" },
            { name: "endDate", in: "query", schema: { type: "string" }, description: "Transactions on or before this ISO date" },
            { name: "envelope", in: "query", schema: { type: "boolean", default: false }, description: "When true, wraps response in a structured envelope containing items and pagination metadata" },
            { name: "orderBy", in: "query", schema: { type: "string", enum: ["date", "amount", "createdAt", "description"], default: "date" }, description: "Sort field for results (default 'date')" },
            { name: "direction", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" }, description: "Sort direction applied to orderBy (default 'desc')" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 }, description: "Max results to return" },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 }, description: "Pagination offset" },
          ],
          responses: {
            "200": {
              description: "Array of transaction records matching filters",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Transaction" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Invalid query parameter",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Transactions"],
          summary: "Record Transaction",
          description: "Records an expense or income transaction. Automatically reconciles wallet balance unless isPlanned is true.",
          operationId: "recordTransaction",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    walletId: { type: "string", format: "uuid" },
                    categoryId: { type: "string", format: "uuid" },
                    budgetId: { type: "string", format: "uuid", nullable: true },
                    amount: { type: "number", minimum: 0.01 },
                    adminFee: { type: "number", minimum: 0, default: 0 },
                    type: { type: "string", enum: ["expense", "income"], default: "expense" },
                    description: { type: "string", maxLength: 500 },
                    isPlanned: { type: "boolean", default: false },
                    date: { type: "string", format: "date-time", description: "ISO timestamp (alias: transactionDate)" },
                    transactionDate: { type: "string", format: "date-time" },
                  },
                  required: ["walletId", "categoryId", "amount"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Transaction recorded successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "400": {
              description: "Validation error or wallet required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/transactions/{transactionId}": {
        get: {
          tags: ["Transactions"],
          summary: "Get Transaction by ID",
          description: "Returns an individual transaction record for the authenticated user.",
          operationId: "getTransactionById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "transactionId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Transaction details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "404": {
              description: "Transaction not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Transactions"],
          summary: "Update Transaction",
          description: "Updates an existing transaction and atomically reconciles wallet balance delta.",
          operationId: "updateTransaction",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "transactionId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["expense", "income", "transfer"], description: "Optional: Mutate transaction type with two-phase balance reconciliation" },
                    amount: { type: "number", minimum: 0.01 },
                    adminFee: { type: "number", minimum: 0 },
                    walletId: { type: "string", format: "uuid" },
                    targetWalletId: { type: "string", format: "uuid", nullable: true },
                    categoryId: { type: "string", format: "uuid" },
                    budgetId: { type: "string", format: "uuid", nullable: true },
                    description: { type: "string", maxLength: 500 },
                    date: { type: "string", format: "date-time" },
                    transactionDate: { type: "string", format: "date-time" },
                    isPlanned: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Transaction updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "404": {
              description: "Transaction not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Transactions"],
          summary: "Delete Transaction",
          description: "Permanently deletes a transaction with automatic atomic balance reversal for realized transactions.",
          operationId: "deleteTransaction",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "transactionId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Transaction deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string" },
                      deletedTransactionId: { type: "string", format: "uuid" },
                    },
                    required: ["success", "message", "deletedTransactionId"],
                  },
                },
              },
            },
            "404": {
              description: "Transaction not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/transfers": {
        post: {
          tags: ["Transfers"],
          summary: "Transfer Funds Between Wallets",
          description: "Atomically debits source wallet (amount + fee) and credits target wallet (amount).",
          operationId: "transferFunds",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sourceWalletId: { type: "string", format: "uuid" },
                    targetWalletId: { type: "string", format: "uuid" },
                    amount: { type: "number", minimum: 0.01 },
                    adminFee: { type: "number", minimum: 0, default: 0 },
                    description: { type: "string", maxLength: 500 },
                    categoryId: { type: "string", format: "uuid", nullable: true },
                    date: { type: "string", format: "date-time" },
                    transactionDate: { type: "string", format: "date-time" },
                  },
                  required: ["sourceWalletId", "targetWalletId", "amount"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Transfer recorded successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
            },
            "400": {
              description: "Validation error or insufficient wallets",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/debts-loans": {
        get: {
          tags: ["Debts & Loans"],
          summary: "List Debts and Loans",
          description: "Returns liabilities (debts/payable) and receivables (loans given) with optional status and type filtering.",
          operationId: "listDebtsLoans",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["unpaid", "partially_paid", "paid"] } },
            { name: "type", in: "query", schema: { type: "string", enum: ["debt", "loan"] } },
          ],
          responses: {
            "200": {
              description: "Array of debt and loan records",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/DebtLoan" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Debts & Loans"],
          summary: "Create Debt or Loan",
          description: "Records a liability (debt user owes) or receivable (loan user gave to others).",
          operationId: "createDebtLoan",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    personName: { type: "string" },
                    amount: { type: "number", minimum: 0.01 },
                    type: { type: "string", enum: ["debt", "loan"], default: "debt" },
                    walletId: { type: "string", format: "uuid", nullable: true },
                    dueDate: { type: "string", format: "date", nullable: true },
                    notes: { type: "string", nullable: true },
                    adjustWalletBalance: { type: "boolean", default: true },
                  },
                  required: ["personName", "amount"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Debt or loan recorded successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/debts-loans/{debtLoanId}": {
        get: {
          tags: ["Debts & Loans"],
          summary: "Get Debt or Loan by ID",
          description: "Returns an individual debt or loan record for the authenticated user.",
          operationId: "getDebtLoanById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "debtLoanId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Debt or loan details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "404": {
              description: "Record not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Debts & Loans"],
          summary: "Update Debt or Loan",
          description: "Updates an existing debt or loan record.",
          operationId: "updateDebtLoan",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "debtLoanId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    personName: { type: "string" },
                    dueDate: { type: "string", format: "date" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Record updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "404": {
              description: "Record not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Debts & Loans"],
          summary: "Delete Debt or Loan",
          description: "Permanently deletes an individual debt or loan record.",
          operationId: "deleteDebtLoan",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "debtLoanId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Record deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string" },
                      deletedDebtLoanId: { type: "string", format: "uuid" },
                    },
                    required: ["success", "message", "deletedDebtLoanId"],
                  },
                },
              },
            },
            "404": {
              description: "Record not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/debts-loans/{debtLoanId}/repay": {
        post: {
          tags: ["Debts & Loans"],
          summary: "Repay Debt or Loan",
          description: "Records a repayment towards a debt or loan, updating remaining amount and status.",
          operationId: "repayDebtLoan",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "debtLoanId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    amount: { type: "number", minimum: 0.01 },
                    walletId: { type: "string", format: "uuid", nullable: true },
                    adjustWalletBalance: { type: "boolean", default: true },
                  },
                  required: ["amount"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Repayment recorded successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/DebtLoan" } } },
            },
            "404": {
              description: "Record not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error or overpayment",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/goals": {
        get: {
          tags: ["Goals"],
          summary: "List Financial Goals",
          description: "Returns all financial goals ordered by evaluated current amount descending, with dynamic progress percentages and timeline pacing metrics.",
          operationId: "listGoals",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["in_progress", "completed", "cancelled"] },
            },
          ],
          responses: {
            "200": {
              description: "Array of financial goals",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Goal" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Goals"],
          summary: "Create Financial Goal",
          description: "Creates a new savings goal with target amount, deadline, and optional linked wallet/category.",
          operationId: "createGoal",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GoalRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Goal successfully created with initial pacing metrics.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Goal" },
                },
              },
            },
            "400": {
              description: "Validation failure",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/goals/{goalId}": {
        get: {
          tags: ["Goals"],
          summary: "Get Financial Goal by ID",
          description: "Returns an individual goal with dynamic progress and pacing metrics.",
          operationId: "getGoalById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Goal details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Goal" } } },
            },
            "404": {
              description: "Goal not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Goals"],
          summary: "Update Financial Goal",
          description: "Updates an existing savings goal.",
          operationId: "updateGoal",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    targetAmount: { type: "number", minimum: 0.01 },
                    currentAmount: { type: "number", minimum: 0 },
                    currency: { type: "string" },
                    targetDate: { type: "string", format: "date", nullable: true },
                    status: { type: "string", enum: ["in_progress", "completed", "cancelled"] },
                    notes: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Goal updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Goal" } } },
            },
            "404": {
              description: "Goal not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Goals"],
          summary: "Delete Financial Goal",
          description: "Deletes a financial goal and its wallet associations.",
          operationId: "deleteGoal",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Goal deleted successfully",
              content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } },
            },
            "404": {
              description: "Goal not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/goals/{goalId}/wallets": {
        post: {
          tags: ["Goals"],
          summary: "Link Wallet to Goal",
          description: "Links a dedicated wallet to a financial goal for automatic balance tracking.",
          operationId: "linkGoalWallet",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    walletId: { type: "string", format: "uuid" },
                  },
                  required: ["walletId"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Wallet linked to goal successfully",
              content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, goalId: { type: "string" }, walletId: { type: "string" } } } } },
            },
            "404": {
              description: "Goal or wallet not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/goals/{goalId}/wallets/{walletId}": {
        delete: {
          tags: ["Goals"],
          summary: "Unlink Wallet from Goal",
          description: "Removes a wallet link from a financial goal.",
          operationId: "unlinkGoalWallet",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "goalId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "walletId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Wallet unlinked from goal successfully",
              content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" }, goalId: { type: "string" }, walletId: { type: "string" } } } } },
            },
            "404": {
              description: "Goal or wallet link not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/recurring-templates": {
        get: {
          tags: ["Recurring Templates"],
          summary: "List Recurring Templates",
          description: "Returns all recurring transaction templates configured for automated planning.",
          operationId: "listRecurringTemplates",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            {
              name: "isActive",
              in: "query",
              required: false,
              schema: { type: "boolean" },
            },
          ],
          responses: {
            "200": {
              description: "Array of recurring templates",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/RecurringTemplate" } },
                },
              },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        post: {
          tags: ["Recurring Templates"],
          summary: "Create Recurring Template",
          description: "Schedules a recurring income, expense, or transfer template.",
          operationId: "createRecurringTemplate",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecurringTemplateRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Recurring template created successfully.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RecurringTemplate" },
                },
              },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/recurring-templates/{templateId}": {
        get: {
          tags: ["Recurring Templates"],
          summary: "Get Recurring Template by ID",
          description: "Returns an individual recurring transaction template for the authenticated user.",
          operationId: "getRecurringTemplateById",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "templateId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Template details",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RecurringTemplate" } } },
            },
            "404": {
              description: "Template not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        patch: {
          tags: ["Recurring Templates"],
          summary: "Update Recurring Template",
          description: "Updates an existing recurring transaction template.",
          operationId: "updateRecurringTemplate",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "templateId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    amount: { type: "number", minimum: 0.01 },
                    frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
                    nextRunDate: { type: "string", format: "date" },
                    walletId: { type: "string", format: "uuid" },
                    categoryId: { type: "string", format: "uuid" },
                    type: { type: "string", enum: ["expense", "income", "transfer"] },
                    description: { type: "string" },
                    isActive: { type: "boolean" },
                    adminFee: { type: "number", minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Template updated successfully",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RecurringTemplate" } } },
            },
            "404": {
              description: "Template not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "400": {
              description: "Validation error",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
        delete: {
          tags: ["Recurring Templates"],
          summary: "Delete Recurring Template",
          description: "Deletes a recurring transaction template.",
          operationId: "deleteRecurringTemplate",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "templateId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Template deleted successfully",
              content: { "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } } },
            },
            "404": {
              description: "Template not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/recurring-templates/{templateId}/apply": {
        post: {
          tags: ["Recurring Templates"],
          summary: "Realize a Materialized Planned Occurrence",
          description: "Flips one planned row (isPlanned 1→0) for the template, stamps realizedAt, moves balances atomically. Prefer transactionId; falls back to templateId+executionDate lookup. Double realization fails with VALIDATION.",
          operationId: "applyRecurringTemplate",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            {
              name: "templateId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    transactionId: { type: "string", format: "uuid", description: "Planned transaction UUID to realize (preferred)" },
                    executionDate: { type: "string", format: "date-time", description: "Occurrence date override for fallback lookup" },
                    actualAmount: { type: "number", minimum: 0.01, description: "Actual amount override; planned amount retained for variance" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Template applied and balance updated successfully.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      transaction: { $ref: "#/components/schemas/Transaction" },
                      template: { $ref: "#/components/schemas/RecurringTemplate" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Template or wallet not found",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "401": {
              description: "Authentication required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
      "/api/v1/feedback": {
        post: {
          tags: ["Feedback"],
          summary: "Submit User Feedback or Bug Report",
          description: "Submits feedback, bug report, question, or feature request to the internal database.",
          operationId: "submitFeedback",
          security: [{ bearerAuth: [] }, { apiKeyHeader: [] }, {}],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FeedbackRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Feedback recorded successfully.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FeedbackResponse" },
                },
              },
            },
            "400": {
              description: "Missing title or invalid email",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },
    },
    "x-oauth": {
      scopes_supported: ["financial:read", "financial:write", "financial:admin", "mcp"],
    },
  };
}
