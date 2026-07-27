import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function parseCookie(cookieString: string | null, name: string): string | null {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    let token = null;

    // 1. Try Cookie header first (primary for browser)
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      token = parseCookie(cookieHeader, "auth_token");
    }

    // 2. Try Authorization header
    if (!token) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "");
      }
    }

    if (!token) {
      throw new Error("Unauthorized: No session token provided");
    }

    // Dynamically import server-side verification to avoid bundling Node libraries on the client
    const { verifyToken } = await import("./auth-utils.server");
    const payload = verifyToken(token);
    if (!payload) {
      throw new Error("Unauthorized: Invalid or expired session token");
    }

    return next({
      context: {
        userId: payload.userId,
        email: payload.email,
      },
    });
  }
);
