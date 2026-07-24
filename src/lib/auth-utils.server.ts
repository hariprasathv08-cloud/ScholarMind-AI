import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-study-gpt-ai-123456";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

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

    const payload = verifyToken(token);
    if (!payload) {
      throw new Error("Unauthorized: Invalid or expired session token");
    }

    // Return the authenticated context
    return next({
      context: {
        userId: payload.userId,
        email: payload.email,
      },
    });
  }
);
