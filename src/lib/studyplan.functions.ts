import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { db } from "./db";
import { z } from "zod";
import { complete } from "./ai-gateway.server";

export const getStudyPlan = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      const result = await db.query(
        `SELECT id, exam_date, available_hours, subjects, weak_topics, plan_data, created_at 
         FROM public.study_plans 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );
      if (result.rows.length === 0) return null;
      
      const plan = result.rows[0];
      let planData = null;
      try {
        planData = typeof plan.plan_data === "string" ? JSON.parse(plan.plan_data) : plan.plan_data;
      } catch {
        planData = plan.plan_data;
      }
      
      return {
        ...plan,
        plan_data: planData,
      };
    } catch (err) {
      console.error("[Study Plan Functions] Get study plan failed:", err);
      throw new Error("Failed to load study plan");
    }
  });

export const generateStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (data: unknown) =>
      z
        .object({
          examDate: z.string(),
          availableHours: z.number().int().min(1),
          subjects: z.string(),
          weakTopics: z.string(),
        })
        .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { examDate, availableHours, subjects, weakTopics } = data;

    try {
      const prompt = `Create a highly structured, personalized study plan preparing for an exam.
      
Parameters:
- Exam Date: ${examDate}
- Study Hours Available: ${availableHours} hours per week
- Subjects: ${subjects}
- Weak Topics: ${weakTopics}

Design a clear, prioritized study schedule divided into distinct tasks (at least 6-8 tasks leading up to the exam).
Focus extra attention on the specified weak topics!

Return your response strictly as a JSON object. Do not include markdown code block wrappers (like \`\`\`json). The response must be valid JSON only.
Structure the JSON object as follows:
{
  "title": "Exam Prep Study Plan",
  "tasks": [
    {
      "id": "1", // a unique string ID
      "phase": "Week 1: Fundamentals", // name of week or stage
      "topic": "Topic Name",
      "hoursAllocated": 4,
      "details": "What specifically to study, practice, and read.",
      "completed": false
    }
  ]
}`;

      console.log(`[Study Plan] Generating personalized study plan for subjects: ${subjects}...`);
      const aiResponse = await complete([
        { role: "system", content: "You are an academic planner. You output raw JSON only." },
        { role: "user", content: prompt }
      ], "google/gemini-3.5-flash");

      const cleanedJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      const planData = JSON.parse(cleanedJson);

      if (!planData || !Array.isArray(planData.tasks)) {
        throw new Error("Failed to generate a valid study plan task list.");
      }

      // Save to database
      const result = await db.query(
        `INSERT INTO public.study_plans (user_id, exam_date, available_hours, subjects, weak_topics, plan_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, examDate, availableHours, subjects, weakTopics, JSON.stringify(planData)]
      );

      console.log(`[Study Plan] Successfully generated plan with ID: ${result.rows[0].id}`);
      return { id: result.rows[0].id };
    } catch (err) {
      console.error("[Study Plan Functions] Generate plan failed:", err);
      throw new Error(err instanceof Error ? err.message : "Failed to generate study plan");
    }
  });

export const updateTaskCompletion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (data: unknown) =>
      z
        .object({
          planId: z.string().uuid(),
          taskId: z.string(),
          completed: z.boolean(),
        })
        .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { planId, taskId, completed } = data;

    try {
      const planRes = await db.query(
        "SELECT plan_data FROM public.study_plans WHERE id = $1 AND user_id = $2",
        [planId, userId]
      );
      if (planRes.rows.length === 0) throw new Error("Plan not found");
      
      const plan = planRes.rows[0];
      let planData: any = null;
      try {
        planData = typeof plan.plan_data === "string" ? JSON.parse(plan.plan_data) : plan.plan_data;
      } catch {
        planData = plan.plan_data;
      }

      if (!planData || !Array.isArray(planData.tasks)) {
        throw new Error("Plan data is corrupt or invalid.");
      }

      // Update completion flag of selected task
      planData.tasks = planData.tasks.map((task: any) => {
        if (task.id === taskId) {
          return { ...task, completed };
        }
        return task;
      });

      await db.query(
        "UPDATE public.study_plans SET plan_data = $1 WHERE id = $2 AND user_id = $3",
        [JSON.stringify(planData), planId, userId]
      );

      return { ok: true };
    } catch (err) {
      console.error("[Study Plan Functions] Toggle task completion failed:", err);
      throw new Error("Failed to update task status");
    }
  });
