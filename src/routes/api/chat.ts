import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth-utils.server";
import { embed, streamChat, toVectorLiteral, complete, type ChatMessage } from "@/lib/ai-gateway.server";

const bodySchema = z.object({
  documentId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(4000),
});

function parseCookie(cookieString: string | null, name: string): string | null {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Authenticate user from cookie or authorization header
        let token = null;
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          token = parseCookie(cookieHeader, "auth_token");
        }
        if (!token) {
          const authHeader = request.headers.get("authorization");
          if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.replace("Bearer ", "");
          }
        }

        if (!token) return new Response("Unauthorized", { status: 401 });

        const payloadToken = await verifyToken(token);
        if (!payloadToken) return new Response("Unauthorized", { status: 401 });
        const userId = payloadToken.userId;

        let payload: z.infer<typeof bodySchema>;
        try {
          payload = bodySchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        try {
          // 2. Verify document ownership + readiness
          const docResult = await db.query(
            "SELECT id, title, status FROM public.documents WHERE id = $1 AND user_id = $2",
            [payload.documentId, userId]
          );
          if (docResult.rows.length === 0) return new Response("Document not found", { status: 404 });
          const doc = docResult.rows[0];
          if (doc.status !== "ready") return new Response("Document not ready", { status: 409 });

          // 3. Ensure conversation exists
          let conversationId = payload.conversationId ?? null;
          if (!conversationId) {
            const title = payload.message.slice(0, 60);
            const convResult = await db.query(
              `INSERT INTO public.conversations (user_id, document_id, title)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [userId, doc.id, title]
            );
            conversationId = convResult.rows[0].id;
          } else {
            await db.query(
              "UPDATE public.conversations SET updated_at = NOW() WHERE id = $1 AND user_id = $2",
              [conversationId, userId]
            );
          }

          // 4. Load prior turns (last 20)
          const historyResult = await db.query(
            `SELECT role, content
             FROM public.messages
             WHERE conversation_id = $1 AND user_id = $2
             ORDER BY created_at ASC
             LIMIT 20`,
            [conversationId, userId]
          );
          const history = historyResult.rows;

          // 5. Persist user message
          await db.query(
            `INSERT INTO public.messages (conversation_id, user_id, role, content)
             VALUES ($1, $2, $3, $4)`,
            [conversationId, userId, "user", payload.message]
          );

          // 6. Embed the question and retrieve relevant chunks
          const [qVec] = await embed([payload.message]);
          const matchesResult = await db.query(
            `SELECT c.id, c.document_id, c.chunk_index, c.page, c.content,
                    1 - (c.embedding <=> $1::vector) as similarity
             FROM public.document_chunks c
             WHERE c.document_id = $2 AND c.user_id = $3
               AND c.embedding IS NOT NULL
             ORDER BY c.embedding <=> $1::vector
             LIMIT $4`,
            [toVectorLiteral(qVec), doc.id, userId, 6]
          );
          const chunks = matchesResult.rows ?? [];
          const citations = chunks.map((c) => ({ page: c.page ?? 1, chunk_index: c.chunk_index }));

          const contextBlock = chunks.length
            ? chunks
                .map((c, i) => `[Excerpt ${i + 1} · page ${c.page ?? "?"}]\n${c.content}`)
                .join("\n\n---\n\n")
            : "(no relevant excerpts found)";

          const systemPrompt = `You are ScholarMind AI, a friendly, professional, educational, patient, and concise AI learning companion. Answer the user's question using ONLY the excerpts below from the document "${doc.title}".

STRICT RULES:
- If the answer is not in the excerpts, reply exactly: "I couldn't find this information in your uploaded documents."
- Do not invent facts, page numbers, or citations.
- Format responses with clear structure using markdown: headings, bullet lists, tables, and code blocks where useful. Use LaTeX ($...$ inline, $$...$$ block) for math.
- Refer to excerpts naturally (e.g. "According to page 12…"). Do not list a bibliography.
- Keep answers concise but complete. If the question asks for a summary, give one.

EXCERPTS FROM THE DOCUMENT:
${contextBlock}`;

          const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user", content: payload.message },
          ];

          // 7. Stream response back to client
          const encoder = new TextEncoder();
          let assistantText = "";
          const stream = new ReadableStream({
            async start(controller) {
              const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              try {
                send({ type: "citations", citations });
                for await (const delta of streamChat(messages)) {
                  assistantText += delta;
                  send({ type: "delta", text: delta });
                }
                send({ type: "done" });
                controller.close();

                // 8. Persist assistant message
                await db.query(
                  `INSERT INTO public.messages (conversation_id, user_id, role, content, citations)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [conversationId, userId, "assistant", assistantText, JSON.stringify(citations)]
                );

                // Auto-title if first exchange
                if (!payload.conversationId) {
                  try {
                    const title = (await complete(
                      [
                        { role: "system", content: "Return a 4-6 word title for this chat. Plain text, no quotes." },
                        { role: "user", content: `Q: ${payload.message}\nA: ${assistantText.slice(0, 400)}` },
                      ],
                      "google/gemini-3.6-flash",
                    )).replace(/["\n]/g, "").trim().slice(0, 80);
                    
                    if (title) {
                      await db.query(
                        "UPDATE public.conversations SET title = $1 WHERE id = $2",
                        [title, conversationId]
                      );
                    }
                  } catch { /* ignore titling errors */ }
                }
              } catch (err) {
                let msg = err instanceof Error ? err.message : "Stream error";
                if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("exhausted")) {
                  msg = "ScholarMind AI is experiencing high traffic. Please wait a few seconds and try again.";
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "x-conversation-id": conversationId!,
              "Access-Control-Expose-Headers": "x-conversation-id",
            },
          });
        } catch (err) {
          console.error("[Chat API] Chat process failed:", err);
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
