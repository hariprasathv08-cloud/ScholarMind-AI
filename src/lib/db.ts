const connectionString = process.env.DATABASE_URL;
const isLocalPg = !connectionString || connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

let usePg = false;
let pgPool: any = null;
let sqliteDb: any = null;

async function getPgPool() {
  if (pgPool) return pgPool;
  if (connectionString && !isLocalPg) {
    try {
      const pg = await import("pg").then(m => m.default || m);
      pgPool = new pg.Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }, // Render PostgreSQL usually requires SSL
        connectionTimeoutMillis: 3000,      // Fail fast (3 seconds) if database is unreachable
      });
      console.log("[Database] Remote PostgreSQL pool initialized.");
    } catch (err) {
      console.error("[Database] Failed to initialize PostgreSQL pool:", err);
    }
  }
  return pgPool;
}

async function initSQLite() {
  if (sqliteDb) return;
  try {
    const path = await import("node:path").then(m => m.default || m);
    const dbPath = process.env.SQLITE_DB_PATH
      ? path.resolve(process.env.SQLITE_DB_PATH)
      : path.resolve(process.cwd(), "scholarmind.db");
    console.log(`[Database] Connecting to SQLite database at: ${dbPath}`);
    const { DatabaseSync } = await import("node:sqlite");
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec("PRAGMA foreign_keys = ON;");
  } catch (err) {
    console.error("[Database] Failed to initialize SQLite database:", err);
  }
}

export const pool = {
  query: async (text: string, params?: any[]) => {
    if (usePg) {
      const pool = await getPgPool();
      if (pool) return pool.query(text, params);
    }
    return db.query(text, params);
  },
  connect: async () => {
    const pool = await getPgPool();
    if (usePg && pool) {
      return pool.connect();
    }
    throw new Error("PostgreSQL pool is disabled in SQLite fallback mode.");
  },
  end: async () => {
    const pool = await getPgPool();
    if (pool) {
      await pool.end().catch(() => {});
    }
  },
} as any;

