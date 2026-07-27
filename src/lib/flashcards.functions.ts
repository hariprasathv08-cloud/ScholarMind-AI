import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";
import { complete } from "./ai-gateway.server";

export const listFlashcards = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ documentId: z.string().uuid().optional().nullable() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      let query = `
        SELECT id, front, back, box, next_review, created_at, document_id
        FROM public.flashcards
        WHERE user_id = $1
      `;
      const params: any[] = [userId];

      if (data.documentId) {
        query += " AND document_id = $2";
        params.push(data.documentId);
      }

      query += " ORDER BY created_at DESC";
      const result = await db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error("[Flashcard Functions] List flashcards failed:", err);
      throw new Error("Failed to load flashcards");
    }
  });

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { documentId } = data;

    try {
      // 1. Fetch document chunks as context
      const chunksRes = await db.query(
        "SELECT content FROM public.document_chunks WHERE document_id = $1 AND user_id = $2 LIMIT 12",
        [documentId, userId]
      );
      if (chunksRes.rows.length === 0) throw new Error("Document has no text to generate flashcards from.");
      
      const contextText = chunksRes.rows.map(r => r.content).join("\n\n");

      // 2. Query Gemini
      const prompt = `Based on the following textbook content, generate a list of exactly 6 flashcards for study.
Each flashcard must have a concise question or term on the front and a concise, clear answer/definition on the back.

Textbook Content:
${contextText}

Return your response strictly as a JSON array of objects. Do not include markdown code block wrappers (like \`\`\`json). The response must be valid JSON only.
Each flashcard object MUST have the following structure:
{
  "front": "Question or Key Term",
  "back": "Answer, formula, explanation, or definition"
}`;

      console.log(`[Flashcard Generator] Creating cards for document: ${documentId}...`);
      const aiResponse = await complete([
        { role: "system", content: "You are a flashcard generator. You output raw JSON only." },
        { role: "user", content: prompt }
      ], "google/gemini-3.5-flash");

      const cleanedJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedCards = JSON.parse(cleanedJson) as Array<{ front: string; back: string }>;

      if (!Array.isArray(parsedCards) || parsedCards.length === 0) {
        throw new Error("Failed to generate a valid flashcard array.");
      }

      // 3. Save to database
      for (const card of parsedCards) {
        await db.query(
          `INSERT INTO public.flashcards (user_id, document_id, front, back)
           VALUES ($1, $2, $3, $4)`,
          [userId, documentId, card.front, card.back]
        );
      }

      console.log(`[Flashcard Generator] Successfully created ${parsedCards.length} flashcards.`);
      return { ok: true, count: parsedCards.length };
    } catch (err) {
      console.error("[Flashcard Functions] Generate flashcards failed:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to generate flashcards");
    }
  });

export const reviewFlashcard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (data: unknown) =>
      z
        .object({
          cardId: z.string().uuid(),
          correct: z.boolean(),
        })
        .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { cardId, correct } = data;

    try {
      // 1. Get current card state
      const cardRes = await db.query(
        "SELECT id, box FROM public.flashcards WHERE id = $1 AND user_id = $2",
        [cardId, userId]
      );
      if (cardRes.rows.length === 0) throw new Error("Card not found");
      const card = cardRes.rows[0];

      let newBox = 1;
      let reviewIntervalDays = 1; // Default next review: 1 day

      if (correct) {
        // Leitner spacing: Move to next box up to maximum of Box 5
        newBox = Math.min(card.box + 1, 5);
        // Calculate days to wait based on new box
        switch (newBox) {
          case 2:
            reviewIntervalDays = 3;
            break;
          case 3:
            reviewIntervalDays = 7;
            break;
          case 4:
            reviewIntervalDays = 14;
            break;
          case 5:
            reviewIntervalDays = 30;
            break;
          default:
            reviewIntervalDays = 1;
        }
      } else {
        // Incorrect answers reset to Box 1
        newBox = 1;
        reviewIntervalDays = 1;
      }

      // 2. Update card review time
      // For SQLite, we can set it to a future date in JS and pass it as text/timestamp
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + reviewIntervalDays);

      await db.query(
        `UPDATE public.flashcards 
         SET box = $1, next_review = $2 
         WHERE id = $3 AND user_id = $4`,
        [newBox, nextReviewDate.toISOString(), cardId, userId]
      );

      return { ok: true, nextReview: nextReviewDate.toISOString(), box: newBox };
    } catch (err) {
      console.error("[Flashcard Functions] Review flashcard failed:", err);
      throw new Error("Failed to submit review");
    }
  });

export const deleteFlashcard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ cardId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      await db.query("DELETE FROM public.flashcards WHERE id = $1 AND user_id = $2", [data.cardId, userId]);
      return { ok: true };
    } catch (err) {
      console.error("[Flashcard Functions] Delete flashcard failed:", err);
      throw new Error("Failed to delete card");
    }
  });
