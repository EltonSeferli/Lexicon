# Lexicon

Lexicon is a vocabulary flashcard app with an Express API and MongoDB persistence.

## Local development

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and `MONGODB_DB` from MongoDB Atlas.
2. Install dependencies with `npm ci`.
3. Start the API and Vite together with `npm run dev`.
4. Open `http://localhost:5173`.

The API connects with the MongoDB Node.js driver and creates the `words`
collection and its `createdAt` index on startup. Keep the Atlas connection
string in `MONGODB_URI`; do not commit it.

## Production deployment

The production process serves both the compiled frontend and `/api` from one
Express service. This keeps browser requests same-origin and avoids a separate
CORS configuration.

### Render

1. Create a MongoDB Atlas cluster and database user. Copy the Node.js driver
   connection string, using driver version 6.7 or later.
2. Create a Render Web Service from this repository. Render can use the included
   `render.yaml`, or set these commands manually:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
3. Add `MONGODB_URI` and `MONGODB_DB` as secret environment variables. Set
   `NODE_ENV=production` and `API_PORT=10000`.
4. Deploy and verify `https://your-domain/api/health` returns `{ "ok": true }`.

### Docker

Build and run the production image with:

```sh
docker build -t lexicon .
docker run --env-file .env -p 3001:3001 lexicon
```

Set `NODE_ENV=production` and point `MONGODB_URI` at the Atlas cluster. Do not
commit `.env` or database credentials.

### Firebase Hosting + Cloud Run

Firebase Hosting serves the frontend, while Cloud Run runs the Express API.
The included `firebase.json` forwards `/api/**` to the Cloud Run service
`lexicon-api`, keeping browser requests same-origin.

1. Install the Firebase CLI: `npm install -g firebase-tools`.
2. Create or select a Google Cloud project in Firebase Console, then run
   `firebase login` and `firebase use YOUR_FIREBASE_PROJECT_ID`.
3. Enable billing and enable the Cloud Run and Firebase Hosting APIs.
4. Build and deploy the API from this folder:

   ```sh
   gcloud run deploy lexicon-api --source . --region us-central1 --allow-unauthenticated
   ```

   Set these Cloud Run environment variables during deployment:
   `NODE_ENV=production`, `MONGODB_URI`, and `MONGODB_DB`. Store the MongoDB
   connection string as a Secret Manager secret rather than putting it directly
   in shell history.

5. Deploy Firebase Hosting:

   ```sh
   firebase deploy --only hosting
   ```

6. Verify `https://YOUR_PROJECT_ID.web.app/api/health` returns `{ "ok": true }`.

The Cloud Run service must be named `lexicon-api` and deployed in
`us-central1`, or update those values in `firebase.json` before deploying.

### Firebase Hosting + Cloud Functions

The same frontend can use Firebase Functions instead of Cloud Run, so no
`gcloud` command is required. The repository includes a Firebase Function
named `api` and routes `/api/**` to it.

1. Enable billing for the Firebase project. Firebase Functions cannot deploy
   on the Spark plan.
2. Store the Atlas connection string as a Firebase secret. Firebase CLI will
   prompt for the value without putting it in source control:

   ```sh
   firebase functions:secrets:set MONGODB_URI
   ```

3. Deploy both the API and frontend:

   ```sh
   firebase deploy --only functions:api,hosting
   ```

The function uses `MONGODB_DB=lexicon` by default. Set another database name
in `functions/.env` if needed; that file is ignored and must not be committed.

## Database operations

The API performs idempotent startup initialization for the collection index.
For production, enable Atlas backups, restrict the database user to the
application database, and add the deployment server's IP address to the Atlas
network access list. The `/api/health` endpoint is suitable for platform health
checks.
