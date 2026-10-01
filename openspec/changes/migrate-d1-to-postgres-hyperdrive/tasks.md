## 1. PostgreSQL Infrastructure & Database Provisioning

- [ ] 1.1 Create dedicated `reedrich` production database and `reedrich_test` test database in PostgreSQL container
- [ ] 1.2 Generate and execute PostgreSQL DDL schema scripts for all 10 tables (`users`, `wallets`, `categories`, `budgets`, `transactions`, `debts_loans`, `feedbacks`, `goals`, `goal_wallets`, `recurring_templates`) including foreign keys and indexes
- [ ] 1.3 Update Cloudflare Hyperdrive configuration `vps-pg` (`246e815964a44eed9464752afe346134`) to target `--database reedrich`

## 2. Dependencies & ORM Schema Refactoring

- [ ] 2.1 Install `postgres` (postgres.js) client library and TypeScript types in `package.json`
- [ ] 2.2 Refactor `src/db/schema.ts` from `drizzle-orm/sqlite-core` (`sqliteTable`) to `drizzle-orm/pg-core` (`pgTable`) preserving all columns, data types, constraints, and indexes
- [ ] 2.3 Update `wrangler.toml` to bind `[[hyperdrive]]` with `binding = "HYPERDRIVE"` and id `246e815964a44eed9464752afe346134`

## 3. Database Client & Service Layer Adaptations

- [ ] 3.1 Update database instantiation helper and middleware in `src/index.ts`, `src/middleware/auth.ts`, and `src/mcp.ts` to initialize `drizzle(postgres(c.env.HYPERDRIVE.connectionString))`
- [ ] 3.2 Update type signatures across all route handlers in `src/routes/*.ts` to pass `PostgresJsDatabase`
- [ ] 3.3 Update type signatures across all service functions in `src/services/*.ts` (`account-snapshot.ts`, `auth.ts`, `budget.ts`, `category.ts`, `debt-loan.ts`, `feedback.ts`, `goal.ts`, `horizon.ts`, `recurring.ts`, `summary.ts`, `transaction.ts`, `transfer.ts`, `user.ts`, `wallet.ts`) from `DrizzleD1Database` to `PostgresJsDatabase`
- [ ] 3.4 Validate and adjust raw SQL queries (including CTE query in `src/services/wallet.ts`) for PostgreSQL compatibility

## 4. One-Time Production Data Migration (ETL)

- [ ] 4.1 Develop non-destructive ETL script (`scripts/migrate-d1-to-pg.ts`) to extract records from remote D1 and load them into PostgreSQL `reedrich`
- [ ] 4.2 Execute ETL migration across all 10 tables in topological dependency order (`users` -> `wallets` -> `categories` -> `budgets` -> `recurring_templates` -> `transactions` -> `debts_loans` -> `feedbacks` -> `goals` -> `goal_wallets`)
- [ ] 4.3 Verify row count, foreign key, and balance parity between Cloudflare D1 and PostgreSQL `reedrich`

## 5. Test Infrastructure & Verification

- [ ] 5.1 Adapt unit test suite `tests/mcp.test.ts` to run against the local `reedrich_test` database in PostgreSQL
- [ ] 5.2 Update `scripts/run-local-integration.sh` to configure local Hyperdrive connection strings and PostgreSQL cleanup routines
- [ ] 5.3 Update `scripts/run-integration.sh` to execute remote test teardown against PostgreSQL
- [ ] 5.4 Run static verification `npm run typecheck` to ensure 0 TypeScript compilation errors
- [ ] 5.5 Run unit tests `npm test` and local integration tests `npm run test:local` to verify full test suite pass
- [ ] 5.6 Deploy to Cloudflare Workers (`npm run deploy`) and run remote integration tests `npm run test:remote`

## 6. Documentation & Cutover

- [ ] 6.1 Update `README.md`, `AGENTS.md`, and `/home/ubuntu/infra/INFRASTRUCTURE.md` documenting the PostgreSQL and Hyperdrive architecture
- [ ] 6.2 Update `CHANGELOG.md` with migration release notes
