# QueryCraft

QueryCraft is a React and Express SQL schema playground powered by Cloudflare Workers AI.

## Run with Docker Compose

1. Create a local environment file:

   ```sh
   cp .env.example .env
   ```

2. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env`. The token needs the `Account > Workers AI > Read` permission. `CLOUDFLARE_AI_MODEL` is optional.

3. Build and start the application:

   ```sh
   docker compose up --build
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Stop it with `docker compose down`.

The host port can be changed without changing the container:

```sh
PORT=8080 docker compose up --build
```

## Run with Docker directly

```sh
docker build -t querycraft:local .
docker run --rm --init -p 3000:3000 \
  -e CLOUDFLARE_ACCOUNT_ID="your-account-id" \
  -e CLOUDFLARE_API_TOKEN="your-api-token" \
  -e CLOUDFLARE_AI_MODEL="@cf/meta/llama-3.3-70b-instruct-fp8-fast" \
  querycraft:local
```

The container exposes `GET /healthz` for health checks. Cloudflare credentials are supplied only at runtime and are not stored in the image.

## Importing schemas

Open the project menu and choose **Import Database Schema**. You can:

- Upload a `.sql` or `.json` schema file up to 1 MB.
- Paste SQL DDL and parse it with Workers AI.
- Connect to PostgreSQL or MySQL and import table metadata.

When connecting a database, supply a PostgreSQL account with `CREATEROLE` plus permission to grant access to the selected database/schema, or a MySQL account with `CREATE USER` and `GRANT OPTION`. QueryCraft creates a randomly named temporary account with read-only access, uses that restricted account for schema discovery and live queries, and attempts to drop it when the eight-hour connection expires or the server shuts down cleanly. PostgreSQL accounts also receive a database-enforced eight-hour login expiry. Passwords are kept only in backend memory and are never saved in the project or returned to the browser.

For security, private and local database hosts are blocked by default. To permit a trusted private host or Docker service, add its exact hostname to `.env`:

```env
DB_CONNECTION_ALLOWED_HOSTS=db.internal.example,postgres
```

The connection form defaults to **Require encryption**, which works with DigitalOcean and similar managed databases without uploading a CA certificate. It encrypts traffic but does not verify the server certificate identity. Choose **Verify with system CA** when the provider certificate is trusted by Node's system trust store, or **Disable TLS** only for isolated local development.

## Backend logs

The backend writes structured JSON logs to stdout and stderr. Docker Compose captures them automatically:

```sh
docker compose logs -f querycraft
```

Use debug logging for connection and provider troubleshooting:

```env
LOG_LEVEL=debug
```

Successful operations log result summaries by default. To temporarily include redacted result payloads such as generated SQL and imported schema objects:

```env
LOG_RESULT_PAYLOADS=true
```

Restart the container after changing logging settings. Do not leave result payload logging enabled longer than necessary because schemas and generated SQL may contain business-sensitive information. Passwords, API tokens, authorization headers, cookies, and credential fields are centrally redacted.

## Large schemas and AI context

Before an AI request, QueryCraft automatically removes sample rows and nonessential metadata, ranks tables against the question, includes related tables, and limits the schema sent to Workers AI. Defaults can be adjusted in `.env`:

```env
CLOUDFLARE_AI_MAX_TOKENS=4096
AI_SCHEMA_MAX_TABLES=25
AI_SCHEMA_MAX_COLUMNS_PER_TABLE=40
```

The backend emits an `ai.schema.compacted` log containing the original and selected table/column counts. Increasing these values can exceed the selected model's context window; decrease them for unusually wide schemas.

## Live read queries

Projects imported through a PostgreSQL or MySQL connection execute generated SQL against that live database for eight hours, or until the backend restarts. The original account and generated read-only credentials remain only in backend memory; the browser stores an opaque connection handle. If the process is killed without a graceful shutdown, an orphaned account may remain; administrators can identify it by the `querycraft_read_` PostgreSQL prefix or `querycraft_r_` MySQL prefix and remove it after confirming there is no active QueryCraft session.

Live execution accepts one `SELECT` or `WITH ... SELECT` statement, runs it in a database read-only transaction, applies a 15-second timeout, and returns at most 500 rows. `INSERT`, `UPDATE`, `DELETE`, DDL, and stacked statements are rejected before execution and are also blocked by the read-only transaction. Always connect with a dedicated database account that has only `SELECT` privileges; database permissions remain the final security boundary.

## Local development

Install dependencies and run the development server:

```sh
npm ci
npm run dev
```
