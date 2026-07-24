// Server-only helper for calling Lovable AI Gateway (embeddings + chat).
// Never import from client code.

const BASE = "https://ai.gateway.lovable.dev/v1";

export function getApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  return key;
}

/** Embed a batch of strings with gemini-embedding-2 (3072 dims). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({
      model: "google/gemini-embedding-2",
      input: texts,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Stream chat completion from a Gemini model. Yields raw text deltas. */
export async function* streamChat(messages: ChatMessage[], model = "google/gemini-3.6-flash"): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chat failed [${res.status}]: ${body}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* ignore malformed */
      }
    }
  }
}

/** Non-streaming completion. */
export async function complete(messages: ChatMessage[], model = "google/gemini-3.6-flash"): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": getApiKey(),
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "";
}

/** Format an embedding as a pgvector literal. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
