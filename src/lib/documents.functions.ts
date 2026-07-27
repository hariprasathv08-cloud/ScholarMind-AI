import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";
import fs from "fs";
import path from "path";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
]);

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT id, title, mime_type, size_bytes, page_count, status, error, created_at
         FROM public.documents
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (err) {
      console.error("[documents.functions] Failed to list documents:", err);
      throw new Error("Failed to load documents");
    }
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT id, title, mime_type, size_bytes, page_count, status, error, created_at
         FROM public.documents
         WHERE id = $1 AND user_id = $2`,
        [data.id, userId]
      );
      if (result.rows.length === 0) throw new Error("Document not found");
      return result.rows[0];
    } catch (err) {
      console.error("[documents.functions] Failed to get document:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to load document");
    }
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      // 1. Fetch storage path
      const docResult = await db.query(
        "SELECT storage_path FROM public.documents WHERE id = $1 AND user_id = $2",
        [data.id, userId]
      );
      if (docResult.rows.length === 0) throw new Error("Document not found");
      const doc = docResult.rows[0];

      // 2. Delete local file
      if (doc.storage_path) {
        const fullPath = path.join(process.cwd(), "uploads", doc.storage_path);
        try {
          if (fs.existsSync(fullPath)) {
            await fs.promises.unlink(fullPath);
          }
        } catch (e) {
          console.warn("[documents.functions] Failed to delete local file:", e);
        }
      }

      // 3. Delete from DB (cascade deletes conversations, messages, and chunks)
      await db.query("DELETE FROM public.documents WHERE id = $1 AND user_id = $2", [data.id, userId]);

      return { ok: true };
    } catch (err) {
      console.error("[documents.functions] Failed to delete document:", err);
      throw new Error("Failed to delete document");
    }
  });

/**
 * Background parsing job for large documents to prevent request timeouts.
 */
async function runProcessingInBackground(docId: string, userId: string) {
  try {
    const docResult = await db.query(
      "SELECT id, storage_path, mime_type, title, size_bytes FROM public.documents WHERE id = $1 AND user_id = $2",
      [docId, userId]
    );
    if (docResult.rows.length === 0) throw new Error("Document not found");
    const doc = docResult.rows[0];

    const fullPath = path.join(process.cwd(), "uploads", doc.storage_path);
    const buffer = await fs.promises.readFile(fullPath);
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const { parseDocument, chunkPages } = await import("./documents.server");
    const { embed, toVectorLiteral } = await import("./ai-gateway.server");

    console.log(`[Document Processor] Starting background parse for: ${doc.title} (${docId})`);
    const pages = await parseDocument(bytes, doc.mime_type, doc.title);
    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new Error("No readable text found in the document");

    await db.query("DELETE FROM public.document_chunks WHERE document_id = $1", [doc.id]);

    const BATCH = 512;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vectors = await embed(slice.map((c) => c.content));
      
      for (let k = 0; k < slice.length; k++) {
        const c = slice[k];
        const vecStr = toVectorLiteral(vectors[k]);
        
        await db.query(
          `INSERT INTO public.document_chunks (document_id, user_id, chunk_index, page, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6::vector)`,
          [doc.id, userId, c.index, c.page, c.content, vecStr]
        );
      }
    }

    await db.query(
      "UPDATE public.documents SET status = $1, page_count = $2, error = $3 WHERE id = $4",
      ["ready", pages.length, null, doc.id]
    );
    console.log(`[Document Processor] Background parse completed for: ${doc.title}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Document Processor] Background parse failed:", err);
    await db.query(
      "UPDATE public.documents SET status = $1, error = $2 WHERE id = $3",
      ["failed", message, docId]
    );
  }
}

/**
 * Parses, chunks, embeds, and stores everything in the local PostgreSQL or SQLite instance.
 */
export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      // 1. Retrieve document metadata
      const docResult = await db.query(
        "SELECT id, storage_path, mime_type, title, size_bytes FROM public.documents WHERE id = $1 AND user_id = $2",
        [data.id, userId]
      );
      if (docResult.rows.length === 0) throw new Error("Document not found");
      const doc = docResult.rows[0];

      if (doc.size_bytes > MAX_BYTES) throw new Error("File exceeds 25 MB limit");
      if (!ALLOWED.has(doc.mime_type)) throw new Error(`Unsupported file type: ${doc.mime_type}`);

      // Update status to processing
      await db.query("UPDATE public.documents SET status = $1, error = $2 WHERE id = $3", ["processing", null, doc.id]);

      // Fire and forget background parsing job
      runProcessingInBackground(doc.id, userId);

      return { ok: true, status: "processing" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[documents.functions] Failed to initiate processDocument:", err);
      
      // Update status to failed
      await db.query(
        "UPDATE public.documents SET status = $1, error = $2 WHERE id = $3",
        ["failed", message, data.id]
      );
      throw new Error(message);
    }
  });
