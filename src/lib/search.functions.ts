import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ query: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const q = `%${data.query.toLowerCase().trim()}%`;
    
    try {
      // 1. Search documents
      const docsRes = await db.query(
        `SELECT id, title, mime_type, created_at 
         FROM public.documents 
         WHERE user_id = $1 AND LOWER(title) LIKE $2
         ORDER BY created_at DESC`,
        [userId, q]
      );
      
      // 2. Search chats (conversations)
      const chatsRes = await db.query(
        `SELECT id, title, document_id, updated_at 
         FROM public.conversations 
         WHERE user_id = $1 AND LOWER(title) LIKE $2
         ORDER BY updated_at DESC`,
        [userId, q]
      );
      
      // 3. Search flashcards
      const cardsRes = await db.query(
        `SELECT id, front, back, document_id, created_at 
         FROM public.flashcards 
         WHERE user_id = $1 AND (LOWER(front) LIKE $2 OR LOWER(back) LIKE $2)
         ORDER BY created_at DESC`,
        [userId, q]
      );
      
      return {
        documents: docsRes.rows,
        chats: chatsRes.rows,
        flashcards: cardsRes.rows
      };
    } catch (err) {
      console.error("[Search Functions] Global search failed:", err);
      throw new Error("Search failed");
    }
  });
