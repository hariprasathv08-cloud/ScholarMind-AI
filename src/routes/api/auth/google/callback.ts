import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { signToken } from "@/lib/auth-utils.server";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing authorization code", { status: 400 });
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const origin = url.origin;
        const redirectUri = `${origin}/api/auth/google/callback`;

        try {
          let email = "";
          let name = "Developer User";
          let picture = "https://api.dicebear.com/7.x/avataaars/svg?seed=developer";

          if (code === "mock-dev-google-code" || !clientId) {
            email = (url.searchParams.get("email") || "developer@example.com").toLowerCase().trim();
            name = email.split("@")[0];
          } else {
            // 1. Exchange authorization code for access token
            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                code,
                client_id: clientId || "",
                client_secret: clientSecret || "",
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
              }),
            });
            
            if (!tokenRes.ok) {
              const text = await tokenRes.text();
              throw new Error(`Token exchange failed: ${text}`);
            }
            const tokens = (await tokenRes.json()) as { access_token: string };

            // 2. Fetch user information from Google API
            const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (!userRes.ok) throw new Error("Failed to fetch user info from Google");
            const googleUser = (await userRes.json()) as {
              email: string;
              name?: string;
              picture?: string;
            };
            email = googleUser.email.toLowerCase().trim();
            name = googleUser.name || email.split("@")[0];
            picture = googleUser.picture || picture;
          }

          // 3. Find or create user in PostgreSQL
          let userResult = await db.query(
            "SELECT id, email, display_name FROM public.users WHERE email = $1",
            [email]
          );
          
          let user;
          if (userResult.rows.length === 0) {
            // Create user with randomized dummy password hash (as they authenticate via OAuth)
            const randomPass = Math.random().toString(36) + Math.random().toString(36);
            const pwdHash = "oauth-managed-user-" + randomPass;
            const insertResult = await db.query(
              `INSERT INTO public.users (email, password_hash, display_name, avatar_url)
               VALUES ($1, $2, $3, $4)
               RETURNING id, email, display_name`,
              [email, pwdHash, name || email.split("@")[0], picture || null]
            );
            user = insertResult.rows[0];

            // Create user profile
            await db.query(
              `INSERT INTO public.profiles (id, display_name, avatar_url)
               VALUES ($1, $2, $3)
               ON CONFLICT (id) DO NOTHING`,
              [user.id, user.display_name, picture || null]
            );
          } else {
            user = userResult.rows[0];
            // Keep avatar updated if provided by Google
            if (picture) {
              await db.query("UPDATE public.users SET avatar_url = $1 WHERE id = $2", [
                picture,
                user.id,
              ]);
              await db.query("UPDATE public.profiles SET avatar_url = $1 WHERE id = $2", [
                picture,
                user.id,
              ]);
            }
          }

          // 4. Generate JWT session token and redirect back to Dashboard
          const token = signToken({ userId: user.id, email: user.email });
          
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${origin}/dashboard`,
              "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
            },
          });
        } catch (e) {
          console.error("[Google OAuth Callback] Error:", e);
          return new Response(
            `Google authentication failed: ${e instanceof Error ? e.message : String(e)}`,
            { status: 500 }
          );
        }
      },
    },
  },
});
