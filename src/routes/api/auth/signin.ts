import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db";
import { comparePassword, signToken, getSessionCookieHeader } from "@/lib/auth-utils.server";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const Route = createFileRoute("/api/auth/signin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          const email = body.email.toLowerCase().trim();

          // 1. Fetch user
          const userResult = await db.query(
            "SELECT id, email, password_hash, display_name FROM public.users WHERE email = $1",
            [email]
          );
          if (userResult.rows.length === 0) {
            return new Response(JSON.stringify({ error: "Invalid email or password" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const user = userResult.rows[0];

          // 2. Compare password
          const isValid = await comparePassword(body.password, user.password_hash);
          if (!isValid) {
            return new Response(JSON.stringify({ error: "Invalid email or password" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Issue token and set cookie
          const token = await signToken({ userId: user.id, email: user.email });

          return new Response(
            JSON.stringify({
              success: true,
              user: { id: user.id, email: user.email, name: user.display_name },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": getSessionCookieHeader(token),
              },
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
