import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/auth-utils.server";
import fs from "fs";
import path from "path";

function parseCookie(cookieString: string | null, name: string): string | null {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export const Route = createFileRoute("/api/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Authenticate user from cookie/authorization header
        let token = null;
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          token = parseCookie(cookieHeader, "auth_token");
        }
        if (!token) {
          const authHeader = request.headers.get("authorization");
          if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.replace("Bearer ", "");
          }
        }

        if (!token) return new Response("Unauthorized", { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return new Response("Unauthorized", { status: 401 });
        const userId = payload.userId;

        try {
          // 2. Parse form data containing the file
          const formData = await request.formData();
          const file = formData.get("file") as File | null;
          if (!file) return new Response("No file provided", { status: 400 });

          // 3. Create document record in DB (initially pending, empty storage_path)
          const docResult = await db.query(
            `INSERT INTO public.documents (user_id, title, mime_type, size_bytes, storage_path, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              userId,
              file.name,
              file.type || "application/octet-stream",
              file.size,
              "", // temp placeholder path
              "pending",
            ]
          );
          const docId = docResult.rows[0].id;

          // 4. Save file to uploads/{userId}/{docId}.{ext}
          const ext = file.name.split(".").pop() ?? "bin";
          const relativePath = `${userId}/${docId}.${ext}`;
          const uploadsDir = path.join(process.cwd(), "uploads", userId);
          
          await fs.promises.mkdir(uploadsDir, { recursive: true });
          
          const fullPath = path.join(process.cwd(), "uploads", relativePath);
          const bytes = await file.arrayBuffer();
          await fs.promises.writeFile(fullPath, Buffer.from(bytes));

          // 5. Update document record with correct storage_path
          await db.query(
            "UPDATE public.documents SET storage_path = $1 WHERE id = $2",
            [relativePath, docId]
          );

          return new Response(JSON.stringify({ id: docId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[Upload API] File upload failed:", err);
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
