import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock, BookOpen, AlertCircle, Loader2, CheckSquare, Square, CheckCircle2 } from "lucide-react";
import { getStudyPlan, generateStudyPlan, updateTaskCompletion } from "@/lib/studyplan.functions";

export const Route = createFileRoute("/_authenticated/study-plan")({
  head: () => ({ meta: [{ title: "Study Plan — ScholarMind AI" }] }),
  component: StudyPlanPage,
});

function StudyPlanPage() {
  const qc = useQueryClient();
  const getPlanFn = useServerFn(getStudyPlan);
  const generatePlanFn = useServerFn(generateStudyPlan);
  const toggleTaskFn = useServerFn(updateTaskCompletion);

  // States
  const [examDate, setExamDate] = useState("");
  const [availableHours, setAvailableHours] = useState<number>(6);
  const [subjects, setSubjects] = useState("");
  const [weakTopics, setWeakTopics] = useState("");

  // Queries
  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ["study-plan"],
    queryFn: () => getPlanFn(),
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (data: { examDate: string; availableHours: number; subjects: string; weakTopics: string }) =>
      generatePlanFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study-plan"] });
      toast.success("Study plan generated successfully!");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Plan generation failed");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (params: { planId: string; taskId: string; completed: boolean }) =>
      toggleTaskFn({ data: params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study-plan"] });
    },
    onError: () => {
      toast.error("Failed to update task completion");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examDate || !subjects.trim() || !weakTopics.trim()) {
      toast.error("Please fill in all plan requirements.");
      return;
    }
    generateMutation.mutate({
      examDate,
      availableHours,
      subjects,
      weakTopics,
    });
  };

  const handleToggle = (taskId: string, currentCompleted: boolean) => {
    if (!plan) return;
    toggleMutation.mutate({
      planId: plan.id,
      taskId,
      completed: !currentCompleted,
    });
  };

  // Calculate progress
  const tasks = plan?.plan_data?.tasks || [];
  const completedCount = tasks.filter((t: any) => t.completed).length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Persisted roadmap to success</p>
        <h1 className="mt-1 font-serif text-4xl">Study Plan</h1>
      </header>

      {loadingPlan ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-highlight mb-2" />
          <p>Loading your study plan...</p>
        </div>
      ) : plan ? (
        <div className="grid gap-8 md:grid-cols-3">
          {/* Left Side: Plan Info and Settings */}
          <div className="md:col-span-1 space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-serif text-xl font-medium">Exam Target</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Calendar className="h-4 w-4 text-highlight" />
                  <span>Exam Date: <strong className="text-foreground">{plan.exam_date}</strong></span>
                </div>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Clock className="h-4 w-4 text-highlight" />
                  <span>Study Allocation: <strong className="text-foreground">{plan.available_hours} hrs/week</strong></span>
                </div>
                <div className="flex items-start gap-2.5 text-muted-foreground">
                  <BookOpen className="h-4 w-4 text-highlight mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Subjects:</p>
                    <p className="truncate text-xs">{plan.subjects}</p>
                  </div>
                </div>
                {plan.weak_topics && (
                  <div className="flex items-start gap-2.5 text-muted-foreground">
                    <AlertCircle className="h-4 w-4 text-highlight mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Weak areas to drill:</p>
                      <p className="text-xs">{plan.weak_topics}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Re-generate Card */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-serif text-lg mb-2">Create New Plan</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Regenerating will replace this study plan with a brand new schedule.
              </p>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to delete and recreate your plan?")) {
                    // Temporarily unset plan state
                    qc.setQueryData(["study-plan"], null);
                  }
                }}
                className="w-full rounded-xl border border-border py-2 text-xs font-semibold hover:bg-accent text-foreground transition"
              >
                Reset Planner Form
              </button>
            </div>
          </div>

          {/* Right Side: Plan Task Checklist */}
          <div className="md:col-span-2 space-y-6">
            {/* Progress Card */}
            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex-1">
                <h3 className="font-serif text-2xl mb-1">{plan.plan_data.title || "Exam Study Plan"}</h3>
                <p className="text-xs text-muted-foreground">
                  {completedCount} of {tasks.length} study tasks completed ({progressPercent}%)
                </p>
              </div>
              <div className="w-full md:w-48 bg-accent h-3 rounded-full overflow-hidden">
                <div
                  className="bg-highlight h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Task list */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <h4 className="font-serif text-lg">Weekly Schedule Checklist</h4>
              </div>
              {tasks.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">No tasks scheduled in plan.</div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {tasks.map((task: any) => (
                    <li
                      key={task.id}
                      onClick={() => handleToggle(task.id, task.completed)}
                      className={`p-6 flex items-start gap-4 cursor-pointer hover:bg-accent/30 transition ${
                        task.completed ? "opacity-60" : ""
                      }`}
                    >
                      <button
                        className="mt-0.5 rounded text-highlight focus:outline-none shrink-0"
                        title={task.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {task.completed ? (
                          <CheckSquare className="h-5 w-5 text-highlight" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                            {task.phase}
                          </span>
                          <span className="text-xs text-highlight font-semibold">
                            {task.hoursAllocated} Hours
                          </span>
                        </div>
                        <h5 className={`font-serif text-base font-medium ${task.completed ? "line-through" : ""}`}>
                          {task.topic}
                        </h5>
                        <p className="text-sm text-muted-foreground leading-relaxed">{task.details}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Create Plan Form */
        <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-6 text-center">
            <Calendar className="mx-auto mb-3 h-12 w-12 text-highlight opacity-80" />
            <h2 className="font-serif text-2xl">Generate Study Plan</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your upcoming exam parameters, and AI will prepare a week-by-week study roadmap targeting your weak areas.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Exam Date</label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-accent/40 p-3 text-sm focus:border-highlight focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Available hours (Weekly)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={availableHours}
                  onChange={(e) => setAvailableHours(parseInt(e.target.value) || 1)}
                  required
                  className="w-full rounded-xl border border-border bg-accent/40 p-3 text-sm focus:border-highlight focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Subjects / Topics to cover</label>
              <input
                type="text"
                placeholder="e.g. Linear Programming, Simplex Method, Probability"
                value={subjects}
                onChange={(e) => setSubjects(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-accent/40 p-3 text-sm focus:border-highlight focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">What are your weak topics?</label>
              <textarea
                rows={3}
                placeholder="e.g. Finding dual linear programs, big-M penalty method calculations"
                value={weakTopics}
                onChange={(e) => setWeakTopics(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-accent/40 p-3 text-sm focus:border-highlight focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={generateMutation.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-highlight py-4 font-semibold text-highlight-foreground hover:opacity-90 disabled:opacity-50"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Preparing study plan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" /> Generate Personalized Plan
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
