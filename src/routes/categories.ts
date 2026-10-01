import { Hono } from "hono";
import { getDb } from "../db";
import { listCategories, getCategoryById, createCategory, updateCategory, deleteCategory, seedDefaults } from "../services/category";
import type { AppEnv } from "../index";

const categories = new Hono<AppEnv>();

categories.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const result = await listCategories(db, userId!);
  return c.json(result, 200);
});

categories.get("/:categoryId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const categoryId = c.req.param("categoryId");
  const result = await getCategoryById(db, userId!, categoryId);
  return c.json(result, 200);
});

categories.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createCategory(db, userId!, body as any);
  return c.json(result, 201);
});

categories.post("/seed", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const result = await seedDefaults(db, userId!);
  return c.json(result, 200);
});

categories.patch("/:categoryId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const categoryId = c.req.param("categoryId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateCategory(db, userId!, categoryId, body as any);
  return c.json(result, 200);
});

categories.delete("/:categoryId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const categoryId = c.req.param("categoryId");
  const result = await deleteCategory(db, userId!, categoryId);
  return c.json(result, 200);
});

export default categories;
