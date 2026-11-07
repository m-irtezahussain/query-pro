# QueryCraft

**Turn database schemas and plain-English questions into understandable, executable SQL.**

QueryCraft is an AI-assisted SQL workspace for PostgreSQL and MySQL. It brings schema design, ER diagrams, DDL, natural-language query generation, explanations, and guarded read-only execution into one polished interface. The result is a focused tool that makes exploring a database feel approachable without hiding the SQL it produces.

![QueryCraft workflow: schema ingestion, visual modeling, AI SQL generation, and safe read-only execution](<QueryCraft Workflow Diagram.jpeg>)

## Requirements

Choose one setup path:

- **Docker (recommended):** Docker Engine or Docker Desktop with Docker Compose.
- **Local development:** Node.js 22 and npm. The container is pinned to Node.js 22.13.1.

Both paths require a Cloudflare account ID and an API token with `Account > Workers AI > Read` permission.

## Quick start with Docker Compose

### 1. Clone the repository

```sh
git clone https://github.com/m-irtezahussain/query-pro.git
cd query-pro
```

If you already have the repository, run the remaining commands from its root directory.

### 2. Create the environment file

```sh
cp .env.example .env
```

Open `.env` and replace the two placeholders:

```env
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
```

The default Workers AI model and schema limits are already configured in `.env.example`.

### 3. Build and start QueryCraft

```sh
docker compose up --build
```

The first run installs dependencies, checks the TypeScript project, builds the client and server, and starts the production container.

### 4. Verify the service

