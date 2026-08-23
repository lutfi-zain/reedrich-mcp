## Context

The Eve Finance MCP Server (`src/mcp.ts`) currently registers `tools` and `resources` capabilities. The server runs on Cloudflare Workers with D1 (SQLite), using Drizzle ORM. Authentication resolves a `userId` via JWT token or API key before every tool/resource call. There are no database schema changes needed for this work — onboarding state is computed dynamically from existing `wallets` and `categories` table counts.

The MCP SDK (`@modelcontextprotocol/sdk`) already ships `ListPromptsRequestSchema` and `GetPromptRequestSchema` types in `types.js`, mirroring the pattern used for tools and resources.

## Goals / Non-Goals

**Goals:**
- Expose dynamic onboarding readiness status in `register_user` and `login_user` responses
- Add `seed_defaults` action to `manage_category` for one-call bulk category creation
- Implement MCP Prompts protocol with 4 workflow templates (onboarding, briefing, planning, debt advisory)
- Add precondition guardrails to `record_transaction` and `transfer_funds` for walletless users

**Non-Goals:**
- No database schema changes or new migration files
- No persistent `onboarding_completed` flag in the users table (computed dynamically)
- No UI/frontend changes
- No third-party integrations or external API calls for prompts
- No automatic seeding without agent/user confirmation (seed_defaults is explicitly invoked)

## Decisions

### Decision 1: Dynamic onboarding evaluation vs. persistent flag

**Chosen**: Dynamic evaluation — query `wallets` and `categories` count at auth time.

**Rationale**: A persistent `onboarding_completed` boolean flag in `users` would go stale if a user deletes all wallets after onboarding. Dynamic evaluation always reflects true state. The cost is 2 lightweight `COUNT(*)` queries per auth call, which is negligible on D1.

**Alternative considered**: `isOnboarded` column in `users` table. Rejected because it creates a sync problem — every wallet/category deletion would need to re-evaluate and update the flag.

### Decision 2: Onboarding helper function

**Chosen**: Extract a shared `evaluateOnboarding(db, userId)` helper that returns the onboarding object. Both `register_user` and `login_user` handlers call this function after successful auth.

```typescript
async function evaluateOnboarding(
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
    .where(eq(schema.wallets.userId, userId));
  
  const [categoryCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.categories)
    .where(eq(schema.categories.userId, userId));

  const hasWallets = walletCount.count > 0;
  const hasCategories = categoryCount.count > 0;
  const needs: string[] = [];
  if (!hasWallets) needs.push("wallet");
  if (!hasCategories) needs.push("categories");

  const suggestions: string[] = [];
  // Always suggest budget if not yet set up
  const [budgetCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.budgets)
    .where(eq(schema.budgets.userId, userId));
  if (budgetCount.count === 0) suggestions.push("budget");

  const isComplete = needs.length === 0;
  const message = isComplete
    ? "Setup complete! You can start recording transactions."
    : `Please set up: ${needs.join(", ")}. Use the onboarding_assistant prompt for guidance.`;

  return { isComplete, needs, suggestions, message };
}
```

### Decision 3: Seed defaults as action on existing tool vs. separate tool

**Chosen**: New action `seed_defaults` on existing `manage_category` tool.

**Rationale**: Follows the established pattern in the codebase where tools use `action` discriminators (e.g., `manage_wallet` has `list`, `create`; `manage_debt_loan` has `create`, `list`, `repay`, `update`). A separate `seed_default_categories` tool would add surface area without benefit.

**Default category set** (hardcoded constant array):
```typescript
const DEFAULT_CATEGORIES = [
  // Expense categories
  { name: "Makanan & Minuman", type: "expense", icon: "🍔" },
  { name: "Transportasi", type: "expense", icon: "🚗" },
  { name: "Belanja", type: "expense", icon: "🛍️" },
  { name: "Tagihan & Utilitas", type: "expense", icon: "💡" },
  { name: "Hiburan", type: "expense", icon: "🎬" },
  { name: "Kesehatan", type: "expense", icon: "💊" },
  // Income categories
  { name: "Gaji", type: "income", icon: "💼" },
  { name: "Investasi & Bunga", type: "income", icon: "📈" },
  { name: "Usaha / Freelance", type: "income", icon: "💻" },
  { name: "Pemasukan Lainnya", type: "income", icon: "🎁" },
];
```

