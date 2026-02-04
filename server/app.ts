import { createRequestHandler } from "@react-router/express";
import express from "express";
import { initDb } from "../app/lib/db.server";

await initDb();

export const app = express();

app.all(
  "*",
  createRequestHandler({
    // @ts-expect-error - virtual import provided by React Router
    build: () => import("virtual:react-router/server-build"),
  })
);
