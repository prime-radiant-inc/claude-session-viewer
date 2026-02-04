import { createRequestHandler } from "@react-router/express";
import express from "express";

export const app = express();

app.all(
  "*",
  createRequestHandler({
    // @ts-expect-error - virtual import provided by React Router
    build: () => import("virtual:react-router/server-build"),
  })
);
