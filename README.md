# Lexicon

Lexicon is a vocabulary flashcard app with an Express API and MySQL persistence.

## Local development

1. Copy `.env.example` to `.env` and set the MySQL connection values.
2. Install dependencies with `npm ci`.
3. Start the API and Vite together with `npm run dev`.
4. Open `http://localhost:5173`.

The API creates the configured database and `words` table on startup. For a
managed MySQL service, use the provider's hostname, port, database, username,
and password in the environment variables.

## Production deployment

The production process serves both the compiled frontend and `/api` from one
Express service. This keeps browser requests same-origin and avoids a separate
CORS configuration.

### Render

1. Create a managed MySQL database with your preferred provider.
2. Create a Render Web Service from this repository. Render can use the included
   `render.yaml`, or set these commands manually:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
3. Add `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` as secret
   environment variables. Set `NODE_ENV=production` and `API_PORT=10000`.
4. Deploy and verify `https://your-domain/api/health` returns `{ "ok": true }`.

### Docker

Build and run the production image with:

```sh
docker build -t lexicon .
docker run --env-file .env -p 3001:3001 lexicon
```

Set `NODE_ENV=production` and point the container's database variables at a
managed MySQL instance. Do not commit `.env` or database credentials.

## Database operations

The API performs idempotent startup initialization for the database and table.
For production, enable automated backups and restrict the database user to the
application database. The `/api/health` endpoint is suitable for platform
health checks.