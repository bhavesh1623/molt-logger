# logger-client-node

Pino + MongoDB transport for the **central log collection**. Use in **NestJS** or **Express**; logs are written to a **single, dedicated MongoDB** (batched, no HTTP).

**Logger-system:** MongoDB config for logs is **managed inside this package**. You use one **dedicated MongoDB** for all microservices' logs. Set `LOG_MONGODB_URI` (and optionally `LOG_DATABASE`, `LOG_COLLECTION`) **once in your environment**; in app code you **do not pass URI** — only the **service name**.

## Dedicated MongoDB for logs

- One **specific MongoDB** (instance or database) is used only for storing all microservices' logs.
- Connection is configured via **environment variables** read by logger-client-node:
  - `LOG_MONGODB_URI` — MongoDB connection string for the logs DB (same value for every microservice)
  - `LOG_DATABASE` — Database name (optional; default from URI)
  - `LOG_COLLECTION` — Collection name (default `logs`)
- Microservices **do not pass URI** in code; they only pass **service name**: `createLogger({ service: 'gym' })`.

## Start and test (local)

```bash
cd logger-client-node
npm install
npm run test:local        # Log a few lines (no MongoDB, no server)
npm run start:example     # Express app on :3000 with request/response logging
```

See [../docs/TEST_PROJECT.md](../docs/TEST_PROJECT.md) for details.

## Install (in your app)

```bash
npm install pino mongodb logger-client-node
```

Or link locally: `npm link ./path/to/logger-client-node`

## Local / development: no database, show logs in file

When running **locally** (e.g. `NODE_ENV=development` or `LOG_TO_MONGO=false`), the logger **does not write to MongoDB**. Logs go to **stdout** and optionally to a **file** so you can see them without a database.

```bash
# Local: no MongoDB, logs to stdout only
NODE_ENV=development node src/app.js

# Local: no MongoDB, logs to stdout + file
LOG_TO_MONGO=false LOG_FILE=logs/app.log node src/app.js
```

In code you still call `createLogger({ service: 'gym' })`; no code change. Optional: `createLogger({ service: 'gym', logFile: 'logs/gym.log' })` or set `LOG_FILE` in env.

| Env | Effect |
|-----|--------|
| `NODE_ENV=development` | Local mode: no MongoDB, stdout (and file if `LOG_FILE` set) |
| `LOG_TO_MONGO=false` | Same: no MongoDB, stdout + optional file |
| `LOG_FILE=path/to/app.log` | In local mode, also write logs to this file (directory created if needed) |

---

## Env (set once per environment; same for all microservices)

- `LOG_MONGODB_URI` — **Dedicated** MongoDB URI for logs (or use `MONGODB_URI` as fallback); ignored in local mode
- `LOG_SERVICE` — Service name per app (e.g. `gym`, `users`, `coach`) — can also pass in `createLogger({ service })`
- `LOG_DATABASE` — Database name for logs (optional)
- `LOG_COLLECTION` — Collection name (default `logs`)
- `LOG_LEVEL` — Pino level (default `info`)
- `LOG_BATCH_SIZE` / `LOG_FLUSH_MS` — Batching (default 50 / 5000)

## Usage

### Express — no URI in code

```js
const { createLogger } = require('logger-client-node');

// Set LOG_MONGODB_URI (and LOG_SERVICE if you like) in env; no need to pass uri
const logger = createLogger({ service: 'gym' });

logger.info('Server started');
logger.info({ reqId: 'abc', userId: 'u1' }, 'Request done');
```

### NestJS — no URI in code

```ts
// main.ts — set LOG_MONGODB_URI in env; only pass service name
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from 'logger-client-node';

const logger = createLogger({ service: 'wellness' });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useLogger(logger);
  await app.listen(3000);
}
bootstrap();
```

## Request and response logging (with endpoint)

To store **endpoint**, **request**, and **response** for every HTTP request, use **requestLoggerMiddleware**:

```js
const { createLogger, requestLoggerMiddleware } = require('logger-client-node');
const logger = createLogger({ service: 'users' });
app.use(requestLoggerMiddleware({ logger }));
```

Each request is logged with `endpoint` (e.g. `POST /coach/register`), `request` (method, path, query, body), and `response` (statusCode, durationMs). See [../docs/REQUEST_RESPONSE_LOGGING.md](../docs/REQUEST_RESPONSE_LOGGING.md).

## Schema

Logs are written as documents with: `level`, `message`, `service`, `timestamp`, and optional `reqId`, `userId`, `endpoint`, `request`, `response`, `meta`. See `../logger-schema/SCHEMA.md`.
