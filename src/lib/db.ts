import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[Database] WARNING: DATABASE_URL is not set. Database operations will fail.");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false }, // Render PostgreSQL usually requires SSL
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

// Bootstrap function to initialize schema
export async function initDb() {
  console.log("[Database] Initializing schema...");
  try {
    // 1. Enable extensions
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // 2. Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 3. Profiles Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        display_name TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 4. Documents Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        page_count INT,
        status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | ready | failed
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 5. Document Chunks Table (using vector(3072) for gemini-embedding-2)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.document_chunks (
        id BIGSERIAL PRIMARY KEY,
        document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        chunk_index INT NOT NULL,
        page INT,
        content TEXT NOT NULL,
        embedding VECTOR(3072),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 6. Conversations Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New chat',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 7. Messages Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        citations JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 8. Indexes (using standard btree since HNSW can fail if tables are not fully ready or if pgvector syntax varies)
    await db.query(`CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON public.document_chunks(document_id, chunk_index)`);
    await db.query(`CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations(user_id, updated_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages(conversation_id, created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS documents_user_created_idx ON public.documents(user_id, created_at DESC)`);

    console.log("[Database] Schema initialized successfully!");
  } catch (error) {
    console.error("[Database] Error during schema initialization:", error);
  }
}

// Automatically bootstrap database on start
if (connectionString) {
  initDb();
}
