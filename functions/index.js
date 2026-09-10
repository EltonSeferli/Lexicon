import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { app, initializeDatabase } from "./app.js";

const mongodbUri = defineSecret("MONGODB_URI");

export const api = onRequest(
  { region: "us-central1", secrets: [mongodbUri] },
  async (request, response) => {
    try {
      await initializeDatabase();
      app(request, response);
    } catch (error) {
      console.error("Firebase API initialization failed:", error.message);
      response.status(503).json({ error: "Database unavailable" });
    }
  },
);
