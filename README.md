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

Database passwords are used only for the import request and are not saved. The importer reads metadata from `information_schema`; it does not download table rows. Imported projects are saved in the browser's local storage and are available when you return in the same browser.

For security, private and local database hosts are blocked by default. To permit a trusted private host or Docker service, add its exact hostname to `.env`:

```env
DB_CONNECTION_ALLOWED_HOSTS=db.internal.example,postgres
```

Keep TLS enabled whenever the database supports it. Use a read-only database account that can access schema metadata but not application data.

## Local development

Install dependencies and run the development server:

```sh
npm ci
npm run dev
```
