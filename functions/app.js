import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const app = express();
const databaseName = process.env.MONGODB_DB || "lexicon";
let mongoClient;
let wordsCollection;
let progressCollection;
let usersCollection;
let sessionsCollection;
let initializationPromise;
const defaultUserEmail = (
  process.env.DEFAULT_USER_EMAIL || "eltonseferli25@gmail.com"
).toLowerCase();
const defaultUserFullName = "Elton Safarli";
const accessTokenLifetimeMs = 15 * 60 * 1000;
const refreshTokenLifetimeMs = 7 * 24 * 60 * 60 * 1000;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "12mb" }));

async function initializeDatabase() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const database = mongoClient.db(databaseName);
    wordsCollection = database.collection("words");
    progressCollection = database.collection("progress");
    usersCollection = database.collection("users");
    sessionsCollection = database.collection("sessions");
    await wordsCollection.createIndex({ createdAt: -1 });
    await progressCollection.createIndex({ createdAt: -1 });
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await sessionsCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
    await ensureDefaultUser();
    const defaultUser = await usersCollection.findOne({
      email: defaultUserEmail,
    });
    await wordsCollection.updateMany(
      { userId: { $exists: false } },
      { $set: { userId: defaultUser._id } },
    );
    await progressCollection.updateMany(
      { userId: { $exists: false } },
      { $set: { userId: defaultUser._id } },
    );
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
const serializeProgress = ({
  _id,
  title,
  skill,
  band,
  note,
  image,
  createdAt,
}) => ({
  id: _id.toString(),
  title,
  skill,
  band,
  note,
  image,
  createdAt,
});

const parseId = (value) =>
  ObjectId.isValid(value) ? new ObjectId(value) : null;

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const createToken = () => crypto.randomBytes(48).toString("base64url");

async function ensureDefaultUser() {
  const existingUser = await usersCollection.findOne({
    email: defaultUserEmail,
  });
  const configuredPassword = process.env.DEFAULT_USER_PASSWORD;
  if (existingUser) {
    const passwordNeedsUpdate =
      configuredPassword &&
      !(await bcrypt.compare(configuredPassword, existingUser.passwordHash));
    if (passwordNeedsUpdate || existingUser.fullName !== defaultUserFullName) {
      const passwordHash = passwordNeedsUpdate
        ? await bcrypt.hash(configuredPassword, 12)
        : existingUser.passwordHash;
      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            passwordHash,
            fullName: defaultUserFullName,
            updatedAt: new Date(),
          },
        },
      );
      return { ...existingUser, passwordHash, fullName: defaultUserFullName };
    }
    return existingUser;
  }
  const password = configuredPassword || createToken().slice(0, 20);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    email: defaultUserEmail,
    fullName: defaultUserFullName,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await usersCollection.insertOne(user);
  console.log(`[auth] default user: ${defaultUserEmail}`);
  if (!process.env.DEFAULT_USER_PASSWORD)
    console.log(`[auth] generated default password: ${password}`);
  return { ...user, _id: result.insertedId };
}

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
});
const parseCookies = (request) =>
  Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => cookie.trim().split(/=(.*)/s))
      .map(([key, value]) => [key, decodeURIComponent(value || "")]),
  );
