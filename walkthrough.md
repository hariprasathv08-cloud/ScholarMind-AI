# Walkthrough: Migration to Render PostgreSQL & Custom Auth

This document outlines the changes made to completely decouple your application from Supabase, migrating it to a Render-hosted PostgreSQL database, custom JWT session authentication (with secure, HTTP-only cookies), and local filesystem storage for document uploads.

---

## 1. Core Architectural Changes

### Database Connector & Auto-Bootstrap
* **File**: [`src/lib/db.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/db.ts)
* **Description**:
  - Connects to PostgreSQL using `pg` (node-postgres) via `process.env.DATABASE_URL` (automatically provided in your Render Postgres console).
  - Automatically initializes and creates the required database schema on application start, including `public.users`, `public.profiles`, `public.documents`, `public.document_chunks`, `public.conversations`, and `public.messages`.
  - Enables the `vector` extension and configures dimension indices for Gemini embeddings.

### Custom Session Authentication
* **File**: [`src/lib/auth-utils.server.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/auth-utils.server.ts)
* **Description**:
  - Handles secure password hashing via `bcryptjs`.
  - Signs and validates session tokens via `jsonwebtoken` using `process.env.JWT_SECRET`.
  - Implements the `requireAuth` middleware for TanStack Start Server Functions, extracting sessions from secure, HTTP-only `auth_token` cookies.

### Backend Authentication API Routes
* **Signup Route**: [`signup.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/signup.ts) hashes passwords and registers profiles.
* **Signin Route**: [`signin.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/signin.ts) validates credentials and signs JWTs.
* **Signout Route**: [`signout.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/signout.ts) expires the cookie.
* **Session Route**: [`me.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/me.ts) returns active session user payloads.

### Custom Google OAuth Initiation & Callback
* **Google Initiation**: [`google.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/google.ts) constructs the OAuth URL and redirects to the Google Account chooser using `process.env.GOOGLE_CLIENT_ID`.
* **Google Callback**: [`callback.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/google/callback.ts) exchanges authorization codes for tokens, registers users, creates session cookies, and redirects back to `/dashboard`.

### Client-Side Drop-in Auth Provider Mock
* **File**: [`src/integrations/supabase/client.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/integrations/supabase/client.ts)
* **Description**:
  - Rewritten as a custom auth client proxy that maps calls to our local auth endpoints.
  - Mimics `supabase.auth` (e.g. `signUp`, `signInWithPassword`, `signInWithOAuth`, `signOut`, `onAuthStateChange`, `getUser`, `getSession`).
  - Implements global state cache/synchronization to avoid duplicated requests.
  - This avoids refactoring auth imports across pages and wrappers like `<ProtectedRoute>`.

### Local File Storage API
* **File**: [`upload.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/documents/upload.ts)
* **Description**:
  - Intercepts file uploads via `multipart/form-data`.
  - Writes documents directly to the local disk inside the `uploads/{userId}/` folder.
  - Registers metadata in PostgreSQL.

---

## 2. Server Functions & Router Components

### Documents & Dashboard Functions
* **Documents Functions**: [`documents.functions.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/documents.functions.ts) now fetches document lists and processes uploads by reading directly from the local disk instead of Supabase storage, creating embeddings and writing vector rows via `pg`.
* **Dashboard Functions**: [`dashboard.functions.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/dashboard.functions.ts) queries tables directly to populate totals and weekly activity stats.
* **Chats & Messages Server Functions**: [`chats.functions.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/chats.functions.ts) created to load conversation history and recent sidebar chats via server functions.

### Chat API Handler
* **File**: [`src/routes/api/chat.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/chat.ts)
* **Description**:
  - Uses the custom JWT auth cookie.
  - Executes raw vector similarity search queries using the `pgvector` operators (`<=>`).
  - Inserts assistant messages and auto-titles conversations using PostgreSQL.

