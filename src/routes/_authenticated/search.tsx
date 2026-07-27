import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, FileText, MessageCircle, Layers, ArrowRight } from "lucide-react";
import { globalSearch } from "@/lib/search.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Global Search — ScholarMind AI" }] }),
  component: SearchPage,
});

function SearchPage() {
  const runSearch = useServerFn(globalSearch);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    documents: any[];
    chats: any[];
    flashcards: any[];
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await runSearch({ data: { query } });
      setResults(data);
    } catch (err) {
      toast.error("Failed to perform search");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Find anything</p>
        <h1 className="mt-1 font-serif text-4xl">Search</h1>
      </header>

      <form onSubmit={handleSearch} className="mb-10 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search across documents, chats, and flashcards..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-3.5 pl-12 pr-4 text-sm focus:border-highlight focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-highlight px-6 py-3.5 text-sm font-medium text-highlight-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {results && (
        <div className="grid gap-8 md:grid-cols-3">
          {/* Documents Section */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-highlight">
              <FileText className="h-5 w-5" />
              <h2 className="font-serif text-xl">Documents ({results.documents.length})</h2>
            </div>
            {results.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching documents.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {results.documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/chat/$documentId"
                    params={{ documentId: doc.id }}
                    className="group flex flex-col justify-between rounded-xl border border-border bg-accent/30 p-3 hover:bg-accent/75 transition"
                  >
                    <span className="font-medium text-sm truncate group-hover:text-highlight transition">{doc.title}</span>
                    <span className="mt-1 text-xs text-muted-foreground uppercase">{doc.mime_type.split("/").pop()}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Chats Section */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-highlight">
              <MessageCircle className="h-5 w-5" />
              <h2 className="font-serif text-xl">Chats ({results.chats.length})</h2>
            </div>
            {results.chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching conversations.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {results.chats.map((chat) => (
                  <Link
                    key={chat.id}
                    to="/chat/$documentId"
                    params={{ documentId: chat.document_id }}
                    search={{ conversation: chat.id }}
                    className="group flex flex-col justify-between rounded-xl border border-border bg-accent/30 p-3 hover:bg-accent/75 transition"
                  >
                    <span className="font-medium text-sm truncate group-hover:text-highlight transition">{chat.title}</span>
                    <span className="mt-1 text-xs text-muted-foreground">Open chat <ArrowRight className="inline h-3 w-3" /></span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Flashcards Section */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-highlight">
              <Layers className="h-5 w-5" />
              <h2 className="font-serif text-xl">Flashcards ({results.flashcards.length})</h2>
            </div>
            {results.flashcards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching flashcards.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {results.flashcards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col rounded-xl border border-border bg-accent/30 p-3"
                  >
                    <span className="font-medium text-sm text-foreground">{card.front}</span>
                    <span className="mt-1 border-t border-border/50 pt-1 text-xs text-muted-foreground">{card.back}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!results && (
        <div className="py-20 text-center text-muted-foreground">
          <Search className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p>Type your query above to search across your study materials.</p>
        </div>
      )}
    </div>
  );
}