**Conflict handling**: Query existing category names for the user, filter out conflicts (case-insensitive match on `name`), insert only missing ones. Uses `db.insert().values([...])` batch insert for efficiency.

### Decision 4: MCP Prompts handler architecture

**Chosen**: Register `ListPromptsRequestSchema` and `GetPromptRequestSchema` handlers alongside existing tool/resource handlers in `src/mcp.ts`. Prompt content is hardcoded as template strings, with argument interpolation for parameterized prompts.

**Server capability update**:
```typescript
const server = new Server(
  { name: "eve-finance-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);
```

**Prompt registry structure**:
```typescript
// prompts/list handler
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "onboarding_assistant",
      description: "Guide a new user through initial account setup...",
      arguments: [
        { name: "currency", description: "Currency code", required: false }
      ]
    },
    {
      name: "daily_briefing",
      description: "Generate a comprehensive daily financial status report...",
      arguments: [
        { name: "date", description: "Date for the briefing", required: false }
      ]
    },
    {
      name: "financial_planning",
      description: "Project when a savings goal can be reached...",
      arguments: [
        { name: "goal_description", description: "What you want to achieve", required: true },
        { name: "target_amount", description: "Target cost/amount", required: true }
      ]
    },
    {
      name: "debt_loan_advisor",
      description: "Analyze active debts/loans and suggest repayment priorities",
      arguments: []
    }
  ]
}));
```

**`prompts/get` handler**: A `switch` on `request.params.name` returns an array of `messages` (role + content). Each prompt returns 1-2 messages with `role: "user"` containing the structured reasoning instructions. Unknown prompt names throw an error.

### Decision 5: Precondition check placement

**Chosen**: Add wallet existence check at the top of `record_transaction` and `transfer_funds` handlers, before any argument validation.

```typescript
// Early return if user has no wallets
const [wc] = await db.select({ count: sql<number>`count(*)` })
  .from(schema.wallets)
  .where(eq(schema.wallets.userId, effectiveUserId));
if (wc.count === 0) {
  return {
    content: [{ type: "text", text: JSON.stringify({
      error: "No wallets found. Please create a wallet first using manage_wallet(action: 'create') or follow the onboarding_assistant prompt.",
      suggestion: "onboarding_assistant"
    })}],
    isError: true
  };
}
```

**Rationale**: Checking before argument validation prevents confusing errors about invalid walletId when the real issue is that the user hasn't set up any wallets at all. The 1-query overhead is trivial.

### Decision 6: Prompt content strategy — static templates with interpolation

**Chosen**: Prompt messages are static template strings with simple argument substitution (e.g., `${currency || "IDR"}`). No database queries during prompt retrieval.

**Rationale**: MCP Prompts are advisory templates — they tell the agent *what to do*, not *what the current state is*. The agent then uses tools/resources to get live data. This keeps prompt handlers stateless, fast, and free from auth requirements at the prompt layer.

**Alternative considered**: Dynamic prompts that query the database for current user state. Rejected because (a) prompts are fetched before tool calls in most agent flows, possibly before auth, and (b) it conflates the prompt's role (instruction) with the resource's role (data).

## Risks / Trade-offs

**[Risk]** Onboarding evaluation adds 2-3 queries to every login/register call.
→ **Mitigation**: These are `COUNT(*)` queries on indexed `userId` columns, executing in <1ms on D1. The trade-off is acceptable for always-accurate onboarding state.

**[Risk]** Hardcoded default categories may not suit all users' preferences.
→ **Mitigation**: The `seed_defaults` action is explicitly invoked by the agent only after user confirmation. Users can always delete or modify seeded categories afterward. The prompt instructs the agent to ask first.

**[Risk]** Prompt text changes require server redeployment.
→ **Mitigation**: Acceptable for now since prompts are tightly coupled to the tool/resource API surface. If prompt content needs to be user-editable in the future, it can be migrated to a D1 table — but this is a non-goal for this change.

**[Risk]** `transfer_funds` precondition check only validates wallet existence, not count ≥ 2.
→ **Mitigation**: The error message indicates "at least 2 wallets are needed for transfers." The actual transfer validation (source vs. target wallet) still catches single-wallet cases downstream, but the improved error message helps the agent guide the user proactively.
