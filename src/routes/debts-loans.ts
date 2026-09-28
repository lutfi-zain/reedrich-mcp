import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  listDebtsLoans,
  getDebtLoanById,
  createDebtLoan,
  repayDebtLoan,
  updateDebtLoan,
  deleteDebtLoan,
} from "../services/debt-loan";
import type { AppEnv } from "../index";

const debtsLoans = new Hono<AppEnv>();

debtsLoans.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const status = c.req.query("status");
  const type = c.req.query("type");

  const result = await listDebtsLoans(db, userId!, { status, type });
  return c.json(result, 200);
});

debtsLoans.get("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const debtLoanId = c.req.param("debtLoanId");
  const result = await getDebtLoanById(db, userId!, debtLoanId);
  return c.json(result, 200);
});

debtsLoans.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createDebtLoan(db, userId!, body as any);
  return c.json(result, 201);
});

debtsLoans.post("/:debtLoanId/repay", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const debtLoanId = c.req.param("debtLoanId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await repayDebtLoan(db, userId!, debtLoanId, body as any);
  return c.json(result, 200);
});

debtsLoans.patch("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const debtLoanId = c.req.param("debtLoanId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateDebtLoan(db, userId!, debtLoanId, body as any);
  return c.json(result, 200);
});

debtsLoans.delete("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const debtLoanId = c.req.param("debtLoanId");
  const result = await deleteDebtLoan(db, userId!, debtLoanId);
  return c.json(result, 200);
});

export default debtsLoans;
