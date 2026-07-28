const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-study-gpt-ai-123456";

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs").then(m => m.default || m);
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs").then(m => m.default || m);
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: { userId: string; email: string }): Promise<string> {
  const jwt = await import("jsonwebtoken").then(m => m.default || m);
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const jwt = await import("jsonwebtoken").then(m => m.default || m);
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

export function getSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.NITRO_PRESET;
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${isProd ? "; Secure" : ""}`;
}
