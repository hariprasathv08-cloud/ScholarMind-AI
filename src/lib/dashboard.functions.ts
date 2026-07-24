import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-utils.server";
import { db } from "./db";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const [docsResult, chatsResult, messagesResult, chunksResult] = await Promise.all([
        db.query(
          `SELECT id, title, status, page_count, created_at
           FROM public.documents
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId]
        ),
        db.query(
          `SELECT id, title, document_id, updated_at
           FROM public.conversations
           WHERE user_id = $1
           ORDER BY updated_at DESC
           LIMIT 5`,
          [userId]
        ),
        db.query(
          `SELECT id, created_at
           FROM public.messages
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 30`,
          [userId]
        ),
        db.query(
          `SELECT COUNT(id)::int as count
           FROM public.document_chunks
           WHERE user_id = $1`,
          [userId]
        ),
      ]);

      const docsList = docsResult.rows;
      const recentChats = chatsResult.rows;
      const messagesList = messagesResult.rows;
      const totalChunks = chunksResult.rows[0]?.count ?? 0;

      // Calculate weekly activity
      const activity: Record<string, number> = {};
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        activity[d.toISOString().slice(0, 10)] = 0;
      }
      for (const m of messagesList) {
        const key = new Date(m.created_at).toISOString().slice(0, 10);
        if (key in activity) activity[key]++;
      }

      return {
        totals: {
          documents: docsList.length,
          ready: docsList.filter((d) => d.status === "ready").length,
          pages: docsList.reduce((s, d) => s + (d.page_count ?? 0), 0),
          chunks: totalChunks,
        },
        recentDocuments: docsList.slice(0, 5),
        recentChats,
        weeklyActivity: Object.entries(activity).map(([date, count]) => ({ date, count })),
      };
    } catch (err) {
      console.error("[dashboard.functions] Failed to load dashboard stats:", err);
      throw new Error("Failed to load dashboard stats");
    }
  });
