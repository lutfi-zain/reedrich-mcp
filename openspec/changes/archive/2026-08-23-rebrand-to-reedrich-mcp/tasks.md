## 1. Package & Worker Configuration

- [x] 1.1 Update `package.json` with `"name": "reedrich-mcp"`, updated description, and repository metadata
- [x] 1.2 Update `wrangler.toml` worker name to `reedrich-mcp`
- [x] 1.3 Update `.mcp.json` and `.omp/mcp.json` server key to `reedrich`

## 2. Auth Layer & Token Utilities

- [x] 2.1 Update `src/utils/token.ts` constants `TOKEN_ISSUER` to `'reedrich-mcp'` and `TOKEN_AUDIENCE` to `'reedrich-client'`, with dual-issuer backward compatibility in `verifyUserToken`
- [x] 2.2 Update `src/utils/token.ts` `generateApiKey()` prefix from `fp_live_` to `rd_live_` while ensuring deterministic SHA-256 hash lookup for existing `fp_live_` keys
- [x] 2.3 Update `src/index.ts` request header fallbacks and comments to reference Reedrich

## 3. MCP Server Core & Resource Protocol

- [x] 3.1 Update `src/mcp.ts` Server constructor identity to `{ name: 'reedrich-mcp', version: '1.0.0' }`
- [x] 3.2 Update `src/mcp.ts` resource registration and handlers from `finance://` to `reedrich://` (`reedrich://db/schema`, `reedrich://wallets/list`, `reedrich://budgets/active`, `reedrich://debts/active`)
- [x] 3.3 Update `src/mcp.ts` prompt templates (`onboarding_assistant`, `daily_briefing`, `financial_planning`, `debt_loan_advisor`) to reference `reedrich://` URIs
- [x] 3.4 Update tool descriptions in `src/mcp.ts` to reflect the Reedrich mathematical financial planning engine persona

## 4. Coding Agent Snippets & Config Templates

- [x] 4.1 Update `scripts/agent-snippet.ts` generator with `reedrich` server name, `https://reedrich-mcp.lutfidmz.workers.dev/mcp` endpoint, and `rd_live_` tokens
- [x] 4.2 Update `docs/CODING_AGENTS.md` with complete Reedrich branding and one-liner setup guides
- [x] 4.3 Update `examples/agents/` configurations (`claude-code.json`, `cursor-vscode.json`, `omp.mcp.json`, `opencode.json`, `pi.mcp.json`)

## 5. Test Suite Updates & Local Verification

- [x] 5.1 Update unit tests in `tests/mcp.test.ts` to assert against `reedrich://` URIs, `reedrich-mcp` issuer, and `rd_live_` key formats
- [x] 5.2 Update integration tests in `tests/integration.test.ts` across all 29 steps to assert against `reedrich://` URIs and new tokens
- [x] 5.3 Update test scripts `scripts/run-local-integration.sh` and `scripts/run-integration.sh`
- [x] 5.4 Run `npm run typecheck` and verify 0 TypeScript compilation errors
- [x] 5.5 Run `npm test` and verify 14/14 unit test suites pass
- [x] 5.6 Run `npm run test:local` and verify all 29 integration test steps pass against local D1

## 6. Documentation & OpenSpec Alignment

- [x] 6.1 Update `README.md` and `TOOLS.md` with Reedrich mathematical superhero theme, architecture diagrams, and quickstart guides
- [x] 6.2 Update `database_schema.md` with Reedrich project headers
- [x] 6.3 Update `openspec/config.yaml` and main specs under `openspec/specs/` with the new project identity and URI schemes