const setAuthCookies = (response, accessToken, refreshToken) => {
  response.setHeader("Set-Cookie", [
    `lexicon_access=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${accessTokenLifetimeMs / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    `lexicon_refresh=${refreshToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${refreshTokenLifetimeMs / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  ]);
};
const clearAuthCookies = (response) => {
  response.setHeader("Set-Cookie", [
    "lexicon_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    "lexicon_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  ]);
};
async function createSession(userId, response) {
  const accessToken = createToken();
  const refreshToken = createToken();
  await sessionsCollection.insertOne({
    userId,
    accessHash: hashToken(accessToken),
    refreshHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
    createdAt: new Date(),
  });
  setAuthCookies(response, accessToken, refreshToken);
}
async function requireAuth(request, response, next) {
  try {
    await initializeDatabase();
    const token = parseCookies(request).lexicon_access;
    if (!token)
      return response.status(401).json({ error: "Authentication required" });
    const session = await sessionsCollection.findOne({
      accessHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (!session)
      return response.status(401).json({ error: "Session expired" });
    request.userId = session.userId;
    next();
  } catch (error) {
    response.status(500).json({ error: "Authentication unavailable" });
  }
}

const normalizeProgressInput = (body = {}) => ({
  title: typeof body.title === "string" ? body.title.trim() : "",
  skill: ["Reading", "Writing", "Speaking", "Listening"].includes(body.skill)
    ? body.skill
    : "",
  band: Number.isFinite(Number(body.band)) ? Number(body.band) : null,
  note: typeof body.note === "string" ? body.note.trim() : "",
  image: typeof body.image === "string" ? body.image : "",
});

app.post("/api/auth/register", async (request, response) => {
  const fullName =
    typeof request.body.fullName === "string"
      ? request.body.fullName.trim()
      : "";
  const email =
    typeof request.body.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof request.body.password === "string" ? request.body.password : "";
  if (
    fullName.length < 2 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 8
  )
    return response
      .status(400)
      .json({
        error:
          "Full name, valid email, and an 8-character password are required",
      });
  try {
    await initializeDatabase();
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser)
      return response
        .status(409)
        .json({ error: "An account with this email already exists" });
    const user = {
      fullName,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await usersCollection.insertOne(user);
    await createSession(result.insertedId, response);
    response.status(201).json({
      user: { id: result.insertedId.toString(), fullName, email },
    });
  } catch (error) {
    console.error("POST /api/auth/register failed:", error.message);
    response.status(500).json({ error: "Unable to register" });
  }
});

app.post("/api/auth/login", async (request, response) => {
  const email =
    typeof request.body.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof request.body.password === "string" ? request.body.password : "";
  try {
    await initializeDatabase();
    const user = await usersCollection.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return response.status(401).json({ error: "Invalid email or password" });
    await createSession(user._id, response);
    response.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/login failed:", error.message);
    response.status(500).json({ error: "Unable to login" });
  }
});

app.post("/api/auth/refresh", async (request, response) => {
  try {
    await initializeDatabase();
    const refreshToken = parseCookies(request).lexicon_refresh;
    const session =
      refreshToken &&
      (await sessionsCollection.findOne({
        refreshHash: hashToken(refreshToken),
        expiresAt: { $gt: new Date() },
      }));
    if (!session)
      return response.status(401).json({ error: "Refresh token expired" });
    await sessionsCollection.deleteOne({ _id: session._id });
    await createSession(session.userId, response);
    response.status(204).end();
  } catch (error) {
    response.status(500).json({ error: "Unable to refresh session" });
  }
});

app.post("/api/auth/logout", async (request, response) => {
  const cookies = parseCookies(request);
  await initializeDatabase();
  await sessionsCollection.deleteMany({
    $or: [
      { accessHash: hashToken(cookies.lexicon_access || "") },
      { refreshHash: hashToken(cookies.lexicon_refresh || "") },
    ],
  });
  clearAuthCookies(response);
  response.status(204).end();
});

app.get("/api/auth/me", requireAuth, async (request, response) => {
  const user = await usersCollection.findOne(
    { _id: request.userId },
    { projection: { email: 1, fullName: 1 } },
  );
  if (!user) return response.status(401).json({ error: "User not found" });
  response.json({
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
  });
});

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

app.get("/api/words", requireAuth, async (request, response) => {
  try {
    await initializeDatabase();
    const words = await wordsCollection
      .find({ userId: request.userId })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    response.json(words.map(serializeWord));
  } catch (error) {
    console.error("GET /api/words failed:", error.message);
    response.status(500).json({ error: "Unable to load words" });
  }
});

app.get("/api/progress", requireAuth, async (request, response) => {
  try {
    await initializeDatabase();
    const entries = await progressCollection
      .find({ userId: request.userId })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    response.json(entries.map(serializeProgress));
  } catch (error) {
    console.error("GET /api/progress failed:", error.message);
    response.status(500).json({ error: "Unable to load progress" });
  }
});

app.post("/api/progress", requireAuth, async (request, response) => {
  const entry = normalizeProgressInput(request.body);
  if (!entry.title || !entry.skill || entry.band === null) {
    return response
      .status(400)
      .json({ error: "Title, skill, and band score are required" });
  }

  try {
    await initializeDatabase();
    const document = {
      ...entry,
      userId: request.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await progressCollection.insertOne(document);
    response
      .status(201)
      .json(serializeProgress({ ...document, _id: result.insertedId }));
  } catch (error) {
    console.error("POST /api/progress failed:", error.message);
    response.status(500).json({ error: "Unable to save progress" });
  }
});

app.put("/api/progress/:id", requireAuth, async (request, response) => {
  const entry = normalizeProgressInput(request.body);
  if (!entry.title || !entry.skill || entry.band === null) {
    return response
      .status(400)
      .json({ error: "Title, skill, and band score are required" });
  }

  try {
    await initializeDatabase();
    const id = parseId(request.params.id);
    if (!id) return response.status(404).json({ error: "Progress not found" });
    const result = await progressCollection.updateOne(
      { _id: id, userId: request.userId },
      { $set: { ...entry, updatedAt: new Date() } },
    );
    if (!result.matchedCount)
      return response.status(404).json({ error: "Progress not found" });
    const updatedEntry = await progressCollection.findOne({
      _id: id,
      userId: request.userId,
    });
    response.json(serializeProgress(updatedEntry));
  } catch (error) {
    console.error("PUT /api/progress/:id failed:", error.message);
    response.status(500).json({ error: "Unable to update progress" });
  }
});

app.delete("/api/progress/:id", requireAuth, async (request, response) => {
  try {
    await initializeDatabase();
    const id = parseId(request.params.id);
    if (!id) return response.status(404).json({ error: "Progress not found" });
    const result = await progressCollection.deleteOne({
      _id: id,
      userId: request.userId,
    });
    if (!result.deletedCount)
      return response.status(404).json({ error: "Progress not found" });
    response.status(204).end();
  } catch (error) {
    console.error("DELETE /api/progress/:id failed:", error.message);
    response.status(500).json({ error: "Unable to delete progress" });
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

app.post("/api/words", requireAuth, async (request, response) => {
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
      userId: request.userId,
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

app.put("/api/words/:id", requireAuth, async (request, response) => {
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
      { _id: id, userId: request.userId },
      { $set: { word, definition, synonyms, updatedAt: new Date() } },
    );
    if (!result.matchedCount)
      return response.status(404).json({ error: "Word not found" });
    const updatedWord = await wordsCollection.findOne({
      _id: id,
      userId: request.userId,
    });
    response.json(serializeWord(updatedWord));
  } catch (error) {
    console.error("PUT /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to update word" });
  }
});

app.delete("/api/words/:id", requireAuth, async (request, response) => {
  try {
    await initializeDatabase();
    const id = parseId(request.params.id);
    if (!id) return response.status(404).json({ error: "Word not found" });
    const result = await wordsCollection.deleteOne({
      _id: id,
      userId: request.userId,
    });
    if (!result.deletedCount)
      return response.status(404).json({ error: "Word not found" });
    response.status(204).end();
  } catch (error) {
    console.error("DELETE /api/words/:id failed:", error.message);
    response.status(500).json({ error: "Unable to delete word" });
  }
});

export { app, initializeDatabase };
