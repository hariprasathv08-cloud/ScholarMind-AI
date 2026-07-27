// Server-only document parsing + chunking helpers.
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type ParsedPage = { page: number; text: string };

async function fetchWithRetry(url: string, options: RequestInit, retries = 5, backoff = 2000): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (res.status === 429) {
      if (retries > 0) {
        let delay = backoff;
        
        // 1. Try Retry-After header
        const retryAfter = res.headers.get("retry-after");
        if (retryAfter) {
          const sec = parseFloat(retryAfter);
          if (!isNaN(sec)) {
            delay = Math.ceil(sec * 1000) + 1500;
          }
        }
        
        // 2. Try parsing JSON body (can be object or array)
        if (delay === backoff) {
          try {
            const clone = res.clone();
            const json = await clone.json() as any;
            const errObj = Array.isArray(json) ? json[0]?.error : json?.error;
            const details = errObj?.details || [];
            
            for (const d of details) {
              if (d?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && d.retryDelay) {
                const sec = parseFloat(d.retryDelay);
                if (!isNaN(sec)) {
                  delay = Math.ceil(sec * 1000) + 1500; // delay + 1.5s buffer
                  break;
                }
              }
            }
            if (delay === backoff) {
              const msg = errObj?.message || "";
              const match = msg.match(/retry in ([\d\.]+)s/i);
              if (match) {
                const sec = parseFloat(match[1]);
                if (!isNaN(sec)) {
                  delay = Math.ceil(sec * 1000) + 1500;
                }
              }
            }
          } catch {
            // ignore parsing error
          }
        }

        console.warn(`[Gemini API Rate Limit] Hit 429. Waiting ${delay}ms before retry. Retries left: ${retries}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Gemini API Connection Error] Fetch failed. Waiting ${backoff}ms before retry. Retries left: ${retries}`, err);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

async function ocrPdfWithGemini(bytes: ArrayBuffer): Promise<ParsedPage[]> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) {
    throw new Error("No readable text found in PDF, and GEMINI_API_KEY is not configured for scanned document OCR.");
  }

  let fileRefName: string | null = null;

  try {
    console.log("[Gemini OCR] Uploading scanned PDF to Gemini Files API...");
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify({ file: { displayName: "scanned-document.pdf" } })], {
        type: "application/json",
      })
    );
    formData.append(
      "file",
      new Blob([bytes], { type: "application/pdf" })
    );

    const uploadRes = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "multipart",
        },
        body: formData,
      }
    );

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`Gemini Files API upload failed [${uploadRes.status}]: ${errorText}`);
    }

    const uploadJson = await uploadRes.json() as any;
    const fileUri = uploadJson.file?.uri;
    fileRefName = uploadJson.file?.name;

    if (!fileUri || !fileRefName) {
      throw new Error("Failed to get file URI or reference name from Gemini Files API.");
    }

    console.log(`[Gemini OCR] Upload success. File URI: ${fileUri}. Querying Gemini 3.5 Flash for multimodal OCR...`);
    
    const ocrRes = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Analyze this scanned PDF document. Extract all readable text from it. Group your response by page like: '--- PAGE 1 ---', '--- PAGE 2 ---' etc. Transcribe every page thoroughly so it can be indexed for retrieval. Respond only with the text content."
                },
                {
                  fileData: {
                    mimeType: "application/pdf",
                    fileUri: fileUri
                  }
                }
              ]
            }
          ]
        })
      }
    );

    if (!ocrRes.ok) {
      const errorText = await ocrRes.text();
      throw new Error(`Gemini OCR failed [${ocrRes.status}]: ${errorText}`);
    }

    const json = await ocrRes.json() as any;
    const fullText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!fullText.trim()) {
      throw new Error("Gemini OCR returned empty text.");
    }

    const pages: ParsedPage[] = [];
    const parts = fullText.split(/--- PAGE \d+ ---/i);

    if (parts.length > 1) {
      let pageNum = 1;
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          pages.push({ page: pageNum++, text: trimmed });
        }
      }
    } else {
      pages.push({ page: 1, text: fullText.trim() });
    }

    console.log(`[Gemini OCR] Successfully extracted ${pages.length} pages of text.`);
    return pages;
  } finally {
    if (fileRefName) {
      console.log(`[Gemini OCR] Cleaning up temporary file from AI Studio: ${fileRefName}`);
      try {
        await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/${fileRefName}?key=${geminiKey}`,
          { method: "DELETE" }
        );
      } catch (err) {
        console.error(`[Gemini OCR] Failed to delete temporary file ${fileRefName}:`, err);
      }
    }
  }
}

export async function parseDocument(bytes: ArrayBuffer, mime: string, filename: string): Promise<ParsedPage[]> {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    // Copy the bytes to prevent "detached ArrayBuffer" errors if unpdf consumes the buffer
    const ocrBytes = new Uint8Array(bytes).slice().buffer;
    
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const perPage = Array.isArray(text) ? text : [text];
    
    const hasText = perPage.some(t => t && t.trim().length > 0);
    if (hasText) {
      return perPage.map((t, i) => ({ page: i + 1, text: (t || "").trim() }));
    }
    
    console.log("[Document Parser] Scanned PDF detected. Attempting Gemini OCR...");
    return ocrPdfWithGemini(ocrBytes);
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    // mammoth wants a Node Buffer-like; ArrayBuffer works via { arrayBuffer }.
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes });
    return [{ page: 1, text: value.trim() }];
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lower.endsWith(".pptx")
  ) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
    );
    
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/[^\d]/g, ""), 10);
      const numB = parseInt(b.replace(/[^\d]/g, ""), 10);
      return numA - numB;
    });

    const pages: ParsedPage[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async("text");
      const matches = xml.matchAll(/<a:t>(.*?)<\/a:t>/g);
      let text = "";
      for (const match of matches) {
        const decoded = match[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        text += decoded + " ";
      }
      pages.push({ page: i + 1, text: text.trim() });
    }
    return pages;
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
