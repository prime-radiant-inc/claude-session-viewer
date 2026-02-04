if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

import express from "express";

const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV !== "production";
const PORT = Number.parseInt(process.env.PORT || "3000");

const server = express();

if (DEVELOPMENT) {
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({ server: { middlewareMode: true } })
  );
  server.use(viteDevServer.middlewares);
  server.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  server.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
  server.use(express.static("build/client", { maxAge: "1h" }));
  server.use(await import(BUILD_PATH).then((mod) => mod.app));
}

server.listen(PORT, () => {
  console.log(`Session Explorer running on http://localhost:${PORT}`);
});