Open [http://localhost:3000](http://localhost:3000), or check the health endpoint:

```sh
curl http://localhost:3000/healthz
```

Expected response:

```json
{"status":"ok"}
```

### 5. Stop the app

```sh
docker compose down
```

To use a different host port, keep the container port unchanged:

```sh
PORT=8080 docker compose up --build
```

Then open `http://localhost:8080`.

## Local development setup

### 1. Install dependencies

```sh
npm ci
```

### 2. Configure the environment

```sh
cp .env.example .env
```

Add your Cloudflare account ID and Workers AI token to `.env` as shown in the Docker setup.

### 3. Start the development server

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To use another port:

```sh
PORT=3001 npm run dev
```

### 4. Check and build the project

```sh
npm run lint
npm run build
```

To run the compiled production server after building:

```sh
npm start
```

## Features

- **Natural-language SQL:** describe the data you need and receive dialect-aware SQL, an explanation, assumptions, caveats, and follow-up questions.
- **Visual schema studio:** create and edit tables, columns, constraints, relationships, and mock rows from the browser.
- **Interactive ER diagrams:** inspect table relationships and schema structure visually.
- **DDL workspace:** review and export raw schema SQL alongside the visual model.
- **Flexible schema ingestion:** upload `.sql` or `.json`, paste DDL, or inspect a PostgreSQL or MySQL database.
- **Schema-aware AI context:** large schemas are compacted by relevance before being sent to Cloudflare Workers AI.
- **Guarded live execution:** live sessions use temporary read-only database users, read-only transactions, a 15-second timeout, and a 500-row result limit.
- **Useful results:** inspect execution time, search results, export CSV, save favorites, and revisit query history.
- **Reconnect and cleanup controls:** refresh an expired database session or remove a saved database without deleting the real database.

## How QueryCraft works

1. **Ingest a schema.** Start with a sample project, design a schema, upload SQL or JSON, paste DDL, or connect PostgreSQL/MySQL.
2. **Explore and refine it.** QueryCraft turns the schema into editable tables, raw DDL, and an ER diagram. Projects and query history are saved in browser storage.
3. **Ask in plain English.** The backend removes sample rows and nonessential metadata, selects the most relevant tables and relationships, and sends that context to Workers AI.
4. **Review generated SQL.** QueryCraft returns the SQL with an explanation and supporting details instead of treating AI output as a black box.
5. **Execute safely.** Schema-only projects run against local mock data. Live database projects send a validated `SELECT` or `WITH ... SELECT` query through the temporary read-only account.
6. **Inspect and export.** Results appear in a searchable table with timing, truncation status, and CSV export.

## Using the app

### Create a schema-only project

1. Open QueryCraft and create a new project.
2. Select PostgreSQL or MySQL as the SQL dialect.
3. Add tables manually, generate a schema from a description, or choose **Import Database Schema** to upload/paste schema content.
4. Use **Schema Designer**, **ER Diagram**, and **Raw DDL** to inspect and refine the model.
5. Open the natural-language query view, enter a request, and generate SQL.
6. Run the query against the project's mock rows or export the SQL for another database client.

Uploaded `.sql` and `.json` files are limited to 1 MB.

### Connect a live database

1. Open the project menu and choose **Import Database Schema**.
2. Choose **Connect Database**, then select PostgreSQL or MySQL.
3. Enter the host, port, database, schema (PostgreSQL), username, password, and TLS mode.
4. Connect and save the imported schema.
5. Generate a query, review it, and run it against the live database.
6. Use **Reconnect** when the eight-hour session expires. Use the remove control to clear the saved schema and history from the browser; it does not delete the database.

The supplied database account is a provisioning account, not the account used for generated queries. It must be able to create and grant access to a restricted temporary user:

- **PostgreSQL:** `CREATEROLE` plus permission to grant access to the selected database and schema.
- **MySQL:** `CREATE USER` and `GRANT OPTION` for the selected database.

QueryCraft creates a randomized account with read-only access, keeps its password only in backend memory, and attempts to remove it when the session expires, the saved project is removed, or the server shuts down cleanly. PostgreSQL temporary roles also receive a database-enforced eight-hour login expiry.

> Use a dedicated provisioning account with the minimum permissions required. Database permissions remain the final security boundary.

## TLS modes

| Mode | Behavior | Recommended use |
| --- | --- | --- |
| Require encryption | Encrypts traffic without verifying the server certificate identity | Managed databases where a CA certificate is not available in Node's trust store |
| Verify with system CA | Encrypts traffic and verifies the server with Node's system CAs | Production services with a publicly trusted certificate |
| Disable TLS | Sends database traffic without TLS | Isolated local development only |

QueryCraft preserves the original hostname for TLS SNI while connecting to a DNS-resolved address. This supports multi-tenant PostgreSQL providers such as Neon without asking users to upload certificates.

Private and local database destinations are blocked by default. Allow only trusted hosts by listing their exact names in `.env`:

```env
DB_CONNECTION_ALLOWED_HOSTS="db.internal.example,postgres"
```

Restart the app after changing environment variables.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | — | Cloudflare account that owns the Workers AI entitlement |
| `CLOUDFLARE_API_TOKEN` | Yes | — | API token with Workers AI read permission |
| `CLOUDFLARE_AI_MODEL` | No | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Workers AI model used for generation and explanations |
| `CLOUDFLARE_AI_MAX_TOKENS` | No | `4096` | Maximum AI response tokens |
| `AI_SCHEMA_MAX_TABLES` | No | `25` | Maximum relevant tables included in AI schema context |
| `AI_SCHEMA_MAX_COLUMNS_PER_TABLE` | No | `40` | Maximum columns included per selected table |
| `DB_CONNECTION_ALLOWED_HOSTS` | No | Empty | Exact, comma-separated allowlist for private/local database hosts |
| `LOG_LEVEL` | No | `info` | Structured log level: `debug`, `info`, `warn`, or `error` |
| `LOG_RESULT_PAYLOADS` | No | `false` | Includes redacted result payloads in logs for short-term debugging |
| `PORT` | No | `3000` | Host port in Compose and server port during local development |

## Live-query safety model

Before execution, QueryCraft parses the SQL and accepts exactly one `SELECT` or `WITH ... SELECT` statement. It rejects writes, DDL, transaction control, and stacked statements. Accepted queries run through a temporary account with read-only grants and inside a read-only transaction.

Additional boundaries:

- Live connection handles and credentials exist only in backend memory.
- Live sessions expire after eight hours and also expire after a backend restart.
- Queries time out after 15 seconds.
- Results are capped at 500 rows and report whether they were truncated.
- Browser storage contains project metadata and an opaque connection ID, not database passwords.

## Logs and troubleshooting

Follow container logs:

```sh
docker compose logs -f querycraft
```

Enable more connection and provider detail:

```env
LOG_LEVEL="debug"
```

For short-term debugging, result summaries can include redacted SQL and schema payloads:

```env
LOG_RESULT_PAYLOADS="true"
```

Restart the app after changing logging settings. Leave payload logging off during normal operation because generated SQL and schemas may contain business-sensitive names. Passwords, API tokens, authorization headers, cookies, and credential fields are redacted centrally.

Common issues:

- **Workers AI requests fail:** confirm both Cloudflare values are present and the token has Workers AI read permission.
- **A private database is blocked:** add its exact hostname to `DB_CONNECTION_ALLOWED_HOSTS`; do not add broad or untrusted destinations.
- **Temporary-user creation is denied:** use a correctly scoped provisioning account with the PostgreSQL or MySQL permissions described above.
- **A live session expired:** reconnect from the query view to create a fresh temporary read-only user and refresh the schema.
- **Generated SQL references the wrong identifier case:** review the SQL before execution. PostgreSQL folds unquoted identifiers to lowercase, while quoted mixed-case names are case-sensitive.

If the server is killed without a graceful shutdown, a temporary account can remain. After confirming that no QueryCraft session is using it, an administrator can identify PostgreSQL accounts by the `querycraft_read_` prefix and MySQL accounts by `querycraft_r_`.

## Technology

QueryCraft uses React 19, TypeScript, Vite, Express, Tailwind CSS, Motion, Cloudflare Workers AI, PostgreSQL's `pg` client, MySQL2, `node-sql-parser`, and AlaSQL for local mock-data queries.
