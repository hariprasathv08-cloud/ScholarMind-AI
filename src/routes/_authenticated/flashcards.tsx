import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Layers, CheckCircle2, XCircle, Trash2, Loader2, Sparkles } from "lucide-react";
import { listFlashcards, generateFlashcards, reviewFlashcard, deleteFlashcard } from "@/lib/flashcards.functions";
import { listDocuments } from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/flashcards")({
  head: () => ({ meta: [{ title: "Flashcards — ScholarMind AI" }] }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const qc = useQueryClient();
  const getCardsFn = useServerFn(listFlashcards);
  const generateCardsFn = useServerFn(generateFlashcards);
  const reviewCardFn = useServerFn(reviewFlashcard);
  const deleteCardFn = useServerFn(deleteFlashcard);
  const getDocsFn = useServerFn(listDocuments);

  // States
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState<"review" | "list">("review");

  // Queries
  const { data: cards = [], isLoading: loadingCards } = useQuery({
    queryKey: ["flashcards", selectedDocId],
    queryFn: () => getCardsFn({ data: { documentId: selectedDocId || null } }),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => getDocsFn(),
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (documentId: string) => generateCardsFn({ data: { documentId } }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      setCurrentCardIndex(0);
      setFlipped(false);
      toast.success(`Generated ${data.count} flashcards!`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cardId: string) => deleteCardFn({ data: { cardId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      toast.success("Flashcard deleted");
      if (currentCardIndex >= cards.length - 1) {
        setCurrentCardIndex(Math.max(0, cards.length - 2));
      }
    },
    onError: () => toast.error("Failed to delete card"),
  });

  const handleReview = async (correct: boolean) => {
    if (cards.length === 0) return;
    const currentCard = cards[currentCardIndex];

    try {
      await reviewCardFn({
        data: {
          cardId: currentCard.id,
          correct,
        },
      });

      toast.success(correct ? "Saved as correct!" : "Review updated.");
      
      // Move to next card, reset flip
      setFlipped(false);
      setTimeout(() => {
        if (currentCardIndex < cards.length - 1) {
          setCurrentCardIndex((prev) => prev + 1);
        } else {
          // Finished deck
          setCurrentCardIndex(cards.length);
        }
        qc.invalidateQueries({ queryKey: ["flashcards"] });
      }, 150);
    } catch {
      toast.error("Failed to submit review");
    }
  };

  const dueCards = cards.filter((c) => new Date(c.next_review) <= new Date());

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-col sm:flex-row gap-4 sm:items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Spaced repetition revision</p>
          <h1 className="mt-1 font-serif text-4xl">Flashcards</h1>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-accent p-1">
          <button
            onClick={() => setActiveTab("review")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activeTab === "review" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Review Deck
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activeTab === "list" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Card List ({cards.length})
          </button>
        </div>
      </header>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Side: Deck selector and metadata */}
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-xl font-medium">Select Subject</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Filter by Document</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => {
                    setSelectedDocId(e.target.value);
                    setCurrentCardIndex(0);
                    setFlipped(false);
                  }}
                  className="w-full rounded-xl border border-border bg-accent/50 p-3 text-sm focus:border-highlight focus:outline-none"
                >
                  <option value="">All Documents</option>
                  {documents
                    .filter((d) => d.status === "ready")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                </select>
              </div>

              {selectedDocId && (
                <button
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(selectedDocId)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-highlight py-3 text-sm font-medium text-highlight-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> AI Generate Cards
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 text-sm space-y-3">
            <h3 className="font-serif text-lg">Deck Statistics</h3>
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Total Cards:</span>
              <span className="font-semibold">{cards.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due for Review:</span>
              <span className="font-semibold text-highlight">{dueCards.length} cards</span>
            </div>
          </div>
        </div>

        {/* Right Side: Card review/list pane */}
        <div className="md:col-span-2">
          {activeTab === "review" ? (
            loadingCards ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-highlight" />
                <p>Loading flashcards...</p>
              </div>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                <Layers className="mx-auto mb-4 h-16 w-16 opacity-20 text-highlight" />
                <p className="font-serif text-xl text-foreground mb-2">No flashcards in this deck</p>
                <p className="text-sm max-w-md mx-auto">
                  Select a document from the left filter list and click <strong>AI Generate Cards</strong> to create cards instantly.
                </p>
              </div>
            ) : currentCardIndex < cards.length ? (
              <div className="space-y-6">
                {/* Spacing card */}
                <div
                  onClick={() => setFlipped(!flipped)}
                  className="group relative h-64 w-full cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm transition hover:border-highlight/50 flex flex-col justify-center items-center text-center"
                >
                  <span className="absolute left-4 top-4 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Box {cards[currentCardIndex].box}
                  </span>
                  <span className="absolute right-4 top-4 text-xs text-muted-foreground">
                    Card {currentCardIndex + 1} of {cards.length}
                  </span>

                  {flipped ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-highlight">Answer</p>
                      <p className="text-xl font-medium text-foreground">{cards[currentCardIndex].back}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question / Concept</p>
                      <p className="text-xl font-serif text-foreground leading-relaxed">{cards[currentCardIndex].front}</p>
                    </div>
                  )}

                  <span className="absolute bottom-4 text-xs text-muted-foreground opacity-60">
                    Click card to flip
                  </span>
                </div>

                {/* Review Buttons */}
                {flipped && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleReview(false)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 py-4 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition"
                    >
                      <XCircle className="h-4 w-4" /> Incorrect (Keep in Box 1)
                    </button>
                    <button
                      onClick={() => handleReview(true)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 py-4 text-sm font-semibold text-green-400 hover:bg-green-500/10 transition"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Correct (Move Up)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
                <p className="font-serif text-2xl text-foreground mb-2">Deck completed!</p>
                <p className="text-sm max-w-sm mx-auto mb-6">
                  You've reviewed all flashcards in this category. You will see due reviews here as scheduling intervals expire.
                </p>
                <button
                  onClick={() => setCurrentCardIndex(0)}
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/80"
                >
                  Restart Deck Review
                </button>
              </div>
            )
          ) : (
            /* Card List Tab */
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <h3 className="font-serif text-lg">Deck Flashcards ({cards.length})</h3>
              </div>
              {cards.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">No cards in list.</div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {cards.map((card) => (
                    <li key={card.id} className="p-6 flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div>
                          <span className="inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            Box {card.box}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            Next review: {new Date(card.next_review).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="font-serif font-medium text-foreground">{card.front}</p>
                        <p className="text-sm text-muted-foreground border-l border-border/50 pl-3">{card.back}</p>
                      </div>
                      <button
                        onClick={() => deleteMutation.mutate(card.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-red-400"
                        title="Delete Card"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
