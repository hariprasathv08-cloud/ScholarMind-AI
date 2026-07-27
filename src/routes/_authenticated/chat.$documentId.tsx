import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ArrowUp, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDocument } from "@/lib/documents.functions";
import { listMessages } from "@/lib/chats.functions";

const searchSchema = z.object({ conversation: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/chat/$documentId")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Chat — ScholarMind AI" }, { name: "robots", content: "noindex" }] }),
  component: ChatPage,
});

type Message = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[] };
type Citation = { page: number; chunk_index: number };

function ChatPage() {
  const { documentId } = Route.useParams();
  const { conversation: conversationParam } = Route.useSearch();
  const navigate = useNavigate();
  const fetchDoc = useServerFn(getDocument);

  const { data: doc } = useQuery({
    queryKey: ["doc", documentId],
    queryFn: () => fetchDoc({ data: { id: documentId } }),
  });

  const fetchMessages = useServerFn(listMessages);

  const [conversationId, setConversationId] = useState<string | null>(conversationParam ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages({ data: { conversationId } })
      .then((data) => {
        if (data) {
          setMessages(
            data.map((m: any) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              citations: (m.citations as Citation[] | null) ?? undefined,
            }))
          );
        }
      })
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load messages");
      });
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || streaming || !doc || doc.status !== "ready") return;
    setStreaming(true);
    setInput("");

    const optimisticUser: Message = { id: `u-${Date.now()}`, role: "user", content: trimmed };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [...m, optimisticUser, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, conversationId, message: trimmed }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const convId = res.headers.get("x-conversation-id");
      if (convId && convId !== conversationId) {
        setConversationId(convId);
        navigate({ to: "/chat/$documentId", params: { documentId }, search: { conversation: convId }, replace: true });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let citations: Citation[] = [];
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE-style lines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const evt = JSON.parse(data) as { type: string; text?: string; citations?: Citation[]; message?: string };
            if (evt.type === "error" && evt.message) {
              throw new Error(evt.message);
            }
            if (evt.type === "delta" && evt.text) {
              full += evt.text;
              setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: full } : msg));
            } else if (evt.type === "citations" && evt.citations) {
              citations = evt.citations;
              setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, citations } : msg));
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) {
              throw e;
            }
            /* skip JSON parse/malformed errors */
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed");
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
        <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">← Library</Link>
        <div className="mx-3 h-4 w-px bg-border" />
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{doc?.title ?? "…"}</p>
          <p className="text-xs text-muted-foreground">
            {doc?.page_count ? `${doc.page_count} pages` : "—"} · {doc?.status ?? "…"}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {doc?.status !== "ready" && (
            <div className="mb-6 rounded-lg border border-dashed border-border bg-card p-6 text-center">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">This document is still being processed. Chat will unlock when it's ready.</p>
            </div>
          )}
          {messages.length === 0 && doc?.status === "ready" && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent">
                <Sparkles className="h-4 w-4 text-highlight" />
              </div>
              <h2 className="font-serif text-2xl">Ask anything about <span className="italic">{doc.title}</span></h2>
              <p className="mt-2 text-sm text-muted-foreground">Try: "Summarize chapter 3", "Explain this like I'm 10", "What are the key formulas?"</p>
            </div>
          )}
          <div className="space-y-6">
            {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching your document…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-6 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={doc?.status === "ready" ? "Ask ScholarMind anything about this document…" : "Waiting for document to be ready…"}
            disabled={doc?.status !== "ready" || streaming}
            rows={1}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming || doc?.status !== "ready"}
            className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
          Answers are grounded in your document. If it's not in the text, ScholarMind will say so.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="prose-doc max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {message.content || "…"}
        </ReactMarkdown>
      </div>
      {Array.isArray(message.citations) && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.citations.map((c, i) => (
            <span key={i} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground">
              Page {c.page}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
