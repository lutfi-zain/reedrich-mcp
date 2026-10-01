import { Hono } from "hono";
import { getDb } from "../db";
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
  const db = getDb(c.env);
  const status = c.req.query("status");
  const type = c.req.query("type");

  const result = await listDebtsLoans(db, userId!, { status, type });
  return c.json(result, 200);
});

debtsLoans.get("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const debtLoanId = c.req.param("debtLoanId");
  const result = await getDebtLoanById(db, userId!, debtLoanId);
  return c.json(result, 200);
});

debtsLoans.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createDebtLoan(db, userId!, body as any);
  return c.json(result, 201);
});

debtsLoans.post("/:debtLoanId/repay", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const debtLoanId = c.req.param("debtLoanId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await repayDebtLoan(db, userId!, debtLoanId, body as any);
  return c.json(result, 200);
});

debtsLoans.patch("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const debtLoanId = c.req.param("debtLoanId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateDebtLoan(db, userId!, debtLoanId, body as any);
  return c.json(result, 200);
});

debtsLoans.delete("/:debtLoanId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const debtLoanId = c.req.param("debtLoanId");
  const result = await deleteDebtLoan(db, userId!, debtLoanId);
  return c.json(result, 200);
});

export default debtsLoans;
