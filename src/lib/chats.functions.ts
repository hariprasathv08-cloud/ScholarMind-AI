import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";

export const listRecentConversations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT id, title, updated_at, document_id
         FROM public.conversations
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT 8`,
        [userId]
      );
      return result.rows;
    } catch (err) {
      console.error("[chats.functions] Failed to list conversations:", err);
      throw new Error("Failed to load conversations");
    }
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT id, role, content, citations
         FROM public.messages
         WHERE conversation_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [data.conversationId, userId]
      );
      return result.rows.map((row) => {
        if (typeof row.citations === "string") {
          try {
            row.citations = JSON.parse(row.citations);
          } catch {
            row.citations = null;
          }
        }
        return row;
      });
    } catch (err) {
      console.error("[chats.functions] Failed to list messages:", err);
      throw new Error("Failed to load message history");
    }
  });
