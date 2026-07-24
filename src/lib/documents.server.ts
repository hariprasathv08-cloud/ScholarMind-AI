// Server-only document parsing + chunking helpers.
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type ParsedPage = { page: number; text: string };

export async function parseDocument(bytes: ArrayBuffer, mime: string, filename: string): Promise<ParsedPage[]> {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const perPage = Array.isArray(text) ? text : [text];
    return perPage.map((t, i) => ({ page: i + 1, text: (t || "").trim() }));
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    // mammoth wants a Node Buffer-like; ArrayBuffer works via { arrayBuffer }.
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes });
    return [{ page: 1, text: value.trim() }];
  }
  // Plain text / markdown fallback
  const text = new TextDecoder().decode(bytes).trim();
  return [{ page: 1, text }];
}

export type Chunk = { index: number; page: number; content: string };

/** ~800 char chunks with ~120 char overlap, split on paragraph boundaries when possible. */
export function chunkPages(pages: ParsedPage[], target = 800, overlap = 120): Chunk[] {
  const out: Chunk[] = [];
  let idx = 0;
  for (const p of pages) {
    if (!p.text) continue;
    const paras = p.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    let buf = "";
    const flush = () => {
      if (buf.trim().length === 0) return;
      out.push({ index: idx++, page: p.page, content: buf.trim() });
      // seed the next buffer with tail overlap
      buf = buf.length > overlap ? buf.slice(-overlap) : "";
    };
    for (const para of paras) {
      if (buf.length + para.length + 2 <= target) {
        buf = buf ? `${buf}\n\n${para}` : para;
      } else if (para.length > target) {
        // huge paragraph — sliding window over it
        if (buf.trim()) flush();
        for (let i = 0; i < para.length; i += target - overlap) {
          const slice = para.slice(i, i + target);
          out.push({ index: idx++, page: p.page, content: slice });
        }
        buf = "";
      } else {
        flush();
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf.trim()) flush();
  }
  return out;
}