function translateSql(sql: string): string {
  let s = sql;
  // 1. Remove schemas like "public." or "public.tablename"
  s = s.replace(/\bpublic\./g, "");
  
  // 2. Replace NOW() with strftime ISO UTC timestamp
  s = s.replace(/\bNOW\(\)/gi, "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))");
  
  // 3. Replace Postgres type casts like "::vector" or "::uuid" or "::text"
  s = s.replace(/::[a-zA-Z0-9_]+/g, "");
  
  // 4. Map parameter placeholders from $1, $2 to ?1, ?2
  s = s.replace(/\$(\d+)/g, "?$1");
  
  // 5. If it's a table creation query, map Postgres types and UUID default
  if (/CREATE\s+TABLE/i.test(s)) {
    s = s.replace(
      /\bUUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/gi,
      `TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || 
        lower(hex(randomblob(2))) || '-' || 
        '4' || substr(lower(hex(randomblob(2))), 2, 3) || '-' || 
        substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2, 3) || '-' || 
        lower(hex(randomblob(6)))
      )`
    );
    s = s.replace(/\bREFERENCES\s+public\.(\w+)/gi, "REFERENCES $1");
    s = s.replace(/\bUUID\b/gi, "TEXT");
    s = s.replace(/\bBIGSERIAL\s+PRIMARY\s+KEY\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");
    s = s.replace(/\bTIMESTAMPTZ\b/gi, "DATETIME");
    s = s.replace(/\bVARCHAR\(\d+\)/gi, "TEXT");
    s = s.replace(/\bJSONB\b/gi, "TEXT");
    s = s.replace(/\bVECTOR\(\d+\)/gi, "TEXT");
  }
  
  return s;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let initPromise: Promise<void> | null = null;

async function checkConnection() {
  const pool = await getPgPool();
  if (pool) {
    try {
      console.log("[Database] Testing connection to remote PostgreSQL...");
      const client = await pool.connect();
      client.release();
      usePg = true;
      console.log("[Database] Successfully connected to remote PostgreSQL. Using remote database.");
    } catch (err) {
      console.error("[Database] Failed to connect to PostgreSQL, falling back to SQLite:", err);
      usePg = false;
      if (pgPool) {
        await pgPool.end().catch(() => {});
        pgPool = null;
      }
    }
  }

  if (!usePg) {
    await initSQLite();
  }
}

export const db = {
  query: async (text: string, params: any[] = []): Promise<{ rows: any[] }> => {
    if (!initPromise) {
      initDb();
    }
    await initPromise;

    if (usePg) {
      const pool = await getPgPool();
      if (pool) return pool.query(text, params);
    }
    
    if (!sqliteDb) {
      await initSQLite();
    }
    if (!sqliteDb) throw new Error("SQLite DB is not initialized");
    
    // Check if it's the vector search query
    if (text.includes("c.embedding") && text.includes("<=>")) {
      let queryVec: number[] = [];
      try {
        const vecStr = params[0];
        queryVec = JSON.parse(vecStr);
      } catch (err) {
        console.error("[Database] Error parsing query vector:", err);
      }
      
      const docId = params[1];
      const userId = params[2];
      const limit = params[3] || 6;
      
      // Get all chunks for this doc
      const sql = `
        SELECT id, document_id, chunk_index, page, content, embedding
        FROM document_chunks
        WHERE document_id = ?1 AND user_id = ?2 AND embedding IS NOT NULL
      `;
      const stmt = sqliteDb.prepare(sql);
      const rows = stmt.all(docId, userId) as any[];
      
      // Calculate similarity in JS
      const scored = rows.map((row) => {
        let rowVec: number[] = [];
        try {
          rowVec = JSON.parse(row.embedding);
        } catch {
          if (Array.isArray(row.embedding)) {
            rowVec = row.embedding;
          }
        }
        const similarity = cosineSimilarity(queryVec, rowVec);
        return {
          id: row.id,
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          page: row.page,
          content: row.content,
          similarity: similarity,
        };
      });
      
      // Sort descending by similarity
      scored.sort((a, b) => b.similarity - a.similarity);
      return { rows: scored.slice(0, limit) };
    }
    
    // Check if it's an extension creation statement
    if (text.includes("CREATE EXTENSION")) {
      return { rows: [] };
    }
    
    const translated = translateSql(text);
    
    try {
      if (/CREATE\s+(TABLE|INDEX)/i.test(translated)) {
        sqliteDb.exec(translated);
        return { rows: [] };
      }
      
      const stmt = sqliteDb.prepare(translated);
      const rows = stmt.all(...params);
      
      // Convert to clean standard JS objects
      const mappedRows = rows.map((row: any) => {
        const newRow: any = {};
        for (const key of Object.keys(row)) {
          newRow[key] = row[key];
        }
        return newRow;
      });
      
      return { rows: mappedRows };
    } catch (err) {
      console.error(`[Database] SQLite error on query:\n${translated}\nError:`, err);
      throw err;
    }
  }
};

// Bootstrap function to initialize schema
export async function initDb() {
  if (initPromise) return initPromise;
  
  initPromise = checkConnection();
  await initPromise;

  console.log("[Database] Initializing schema...");
  try {
    // 1. Enable extensions (safely ignore errors if extensions exist but user lacks superuser permissions)
    try {
      await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    } catch (extErr) {
      console.warn("[Database] Warning: Could not run CREATE EXTENSION uuid-ossp (might already exist):", extErr);
    }
    try {
      await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (extErr) {
      console.warn("[Database] Warning: Could not run CREATE EXTENSION vector (might already exist):", extErr);
    }

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

    // 8. Indexes
    await db.query(`CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON public.document_chunks(document_id, chunk_index)`);
    await db.query(`CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations(user_id, updated_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages(conversation_id, created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS documents_user_created_idx ON public.documents(user_id, created_at DESC)`);

    // 9. Quizzes Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.quizzes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        score INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 10. Quiz Questions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.quiz_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_option_index INT NOT NULL,
        user_answer_index INT,
        explanation TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 11. Flashcards Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.flashcards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        box INT NOT NULL DEFAULT 1,
        next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 12. Study Plans Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.study_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        exam_date TEXT NOT NULL,
        available_hours INT NOT NULL,
        subjects TEXT NOT NULL,
        weak_topics TEXT NOT NULL,
        plan_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS quizzes_user_idx ON public.quizzes(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS flashcards_user_idx ON public.flashcards(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS study_plans_user_idx ON public.study_plans(user_id)`);

    console.log("[Database] Schema initialized successfully!");
  } catch (error) {
    console.error("[Database] Error during schema initialization:", error);
  }
}

// Automatically bootstrap database on start (triggered lazily on first query)