### Refactored UI Components
* **[`app-shell.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/components/app-shell.tsx)**: Reads recent chats from `listRecentConversations`.
* **[`chat.$documentId.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/_authenticated/chat.$documentId.tsx)**: Reads messages from `listMessages`, sends chats to `/api/chat` without authorization headers.
* **[`library.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/_authenticated/library.tsx)**: Posts file uploads directly to `/api/documents/upload`.

---

## 3. Deployment to Render Checklist

To deploy the application to Render:
1. **New Web Service**: Connect your GitHub repository to Render and create a new **Web Service**.
2. **Environment Variables**: Define the following variables under settings:
   - `DATABASE_URL`: (Render will automatically connect this if you use their managed PostgreSQL database).
   - `JWT_SECRET`: Any random security string (e.g. `my-prod-signing-key-random`).
   - `LOVABLE_API_KEY`: Your Lovable API key.
   - `GOOGLE_CLIENT_ID`: (Optional, for Google Login).
   - `GOOGLE_CLIENT_SECRET`: (Optional, for Google Login).
3. **Build & Start Commands**:
   - Build Command: `npm run build`
   - Start Command: `npm run start`
4. **Persistent Disk (Optional but Recommended)**:
   - Add a Persistent Disk to your Web Service in Render.
   - Mount Path: `/uploads` (so that your user documents persist across server restarts).
   - Set environment variable: `UPLOADS_DIR="/uploads"`

---

## 4. Troubleshooting: Model Rate Limits & SQLite Citations Fix

### Gemini API Model Downgrade Fix
* **Problem**: When using direct Gemini API authentication, the codebase was automatically mapping/downgrading newer models like `gemini-3.5-flash` and `gemini-3.6-flash` to `gemini-2.0-flash`. The `gemini-2.0-flash` model has a `limit: 0` quota constraint on the current API key, which led to infinite `429 Rate Limit` retries and caused the chat to hang indefinitely at *"Searching your document..."*.
* **Fix**: Modified `cleanModelName` in [`src/lib/ai-gateway.server.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/ai-gateway.server.ts) to:
  1. Let modern/active models like `gemini-3.5-flash` and `gemini-3.6-flash` pass through as themselves natively.
  2. Map only older/unsupported models (like `gemini-1.5-flash`, `gemini-2.0-flash`, or `gemini-2.5-flash`) to the standard `gemini-3.5-flash` model.
* **Result**: Direct Gemini API key authentication works seamlessly, providing real-time streamed responses.

### SQLite JSONB Citations Rendering Fix
* **Problem**: In local SQLite fallback mode, SQLite returns `JSONB` columns (like `citations` in the `messages` table) as raw JSON text strings rather than parsed JavaScript arrays/objects. When the client loads the message history, React tries to execute `.map()` on the citations string, causing a frontend rendering crash (`TypeError: message.citations.map is not a function`).
* **Fix**:
  1. Updated the `listMessages` server function in [`src/lib/chats.functions.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/chats.functions.ts) to intercept the rows and run `JSON.parse` on the `citations` column if it is returned as a string.
  2. Updated the `MessageBubble` component in [`src/routes/_authenticated/chat.$documentId.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/_authenticated/chat.$documentId.tsx) to safely verify that `message.citations` is indeed a valid array (`Array.isArray(message.citations)`) before trying to map and render it.
* **Result**: Chat conversation view loads and renders history and citations successfully without any crashes.

