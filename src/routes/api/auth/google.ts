import { createFileRoute } from "@tanstack/react-router";

function getRequestOrigin(request: Request): string {
  const xForwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const xForwardedHost = request.headers.get("x-forwarded-host");
  if (xForwardedHost) {
    return `${xForwardedProto}://${xForwardedHost}`;
  }
  const host = request.headers.get("host");
  if (host) {
    return `${xForwardedProto}://${host}`;
  }
  return new URL(request.url).origin;
}

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          if (!clientId) {
            const html = `<!DOCTYPE html>
<html>
<head>
  <title>Google Authentication Bypass (Developer Mode)</title>
  <style>
    body {
      background-color: #0B0F19;
      color: #F3F4F6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 40px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    h2 {
      margin-top: 0;
      color: #60A5FA;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #9CA3AF;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
      color: white;
      border: none;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      margin-top: 10px;
      transition: all 0.2s;
    }
    .btn:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    .email-group {
      text-align: left;
      margin-bottom: 20px;
    }
    .email-label {
      font-size: 12px;
      font-weight: 600;
      color: #9CA3AF;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: block;
      margin-bottom: 8px;
    }
    .email-input {
      width: 100%;
      padding: 12px;
      background: #111827;
      border: 1px solid #374151;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    .email-input:focus {
      border-color: #3B82F6;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Google OAuth Bypass</h2>
    <p>Google Client ID is not configured in your <code>.env</code> file. For local development, you can sign in instantly with a mock Google developer account.</p>
    <form action="/api/auth/google/callback" method="GET">
      <input type="hidden" name="code" value="mock-dev-google-code" />
      <div class="email-group">
        <label class="email-label">Choose Developer Email</label>
        <input type="email" name="email" class="email-input" value="developer@example.com" required />
      </div>
      <button type="submit" class="btn">Sign In with Mock Google Account</button>
    </form>
  </div>
</body>
</html>`;
            return new Response(html, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
          
          const origin = getRequestOrigin(request);
          const redirectUri = `${origin}/api/auth/google/callback`;
          const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&response_type=code&scope=${encodeURIComponent("email profile")}`;

          return new Response(null, {
            status: 302,
            headers: { Location: url },
          });
        } catch (e) {
          console.error("ERROR IN GOOGLE GET HANDLER:", e);
          const errMessage = e instanceof Error ? e.message : String(e);
          const errStack = e instanceof Error ? e.stack : "";
          return new Response(JSON.stringify({ error: errMessage, stack: errStack }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
  component: () => null,
});
