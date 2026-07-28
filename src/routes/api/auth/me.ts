import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth-utils.server";

function parseCookie(cookieString: string | null, name: string): string | null {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let token = null;

        // Try Cookie first
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          token = parseCookie(cookieHeader, "auth_token");
        }

        // Try Authorization header
        if (!token) {
          const authHeader = request.headers.get("authorization");
          if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.replace("Bearer ", "");
          }
        }

        if (!token) {
          return new Response(JSON.stringify({ user: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const payload = await verifyToken(token);
        if (!payload) {
          return new Response(JSON.stringify({ user: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const userResult = await db.query(
            "SELECT id, email, display_name FROM public.users WHERE id = $1",
            [payload.userId]
          );

          if (userResult.rows.length === 0) {
            return new Response(JSON.stringify({ user: null }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const user = userResult.rows[0];
          return new Response(
            JSON.stringify({
              user: {
                id: user.id,
                email: user.email,
                user_metadata: {
                  full_name: user.display_name,
                },
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (err) {
          return new Response(JSON.stringify({ user: null, error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
