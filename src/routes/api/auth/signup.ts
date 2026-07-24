import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth-utils.server";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          const email = body.email.toLowerCase().trim();

          // 1. Check if user exists
          const existing = await db.query("SELECT id FROM public.users WHERE email = $1", [email]);
          if (existing.rows.length > 0) {
            return new Response(JSON.stringify({ error: "Email already registered" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Hash password and insert user
          const pwdHash = await hashPassword(body.password);
          const userResult = await db.query(
            `INSERT INTO public.users (email, password_hash, display_name)
             VALUES ($1, $2, $3)
             RETURNING id, email, display_name`,
            [email, pwdHash, body.name || email.split("@")[0]]
          );
          const user = userResult.rows[0];

          // 3. Create profile
          await db.query(
            `INSERT INTO public.profiles (id, display_name)
             VALUES ($1, $2)`,
            [user.id, user.display_name]
          );

          // 4. Issue token and set cookie
          const token = signToken({ userId: user.id, email: user.email });

          return new Response(
            JSON.stringify({
              success: true,
              user: { id: user.id, email: user.email, name: user.display_name },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
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