### Dashboard Weekly Activity Chart Layout Fix
* **Problem**: The "This week" chart was completely empty (blank) because the bar divs inside the flex column had a height defined in percentage (`style={{ height: ...% }}`), but the parent element (`flex-col`) had no explicit height. In CSS, when a parent has an `auto` height that is determined by its children, a child's percentage height collapses to `0`. Additionally, when there was zero activity on a given day, it was rendering a tiny `4%` baseline highlight which looked like constant flatline activity even when no chats existed.
* **Fix**:
  1. Updated the layout structure in [`src/routes/_authenticated/dashboard.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/_authenticated/dashboard.tsx) to give the parent day columns `h-full flex flex-col justify-end items-center gap-2` (which forces them to occupy the full 160px height of the parent chart container).
  2. Wrapped each bar in a flex-growing container (`relative flex w-full flex-1 items-end`) that occupies all remaining vertical space above the date label, providing a stable, defined height for the child percentage height to resolve against.
  3. Fixed the date label parsing on the client by parsing the `YYYY-MM-DD` string in local time, preventing any timezone shift issues.
  4. Updated the height logic to dynamically set `0%` height (completely hiding the bar) when a day's message count is `0`, preventing misleading "baseline" indicators.
* **Result**: The activity chart renders beautifully and cleanly, displaying dynamic amber bars only for active days (e.g. today, Monday, displays a full-height bar, while other inactive days remain completely empty).


### Real-Time Document Deletion & Cascade Fixes
* **Problem**: Deleting a document from the Library did not update the global sidebar's `RECENT CHATS` list in real time. Additionally, in some SQLite configurations, deleting a document could leave orphaned database rows (e.g. conversations, messages, or chunks) if foreign keys were not explicitly enforced.
* **Fix**:
  1. Updated `deleteMut.onSuccess` in [`src/routes/_authenticated/library.tsx`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/_authenticated/library.tsx) to invalidate the `["recent-conversations"]` query cache, forcing the sidebar's recent chats to update instantly when a document is deleted.
  2. Modified [`src/lib/db.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/lib/db.ts) to explicitly execute `PRAGMA foreign_keys = ON;` upon SQLite database connection initialization.
* **Result**: Deleting documents instantly cleans up all dependent files and database rows, and updates the sidebar in real time.

---

## 4. Google Login and Startup Database Fixes (Render Hosting & Local)

### Database Timeout & Startup Fallback
* **Problem**: If `DATABASE_URL` is defined but PostgreSQL is unreachable (e.g. database paused, firewall block, or DNS resolution failure), the server initialization query (`CREATE EXTENSION`) timed out after a long block, completely crashing the application startup or causing subsequent requests to fail with a `500` route load error ("This page didn't load").
* **Fix**: 
  1. Configured the PostgreSQL pool with a `connectionTimeoutMillis: 3000` (3 seconds) limit.
  2. Wrapped startup database verification in a dynamic connection check. If PostgreSQL fails to connect within 3 seconds, it outputs the error and seamlessly falls back to the zero-config local SQLite database (`scholarmind.db`).
  3. Added sub-try/catch blocks around database extension queries (`CREATE EXTENSION IF NOT EXISTS`) so schema initialization doesn't abort if a cloud provider's permissions prevent superuser commands but the tables/extensions already exist.
* **Result**: The application starts up instantly and works correctly on SQLite when PostgreSQL is unreachable or not yet configured.

### Google Login Redirect URI Mismatch behind Reverse Proxies (Render)
* **Problem**: On Render, the application runs behind a reverse proxy forwarding requests to an internal port (e.g., `localhost:10000`). Standard `new URL(request.url)` on the server resolves the origin to the internal host (`http://localhost:10000`), which causes Google OAuth to reject the login request (due to redirect URI mismatch) or redirects the user to the unreachable internal port in their browser.
* **Fix**:
  1. Created a `getRequestOrigin` utility that checks `x-forwarded-host` and `x-forwarded-proto` headers before falling back to the standard URL host.
  2. Updated the origin construction in [`google.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/google.ts) and [`callback.ts`](file:///C:/Users/harip/OneDrive/Documents/learn-spark-11-main/learn-spark-11-main/src/routes/api/auth/google/callback.ts) to use this utility.
* **Result**: Google login automatically detects the public domain name (e.g. `https://scholarmind-ai.onrender.com`) and redirects seamlessly without any OAuth configuration mismatch.




