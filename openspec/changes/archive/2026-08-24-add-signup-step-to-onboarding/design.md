## Context

See `proposal.md` for motivation.

The Reedrich MCP server exposes an `onboarding_assistant` prompt via `GetPromptRequestSchema` in `src/mcp.ts`. Currently, the prompt instructions assume the user has already registered or logged in, starting directly with inspecting the `onboarding` status. This leaves autonomous agents without explicit directive guidance when facing brand-new, unauthenticated users.

## Goals / Non-Goals

**Goals:**
- Update the `onboarding_assistant` prompt in `src/mcp.ts` to include explicit Step 1 instructions for new user registration (`register_user`) and returning user login (`login_user`).
- Ensure full structural parity between the MCP prompt (`src/mcp.ts`), the Claude Code skill (`skills/reedrich-onboarding/SKILL.md`), and agent documentation.
- Update test assertions in `tests/mcp.test.ts` to verify the presence of `register_user` and `login_user` in the returned prompt text.

**Non-Goals:**
- Altering the implementation or schemas of `register_user`, `login_user`, or `evaluateOnboarding`.
- Changing database tables or D1 queries.

## Decisions

### 1. In-Prompt Registration & Auth Step
*Decision*: Structure the `onboarding_assistant` prompt messages with 5 sequential stages:
1. **User Registration & Auth**: Directs the agent to prompt for `firstName`, `lastName`, `email`, and `whatsappNumber` (+country code) to call `register_user`, or accept `apiKey` (`rd_live_...`) to call `login_user`.
2. **Onboarding Status Inspection**: Inspect `onboarding.needs` from the auth response (`"wallet"`, `"categories"`).
3. **Primary Wallet Creation**: Guide creation of primary account(s) via `manage_wallet`.
4. **Default Category Seeding**: Ask for user confirmation to seed 10 standard categories via `manage_category(action: "seed_defaults")`.
5. **Optional Budget Setup & Completion**: Offer monthly budgeting via `manage_budget` and confirm readiness.

*Rationale*: Gives autonomous agents a self-contained, deterministic playbook that works equally well for new and returning users.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ENHANCED ONBOARDING WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

  1. New User? ──▶ Prompt for details ──▶ Tool: `register_user`
         │                                       │
         ▼                                       ▼
  2. Inspect Status ◀────────────────────── Returns `apiKey` + `onboarding`
         │
         ├── Needs "wallet"? ───────────▶ Tool: `manage_wallet` (create)
         │
         ├── Needs "categories"? ───────▶ Tool: `manage_category` (seed_defaults)
         │
         └── Optional Setup ────────────▶ Tool: `manage_budget` (create)
                 │
                 ▼
  3. Ready for Transactions ────────────▶ `record_transaction` / `transfer_funds`
```

### 2. Parity across Protocol Layers
*Decision*: Keep prompt wording in `src/mcp.ts` and skill instructions in `skills/reedrich-onboarding/SKILL.md` strictly aligned so agents behaving via MCP Prompts protocol and Claude Code Skills receive identical instruction semantics.

## Risks / Trade-offs

- **[Prompt Token Length]** -> Adding registration instructions increases prompt message size slightly. Mitigation: Use concise, bulleted Markdown directives keeping prompt payload under 500 words.
