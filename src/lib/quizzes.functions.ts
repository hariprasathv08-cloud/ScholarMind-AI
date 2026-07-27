import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";
import { complete } from "./ai-gateway.server";

export const listQuizzes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT q.id, q.title, q.score, q.created_at, d.title as document_title
         FROM public.quizzes q
         LEFT JOIN public.documents d ON q.document_id = d.id
         WHERE q.user_id = $1
         ORDER BY q.created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (err) {
      console.error("[Quiz Functions] List quizzes failed:", err);
      throw new Error("Failed to list quizzes");
    }
  });

export const getQuiz = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      const quizRes = await db.query(
        `SELECT id, title, score, document_id FROM public.quizzes WHERE id = $1 AND user_id = $2`,
        [data.id, userId]
      );
      if (quizRes.rows.length === 0) throw new Error("Quiz not found");
      const quiz = quizRes.rows[0];

      const questionsRes = await db.query(
        `SELECT id, question, options, correct_option_index, user_answer_index, explanation 
         FROM public.quiz_questions 
         WHERE quiz_id = $1
         ORDER BY created_at ASC`,
        [quiz.id]
      );

      // Parse options JSON
      const questions = questionsRes.rows.map((q) => {
        let opts = [];
        try {
          opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
        } catch {
          opts = q.options;
        }
        return {
          ...q,
          options: opts,
        };
      });

      return {
        ...quiz,
        questions,
      };
    } catch (err) {
      console.error("[Quiz Functions] Get quiz failed:", err);
      throw new Error("Failed to load quiz");
    }
  });

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { documentId } = data;

    try {
      // 1. Fetch document title
      const docRes = await db.query(
        "SELECT title FROM public.documents WHERE id = $1 AND user_id = $2",
        [documentId, userId]
      );
      if (docRes.rows.length === 0) throw new Error("Document not found");
      const docTitle = docRes.rows[0].title;

      // 2. Fetch document chunks to use as context
      const chunksRes = await db.query(
        "SELECT content FROM public.document_chunks WHERE document_id = $1 AND user_id = $2 LIMIT 12",
        [documentId, userId]
      );
      if (chunksRes.rows.length === 0) throw new Error("Document has no text to generate a quiz from.");
      
      const contextText = chunksRes.rows.map(r => r.content).join("\n\n");

      // 3. Request Gemini to construct questions
      const prompt = `You are a professional academic quiz generator. Based on the following textbook content, generate a multiple-choice quiz.
Generate exactly 5 distinct multiple-choice questions that test understanding of the key concepts in the text.

Textbook Content:
${contextText}

Return your response strictly as a JSON array of objects. Do not include markdown code block wrappers (like \`\`\`json). The response must be valid JSON only.
Each question object MUST have the following structure:
{
  "question": "The question statement here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_option_index": 0, // index of correct option in options array (0 to 3)
  "explanation": "A short, helpful explanation of why this option is correct."
}`;

      console.log(`[Quiz Generator] Creating quiz for: ${docTitle}...`);
      const aiResponse = await complete([
        { role: "system", content: "You are a quiz builder. You output raw JSON only." },
        { role: "user", content: prompt }
      ], "google/gemini-3.5-flash");

      // Clean up markdown blocks if any
      const cleanedJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedQuestions = JSON.parse(cleanedJson) as Array<{
        question: string;
        options: string[];
        correct_option_index: number;
        explanation: string;
      }>;

      if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
        throw new Error("Failed to generate a valid quiz array.");
      }

      // 4. Create Quiz in Database
      const quizRes = await db.query(
        `INSERT INTO public.quizzes (user_id, document_id, title)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, documentId, `Quiz: ${docTitle}`]
      );
      const quizId = quizRes.rows[0].id;

      // 5. Create Questions
      for (const q of parsedQuestions) {
        await db.query(
          `INSERT INTO public.quiz_questions (quiz_id, question, options, correct_option_index, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            quizId,
            q.question,
            JSON.stringify(q.options),
            q.correct_option_index,
            q.explanation
          ]
        );
      }

      console.log(`[Quiz Generator] Quiz generated successfully! ID: ${quizId}`);
      return { id: quizId };
    } catch (err) {
      console.error("[Quiz Functions] Generate quiz failed:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to generate quiz");
    }
  });

export const submitQuizAnswers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (data: unknown) =>
      z
        .object({
          quizId: z.string().uuid(),
          answers: z.array(
            z.object({
              questionId: z.string().uuid(),
              answerIndex: z.number().int().min(0).max(3),
            })
          ),
        })
        .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { quizId, answers } = data;

    try {
      // Get correct answers
      const questionsRes = await db.query(
        "SELECT id, correct_option_index FROM public.quiz_questions WHERE quiz_id = $1",
        [quizId]
      );
      const questionsMap = new Map(
        questionsRes.rows.map((q) => [q.id, q.correct_option_index])
      );

      let correctCount = 0;
      // 1. Save user answers
      for (const ans of answers) {
        const correctIndex = questionsMap.get(ans.questionId);
        if (correctIndex === ans.answerIndex) {
          correctCount++;
        }
        await db.query(
          "UPDATE public.quiz_questions SET user_answer_index = $1 WHERE id = $2 AND quiz_id = $3",
          [ans.answerIndex, ans.questionId, quizId]
        );
      }

      const score = Math.round((correctCount / questionsMap.size) * 100);

      // 2. Save final score
      await db.query(
        "UPDATE public.quizzes SET score = $1 WHERE id = $2 AND user_id = $3",
        [score, quizId, userId]
      );

      return { score, correctCount, total: questionsMap.size };
    } catch (err) {
      console.error("[Quiz Functions] Submit quiz failed:", err);
      throw new Error("Failed to submit answers");
    }
  });
