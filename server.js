import "dotenv/config";
import express from "express";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const publicDirectory = path.dirname(fileURLToPath(import.meta.url));
const databaseName = process.env.DB_NAME;
if (!/^[A-Za-z0-9_-]+$/.test(databaseName || "")) {
  throw new Error(
    "DB_NAME must contain only letters, numbers, underscores, or hyphens",
  );
}
const connectionConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};
const adminPool = mysql.createPool(connectionConfig);
const pool = mysql.createPool({ ...connectionConfig, database: databaseName });

app.disable("x-powered-by");
app.set("trust proxy", 1);

const splitSynonyms = (value) =>
  String(value || "")
    .split(/\s*(?:,|\s+-\s+)\s*/)
    .map((synonym) => synonym.trim())
    .filter(Boolean);

app.use(express.json());

async function initializeDatabase() {
  await adminPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS words (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      word VARCHAR(255) NOT NULL,
      definition TEXT NOT NULL,
      synonyms JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [columns] = await pool.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'words' AND COLUMN_NAME = 'synonyms'`,
    [databaseName],
  );
  if (columns[0]?.DATA_TYPE !== "json") {
    await pool.query("ALTER TABLE words ADD COLUMN synonyms_list JSON NULL");
    const [legacyWords] = await pool.query("SELECT id, synonyms FROM words");
    for (const legacyWord of legacyWords) {
      const synonyms = splitSynonyms(legacyWord.synonyms);
      await pool.execute("UPDATE words SET synonyms_list = ? WHERE id = ?", [
        JSON.stringify(synonyms),
        legacyWord.id,
      ]);
    }
    await pool.query("ALTER TABLE words DROP COLUMN synonyms");
    await pool.query(
      "ALTER TABLE words CHANGE synonyms_list synonyms JSON NOT NULL",
    );
  }
  const [storedWords] = await pool.query("SELECT id, synonyms FROM words");
  for (const storedWord of storedWords) {
    const synonyms = (
      Array.isArray(storedWord.synonyms)
        ? storedWord.synonyms
        : [storedWord.synonyms]
    ).flatMap(splitSynonyms);
    if (JSON.stringify(synonyms) !== JSON.stringify(storedWord.synonyms)) {
      await pool.execute("UPDATE words SET synonyms = ? WHERE id = ?", [
        JSON.stringify(synonyms),
        storedWord.id,
      ]);
    }
  }
}

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: process.env.DB_NAME });
  } catch (error) {
    response.status(503).json({ ok: false, error: "Database unavailable" });
  }
});

app.get("/api/words", async (_request, response) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, word, definition, synonyms FROM words ORDER BY created_at DESC, id DESC",
    );
    response.json(rows);
  } catch (error) {
    console.error("GET /api/words failed:", error.message);
    response.status(500).json({ error: "Unable to load words" });
  }
});

const normalizeWordInput = (body = {}) => ({
  word: typeof body.word === "string" ? body.word.trim() : "",
  definition: typeof body.definition === "string" ? body.definition.trim() : "",
  synonyms: Array.isArray(body.synonyms)
    ? body.synonyms
        .filter((synonym) => typeof synonym === "string")
        .map((synonym) => synonym.trim())
        .filter(Boolean)
    : [],
});

app.post("/api/words", async (request, response) => {
  const { word, definition, synonyms } = normalizeWordInput(request.body);
  if (!word || !definition || !synonyms.length) {
    return response
      .status(400)
      .json({ error: "Word, definition, and synonyms are required" });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO words (word, definition, synonyms) VALUES (?, ?, ?)",
      [
        word.trim(),
        definition.trim(),
        JSON.stringify(
          synonyms.map((synonym) => synonym.trim()).filter(Boolean),
        ),
      ],
    );
    const [rows] = await pool.execute(
      "SELECT id, word, definition, synonyms FROM words WHERE id = ?",
      [result.insertId],
    );
    response.status(201).json(rows[0]);
  } catch (error) {
    console.error("POST /api/words failed:", error.message);
    response.status(500).json({ error: "Unable to save word" });
  }
});

app.put("/api/words/:id", async (request, response) => {
  const { word, definition, synonyms } = normalizeWordInput(request.body);
  if (!word || !definition || !synonyms.length) {
    return response
      .status(400)
      .json({ error: "Word, definition, and synonyms are required" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE words SET word = ?, definition = ?, synonyms = ? WHERE id = ?",
      [word, definition, JSON.stringify(synonyms), request.params.id],
    );
    if (!result.affectedRows)
      return response.status(404).json({ error: "Word not found" });
    const [rows] = await pool.execute(
      "SELECT id, word, definition, synonyms FROM words WHERE id = ?",
      [request.params.id],
    );
    response.json(rows[0]);
  } catch (error) {
    console.error("PUT /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to update word" });
  }
});

app.delete("/api/words/:id", async (request, response) => {
  try {
    const [result] = await pool.execute("DELETE FROM words WHERE id = ?", [
      request.params.id,
    ]);
    if (!result.affectedRows)
      return response.status(404).json({ error: "Word not found" });
    response.status(204).end();
  } catch (error) {
    console.error("DELETE /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to delete word" });
  }
});

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
