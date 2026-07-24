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
