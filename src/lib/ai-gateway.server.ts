// Server-only helper for calling Lovable AI Gateway or Gemini API directly (embeddings + chat).
// Never import from client code.

export function getApiConfig(): { url: string; headers: Record<string, string>; model: string; embedModel: string; isDirectGemini: boolean } {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  if (geminiKey) {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${geminiKey}`,
      },
      model: "gemini-3.5-flash",
      embedModel: "gemini-embedding-2",
      isDirectGemini: true,
    };
  }
  
  if (lovableKey) {
    return {
      url: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      model: "google/gemini-3.6-flash",
      embedModel: "google/gemini-embedding-2",
      isDirectGemini: false,
    };
  }
  
  throw new Error("No API key configured. Please set GEMINI_API_KEY or LOVABLE_API_KEY in your .env file.");
}

function cleanModelName(modelName: string, isDirectGemini: boolean): string {
  if (isDirectGemini) {
    const name = modelName.replace(/^google\//, "");
    if (name.includes("gemini-1.5-flash") || name.includes("gemini-2.0-flash") || name.includes("gemini-2.5-flash")) {
      return "gemini-3.5-flash";
    }
    return name;
  } else {
    if (!modelName.startsWith("google/") && modelName.startsWith("gemini-")) {
      return "google/" + modelName;
    }
    return modelName;
  }
}

/** Helper for fetching with exponential backoff on 429 Rate Limits */
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

/** Embed a batch of strings. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const config = getApiConfig();
  
  const cleanedModel = cleanModelName(config.embedModel, config.isDirectGemini);
  const body: any = {
    model: cleanedModel,
    input: texts,
  };
  
  if (cleanedModel === "text-embedding-004" || cleanedModel === "gemini-embedding-2") {
    body.dimensions = 3072;
  }
  
  const res = await fetchWithRetry(`${config.url}/embeddings`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Embedding failed [${res.status}]: ${bodyText}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Stream chat completion from a Gemini model. Yields raw text deltas. */
export async function* streamChat(messages: ChatMessage[], model?: string): AsyncGenerator<string> {
  const config = getApiConfig();
  const selectedModel = model && model.includes("gemini-3.6-flash") && config.model === "gemini-3.5-flash"
    ? config.model
    : (model || config.model);
    
  const finalModel = cleanModelName(selectedModel, config.isDirectGemini);
    
  const res = await fetchWithRetry(`${config.url}/chat/completions`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({ model: finalModel, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Chat failed [${res.status}]: ${bodyText}`);
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
export async function complete(messages: ChatMessage[], model?: string): Promise<string> {
  const config = getApiConfig();
  const selectedModel = model && model.includes("gemini-3.6-flash") && config.model === "gemini-3.5-flash"
    ? config.model
    : (model || config.model);
    
  const finalModel = cleanModelName(selectedModel, config.isDirectGemini);
    
  const res = await fetchWithRetry(`${config.url}/chat/completions`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({ model: finalModel, messages }),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`Chat failed [${res.status}]: ${bodyText}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "";
}

/** Format an embedding as a pgvector literal. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
