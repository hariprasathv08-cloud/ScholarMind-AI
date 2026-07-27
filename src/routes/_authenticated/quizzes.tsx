import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Brain, CheckCircle, XCircle, ArrowRight, RefreshCw, Loader2, BookOpen } from "lucide-react";
import { listQuizzes, getQuiz, generateQuiz, submitQuizAnswers } from "@/lib/quizzes.functions";
import { listDocuments } from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/quizzes")({
  head: () => ({ meta: [{ title: "Quizzes — ScholarMind AI" }] }),
  component: QuizzesPage,
});

function QuizzesPage() {
  const qc = useQueryClient();
  const getQuizzesFn = useServerFn(listQuizzes);
  const getQuizFn = useServerFn(getQuiz);
  const generateQuizFn = useServerFn(generateQuiz);
  const submitQuizFn = useServerFn(submitQuizAnswers);
  const getDocsFn = useServerFn(listDocuments);

  // Selected quiz state
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [quizFinished, setQuizFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Queries
  const { data: quizzes = [], isLoading: loadingQuizzes } = useQuery({
    queryKey: ["quizzes"],
    queryFn: () => getQuizzesFn(),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => getDocsFn(),
  });

  const { data: activeQuiz, isLoading: loadingQuiz } = useQuery({
    queryKey: ["quiz", activeQuizId],
    queryFn: () => (activeQuizId ? getQuizFn({ data: { id: activeQuizId } }) : null),
    enabled: !!activeQuizId,
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (documentId: string) => generateQuizFn({ data: { documentId } }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      setActiveQuizId(data.id);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
      setQuizFinished(false);
      toast.success("Quiz generated successfully!");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Quiz generation failed");
    },
  });

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (quizFinished || (activeQuiz?.score !== null && activeQuiz?.score !== undefined)) return;
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleNext = () => {
    if (!activeQuiz) return;
    if (currentQuestionIndex < activeQuiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;

    // Check if all questions are answered
    const unanswered = activeQuiz.questions.some((q) => userAnswers[q.id] === undefined);
    if (unanswered) {
      toast.error("Please answer all questions before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const payloadAnswers = Object.entries(userAnswers).map(([qId, index]) => ({
        questionId: qId,
        answerIndex: index,
      }));

      await submitQuizFn({
        data: {
          quizId: activeQuiz.id,
          answers: payloadAnswers,
        },
      });

      qc.invalidateQueries({ queryKey: ["quizzes"] });
      qc.invalidateQueries({ queryKey: ["quiz", activeQuiz.id] });
      setQuizFinished(true);
      toast.success("Quiz submitted successfully!");
    } catch (err) {
      toast.error("Failed to submit answers");
    } finally {
      setSubmitting(false);
    }
  };

  const startQuizReview = (quizId: string) => {
    setActiveQuizId(quizId);
    setCurrentQuestionIndex(0);
    setQuizFinished(true); // Force show review mode
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Test your knowledge</p>
        <h1 className="mt-1 font-serif text-4xl">Quizzes</h1>
      </header>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Side: Quiz List & Generator */}
        <div className={`md:col-span-1 space-y-6 ${activeQuizId ? "hidden md:block" : ""}`}>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-xl">Generate Quiz</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Select Source Document</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-accent/50 p-3 text-sm focus:border-highlight focus:outline-none"
                >
                  <option value="">-- Choose document --</option>
                  {documents
                    .filter((d) => d.status === "ready")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                </select>
              </div>

              <button
                disabled={!selectedDocId || generateMutation.isPending}
                onClick={() => generateMutation.mutate(selectedDocId)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-highlight py-3 text-sm font-medium text-highlight-foreground hover:opacity-90 disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4" /> Create MCQ Quiz
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-xl">Quiz History</h2>
            {loadingQuizzes ? (
              <div className="py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            ) : quizzes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quizzes completed yet.</p>
            ) : (
              <div className="divide-y divide-border/50 max-h-96 overflow-y-auto pr-1">
                {quizzes.map((quiz) => (
                  <div key={quiz.id} className="py-3 flex flex-col justify-between items-start gap-1">
                    <span className="font-medium text-sm text-foreground truncate w-full">{quiz.title}</span>
                    <div className="w-full flex justify-between items-center mt-1">
                      <span className="text-xs text-muted-foreground">
                        {quiz.score !== null ? `Score: ${quiz.score}%` : "Not finished"}
                      </span>
                      <button
                        onClick={() => {
                          setActiveQuizId(quiz.id);
                          setQuizFinished(quiz.score !== null);
                          setCurrentQuestionIndex(0);
                        }}
                        className="text-xs text-highlight hover:underline font-medium"
                      >
                        {quiz.score !== null ? "Review" : "Resume"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Quiz Board */}
        <div className="md:col-span-2">
          {loadingQuiz ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-highlight" />
              <p>Loading Quiz questions...</p>
            </div>
          ) : activeQuiz ? (
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <button
                    onClick={() => setActiveQuizId(null)}
                    className="mb-2 block text-xs font-medium text-muted-foreground hover:text-foreground md:hidden"
                  >
                    ← Back to Quiz list
                  </button>
                  <h2 className="font-serif text-2xl">{activeQuiz.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}
                  </p>
                </div>
                {activeQuiz.score !== null && (
                  <div className="rounded-full bg-highlight/10 px-4 py-1.5 text-sm font-semibold text-highlight">
                    Score: {activeQuiz.score}%
                  </div>
                )}
              </div>

              {/* Question Box */}
              <div>
                <p className="text-lg font-medium mb-4">{activeQuiz.questions[currentQuestionIndex].question}</p>
                <div className="grid gap-3">
                  {activeQuiz.questions[currentQuestionIndex].options.map((option: string, idx: number) => {
                    const question = activeQuiz.questions[currentQuestionIndex];
                    const selected = userAnswers[question.id] === idx || question.user_answer_index === idx;
                    const isCorrect = question.correct_option_index === idx;
                    const isReview = quizFinished || activeQuiz.score !== null;

                    let btnStyles = "border-border hover:bg-accent/40";
                    if (selected) btnStyles = "border-highlight bg-highlight/5 text-highlight";
                    
                    if (isReview) {
                      if (isCorrect) {
                        btnStyles = "border-green-500 bg-green-500/10 text-green-400";
                      } else if (selected && !isCorrect) {
                        btnStyles = "border-red-500 bg-red-500/10 text-red-400";
                      } else {
                        btnStyles = "border-border opacity-50";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isReview}
                        onClick={() => handleSelectOption(question.id, idx)}
                        className={`flex items-center justify-between rounded-xl border p-4 text-left text-sm transition font-medium ${btnStyles}`}
                      >
                        <span>{option}</span>
                        {isReview && isCorrect && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                        {isReview && selected && !isCorrect && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Explanation in Review Mode */}
              {(quizFinished || activeQuiz.score !== null) && activeQuiz.questions[currentQuestionIndex].explanation && (
                <div className="rounded-xl bg-accent/40 p-4 border border-border text-sm">
                  <p className="font-semibold text-highlight mb-1">Explanation:</p>
                  <p className="text-muted-foreground">{activeQuiz.questions[currentQuestionIndex].explanation}</p>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  disabled={currentQuestionIndex === 0}
                  onClick={handlePrev}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  Previous
                </button>

                {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-1 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium hover:bg-accent/80"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  !(quizFinished || activeQuiz.score !== null) && (
                    <button
                      disabled={submitting}
                      onClick={handleSubmitQuiz}
                      className="rounded-xl bg-highlight px-6 py-2.5 text-sm font-medium text-highlight-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit Quiz"}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
              <BookOpen className="mx-auto mb-4 h-16 w-16 opacity-20 text-highlight" />
              <p className="font-serif text-xl text-foreground mb-2">Ready to test yourself?</p>
              <p className="text-sm max-w-md mx-auto">
                Select a document from the left column and click <strong>Create MCQ Quiz</strong> to generate a randomized mock exam instantly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
