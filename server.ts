import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createApiRouter } from "./server/apiRouter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors({ origin: true }));

// Anti-caching middleware for index.html & HTML entry documents
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path === "/index.html") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Mount secure backend API routes
app.use("/api", createApiRouter());

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    // Serve production build from dist
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    // Mount Vite middlewares in development
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Zoya Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Zoya Server] Startup Error:", err);
  process.exit(1);
});
