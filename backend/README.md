# GARUDA Backend

## Architecture

GARUDA does not run a separate backend server. The existing Next.js App Router application in `frontend/` serves both the UI and server-side API handlers. Pages and shared React components call same-origin `/api/...` routes with JSON requests; authentication is carried in an HttpOnly session cookie. The API routes call server-only services and MongoDB directly.

The top-level `backend/` directory contains environment configuration and this documentation. Application backend code remains in `frontend/`.

## Backend code map

- `frontend/app/api/` — Next.js Route Handlers:
  - `auth/{register,login,logout,session}` — account registration and session lifecycle.
  - `admin/{overview,trainees,trainees/[id]}` — administrator reads and analytics.
  - `training/sessions`, `training/sessions/[id]`, `training/import` — start, save, retrieve, list, and explicitly import training sessions.
  - `language/translate-command` — UI text translation and Hindi voice-command translation.
  - `phone-control` — phone pairing, orientation, recentering, and scene snapshots.
- `frontend/lib/server/` — database access, server environment loading, authentication/security, password hashing, request validation, HTTP helpers, and Bhashini service/response parsing.
- `frontend/lib/server/database.ts` — MongoDB collection types, indexes, JSON-schema validators, and the initial schema migration marker. There is no separate models directory, Prisma schema, or ORM; MongoDB document types and validation are defined in the server service and validation modules.
- `frontend/lib/training-session.ts` — training-session domain types, scoring, local persistence, and sync/import helpers.
- `frontend/proxy.ts` — role-based gate for `/admin/*` and `/soldier/*` page routes. API handlers perform their own authentication, role, ownership, and input checks.
- `frontend/scripts/` — database setup and one-time administrator bootstrap scripts.

## Database and persistence

The database is MongoDB, accessed with the official Node driver. `MONGO_URI` is required; `MONGO_DB_NAME` optionally selects a database (otherwise the database in the URI is used). `npm run db:migrate` and the first application database connection create indexes, apply moderate JSON-schema validation, and record `001_initial_garuda_backend` in `schemaMigrations`. This is a small in-code initial migration, not a general migration framework.

The application stores and retrieves:

- `users`: soldier and administrator accounts, bcrypt password hashes, role, status, and timestamps.
- `authSessions`: revocable database sessions with expiry; expired rows are removed by a MongoDB TTL index.
- `trainingSessions`: session status, owner, scenario/difficulty/score summaries, and the completed session/event data. Soldier history is owner-scoped. The list endpoint returns up to 250 records; a detail endpoint returns the owner’s full session. Administrator overview and trainee endpoints aggregate persisted users and sessions.
- `authRateLimits`: short-lived counters for login and translation requests, with TTL cleanup.
- `adminBootstrapLocks` and `schemaMigrations`: one-time bootstrap protection and schema-version bookkeeping.

The simulator also keeps session/replay data in browser storage. Completed results are saved locally first and then sent to MongoDB; the UI reports when account sync fails. `POST /api/training/import` explicitly imports older local sessions for the signed-in soldier in batches, without deleting the local copy. In-progress server records contain start metadata; the full validated event/session data is written on completion.

Phone pairing state is different: `/api/phone-control` holds it in a process-local map with an expiry. It is not stored in MongoDB and is not shared between application instances.

## Authentication and authorization

- `POST /api/auth/register` creates `SOLDIER` accounts only. Public administrator signup is rejected.
- The initial administrator is provisioned by `npm run admin:bootstrap`, using `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`. The script refuses to create another initial administrator once one exists or bootstrap has been used. Remove the bootstrap password from the private environment after use. There is no administrator account-management API in the current routes.
- Login verifies the bcrypt password and active account, then sets an HttpOnly, SameSite=Lax cookie containing a signed HS256 token. The token refers to a database session, which logout revokes. API authentication checks the token, live session, account status, and current role.
- `proxy.ts` gates administrator and soldier page paths by the signed role claim. Sensitive API routes also check the database-backed user/session and required role; training reads and writes are restricted to the owning soldier.

`JWT_SECRET` must be at least 32 bytes. `JWT_EXPIRY` defaults to `7d`; supported units are `s`, `m`, `h`, and `d`, with values limited to one minute through 30 days.

## Bhashini multilingual integration

The shared language selector translates visible interface text through `POST /api/language/translate-command`. Successful UI translations are cached in the browser; reusable pipeline configuration is cached in the server process. English remains the fallback. The selected language is stored in browser local storage and persists across refreshes and navigation.

The current translation catalogue exposes English plus the 22 English-to-Indian-language targets reported by the configured pipeline: `as`, `bn`, `brx`, `doi`, `gom`, `gu`, `hi`, `kn`, `ks`, `mai`, `ml`, `mni`, `mr`, `ne`, `or`, `pa`, `sa`, `sat`, `sd`, `ta`, `te`, and `ur`. Pipeline configuration is checked for each requested pair; a catalogue entry is not a guarantee that every live inference will succeed. Live English↔Hindi inference has been verified.

For voice commands, the existing browser speech-recognition API produces the transcript. When Hindi is selected, Bhashini can translate Hindi text to English; the existing GARUDA command parser must accept the result before it can become a supported action. English commands continue through the parser directly. Browser speech recognition requires the browser’s microphone permission; phone pairing does not provide microphone audio to the browser. Bhashini ASR and TTS are not integrated.

Configuration uses `BHASHINI_USER_ID` and `BHASHINI_UDYAT_KEY` for the documented ULCA pipeline configuration request. Compute authorization and service IDs come from the config response. The official search page lists documented pipeline candidates but does not specify a search request URL or schema; the service validates those candidates through the documented config API rather than inventing a search request. See [pipeline search](https://bhashini.gitbook.io/bhashini-apis/pipeline-search-call), [configuration](https://bhashini.gitbook.io/bhashini-apis/pipeline-config-call), and [compute](https://bhashini.gitbook.io/bhashini-apis/pipeline-compute-call).

## Environment configuration

Copy `backend/.env.example` to `backend/.env` and fill only the values needed for the features you use. Keep `backend/.env` private and out of version control; never place server credentials in `frontend/.env` or expose them to browser code. During development, `frontend/lib/server/env.ts` and `frontend/proxy.ts` load `../backend/.env`. In production, inject required values through the hosting environment.

Runtime variables used by the backend are:

- `MONGO_URI` (required), `MONGO_DB_NAME` (optional).
- `JWT_SECRET` (required), `JWT_EXPIRY` (optional).
- `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` (only for initial administrator provisioning).
- `BHASHINI_USER_ID` and `BHASHINI_UDYAT_KEY` (for Bhashini translation).

The supplied template also contains `BHASHINI_INTERFERANCE_KEY` and `BHASHINI_PIPELINE_ID`; the current Bhashini service does not read these. It obtains inference authorization from the configuration response and validates documented pipeline candidates itself. Do not add a new pipeline ID to make this implementation work. `PORT` and `FRONTEND_URL` are template values not consumed by the current application services; the Next.js CLI controls the development server port.

## Setup and commands

Run commands from `frontend/`. Configure `backend/.env` first, then install dependencies:

```sh
npm install
npm run db:migrate
npm run dev
```

Available package scripts are:

```sh
npm run admin:bootstrap  # provision the initial administrator
npm run db:migrate       # connect to MongoDB and apply current indexes/validators
npm run dev              # start Next.js development server
npm test                 # run node:test suites
npm run build            # create a production build
npm run start            # serve the production build
```

For production, build with `npm run build` and start with `npm run start`; provide environment variables through the host. The package does not define a lint script. TypeScript can be checked separately with `npx tsc --noEmit --incremental false`.

