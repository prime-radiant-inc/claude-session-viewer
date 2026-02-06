import { createRequestHandler } from "@react-router/express";
import express from "express";
import { initDb } from "../app/lib/db.server";

await initDb();

export const app = express();

app.post("/api/rescan", async (_req, res) => {
  try {
    await initDb();
    res.json({ ok: true });
  } catch (err) {
    console.error("Rescan failed:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.all(
  "*",
  createRequestHandler({
    // @ts-expect-error - virtual import provided by React Router
    build: () => import("virtual:react-router/server-build"),
  })
);
