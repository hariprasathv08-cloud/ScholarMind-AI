import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          return new Response("Google Client ID not configured in .env", { status: 400 });
        }
        
        const origin = new URL(request.url).origin;
        const redirectUri = `${origin}/api/auth/google/callback`;
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code&scope=${encodeURIComponent("email profile")}`;

        return new Response(null, {
          status: 302,
          headers: { Location: url },
        });
      },
    },
  },
});
