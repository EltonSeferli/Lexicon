import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const databaseName = process.env.MONGODB_DB || "lexicon";
let mongoClient;
let wordsCollection;
let initializationPromise;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json());

async function initializeDatabase() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const database = mongoClient.db(databaseName);
    wordsCollection = database.collection("words");
    await wordsCollection.createIndex({ createdAt: -1 });
  })().catch((error) => {
    initializationPromise = undefined;
    throw error;
  });

  return initializationPromise;
}

const serializeWord = ({ _id, word, definition, synonyms }) => ({
  id: _id.toString(),
  word,
  definition,
  synonyms,
});

const parseId = (value) =>
  ObjectId.isValid(value) ? new ObjectId(value) : null;

app.get("/api/health", async (_request, response) => {
  try {
    await initializeDatabase();
    await mongoClient.db(databaseName).command({ ping: 1 });
    response.json({ ok: true, database: databaseName });
  } catch (error) {
    console.error("GET /api/health failed:", error.message);
    response.status(503).json({ ok: false, error: "Database unavailable" });
  }
});

app.get("/api/words", async (_request, response) => {
  try {
    await initializeDatabase();
    const words = await wordsCollection
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    response.json(words.map(serializeWord));
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
    await initializeDatabase();
    const document = {
      word,
      definition,
      synonyms,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await wordsCollection.insertOne(document);
    response
      .status(201)
      .json(serializeWord({ ...document, _id: result.insertedId }));
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
    await initializeDatabase();
    const id = parseId(request.params.id);
    if (!id) return response.status(404).json({ error: "Word not found" });
    const result = await wordsCollection.updateOne(
      { _id: id },
      { $set: { word, definition, synonyms, updatedAt: new Date() } },
    );
    if (!result.matchedCount)
      return response.status(404).json({ error: "Word not found" });
    const updatedWord = await wordsCollection.findOne({ _id: id });
    response.json(serializeWord(updatedWord));
  } catch (error) {
    console.error("PUT /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to update word" });
  }
});

app.delete("/api/words/:id", async (request, response) => {
  try {
    await initializeDatabase();
    const id = parseId(request.params.id);
    if (!id) return response.status(404).json({ error: "Word not found" });
    const result = await wordsCollection.deleteOne({ _id: id });
    if (!result.deletedCount)
      return response.status(404).json({ error: "Word not found" });
    response.status(204).end();
  } catch (error) {
    console.error("DELETE /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to delete word" });
  }
});

export { app, initializeDatabase };
