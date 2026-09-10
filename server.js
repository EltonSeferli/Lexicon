import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, initializeDatabase } from "./functions/app.js";

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const publicDirectory = path.dirname(fileURLToPath(import.meta.url));

if (isProduction) {
  app.use(express.static(path.join(publicDirectory, "dist"), { maxAge: "1d" }));
  app.use((request, response, next) => {
    if (request.method === "GET" && !request.path.startsWith("/api")) {
      return response.sendFile(
        path.join(publicDirectory, "dist", "index.html"),
      );
    }
    next();
  });
}

initializeDatabase()
  .then(() => {
    app.listen(port, () =>
      console.log(`Lexicon API listening on http://localhost:${port}`),
    );
  })
  .catch((error) => {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  });
