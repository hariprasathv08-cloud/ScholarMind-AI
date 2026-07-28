import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";

function getRequestOrigin(request?: Request): string {
  if (!request) return "http://localhost:8080";
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
  loader: async ({ request }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId) {
      const origin = getRequestOrigin(request);
      const redirectUri = `${origin}/api/auth/google/callback`;
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${encodeURIComponent("email profile")}`;

      throw redirect({
        href: url,
        statusCode: 302,
      });
    }
    return { mockMode: true };
  },
  component: GoogleBypassComponent,
});

function GoogleBypassComponent() {
  const [email, setEmail] = React.useState("developer@example.com");

  return React.createElement(
    "div",
    {
      style: {
        backgroundColor: "#0B0F19",
        color: "#F3F4F6",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        margin: 0,
      },
    },
    React.createElement(
      "div",
      {
        style: {
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          padding: "40px",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
        },
      },
      React.createElement(
        "h2",
        {
          style: {
            margin: 0,
            color: "#60A5FA",
            fontSize: "24px",
            marginBottom: "12px",
          },
        },
        "Google OAuth Bypass"
      ),
      React.createElement(
        "p",
        {
          style: {
            color: "#9CA3AF",
            fontSize: "14px",
            lineHeight: "1.6",
            marginBottom: "24px",
          },
        },
        "Google Client ID is not configured in your environment variables. For development/testing, you can sign in instantly with a mock Google developer account."
      ),
      React.createElement(
        "form",
        {
          action: "/api/auth/google/callback",
          method: "GET",
        },
        React.createElement("input", {
          type: "hidden",
          name: "code",
          value: "mock-dev-google-code",
        }),
        React.createElement(
          "div",
          {
            style: {
              textAlign: "left",
              marginBottom: "20px",
            },
          },
          React.createElement(
            "label",
            {
              style: {
                fontSize: "12px",
                fontWeight: 600,
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: "8px",
              },
            },
            "Choose Developer Email"
          ),
          React.createElement("input", {
            type: "email",
            name: "email",
            value: email,
            onChange: (e: any) => setEmail(e.target.value),
            style: {
              width: "100%",
              padding: "12px",
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "white",
              fontSize: "14px",
              boxSizing: "border-box",
              outline: "none",
            },
            required: true,
          })
        ),
        React.createElement(
          "button",
          {
            type: "submit",
            style: {
              display: "inline-block",
              width: "100%",
              padding: "12px",
              background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "15px",
              cursor: "pointer",
              marginTop: "10px",
            },
          },
          "Sign In with Mock Google Account"
        )
      )
    )
  );
}
