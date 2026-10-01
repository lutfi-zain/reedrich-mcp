import { execSync } from "node:child_process";
import postgres from "postgres";

const PG_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:3c412f0353f1ec974266c3613f9f9500@127.0.0.1:5432/reedrich";

const TABLES_IN_ORDER = [
  "users",
  "wallets",
  "categories",
  "budgets",
  "recurring_templates",
  "transactions",
  "debts_loans",
  "feedbacks",
  "goals",
  "goal_wallets",
];

async function main() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  Reedrich MCP — One-Time D1 to PostgreSQL Data Migration (ETL)");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const sql = postgres(PG_URL, { max: 1 });

  try {
    for (const table of TABLES_IN_ORDER) {
      process.stdout.write(`Fetching ${table} from remote D1... `);
      const cmd = `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npx wrangler d1 execute finance_db --remote --json --command="SELECT * FROM ${table};"`;
      const stdout = execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });

      const parsed = JSON.parse(stdout);
      const rows = parsed[0]?.results || [];
      console.log(`${rows.length} rows found.`);

      if (rows.length === 0) {
        console.log(`  ✓ ${table}: 0 rows to insert.\n`);
        continue;
      }

      // Batch insert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await sql`
          INSERT INTO ${sql(table)} ${sql(chunk)}
          ON CONFLICT DO NOTHING
        `;
      }

      const [{ count }] = await sql`SELECT count(*)::int AS count FROM ${sql(table)}`;
      console.log(`  ✓ ${table}: Inserted successfully. PG total count = ${count}\n`);
    }

    console.log("══════════════════════════════════════════════════════════════════");
    console.log("  ✅ Migration Complete: All 10 tables successfully transferred!");
    console.log("══════════════════════════════════════════════════════════════════");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
