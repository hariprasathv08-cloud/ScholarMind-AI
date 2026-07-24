import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FileText, MessageCircle, Sparkles, Upload, Layers, BookOpen } from "lucide-react";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — StudyGPT AI" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchStats = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="mt-1 font-serif text-4xl">Your study room</h1>
        </div>
        <Link to="/library" className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90">
          <Upload className="mr-2 inline h-4 w-4" />Upload
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<FileText className="h-4 w-4" />} label="Documents" value={data?.totals.documents ?? 0} loading={isLoading} />
        <Stat icon={<BookOpen className="h-4 w-4" />} label="Pages indexed" value={data?.totals.pages ?? 0} loading={isLoading} />
        <Stat icon={<Layers className="h-4 w-4" />} label="Chunks" value={data?.totals.chunks ?? 0} loading={isLoading} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Ready" value={data?.totals.ready ?? 0} loading={isLoading} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-serif text-2xl">This week</h2>
          <ActivityBars data={data?.weeklyActivity ?? []} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-serif text-2xl">Recent chats</h2>
          <div className="space-y-2">
            {(data?.recentChats ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No chats yet. Open a document and start asking questions.</p>
            )}
            {data?.recentChats?.map((c) => (
              <Link
                key={c.id}
                to="/chat/$documentId"
                params={{ documentId: c.document_id! }}
                search={{ conversation: c.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:border-highlight/50"
              >
                <MessageCircle className="h-4 w-4 text-highlight" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">Recent documents</h2>
          <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">See all →</Link>
        </div>
        {(data?.recentDocuments ?? []).length === 0 ? (
          <EmptyDocs />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data?.recentDocuments.map((d) => (
              <Link
                key={d.id}
                to="/chat/$documentId"
                params={{ documentId: d.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 hover:border-highlight/50"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.page_count ?? "—"} pages · <StatusBadge status={d.status} />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <p className="font-serif text-4xl">{loading ? "—" : value.toLocaleString()}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "text-highlight",
    processing: "text-blue-400",
    pending: "text-muted-foreground",
    failed: "text-destructive",
  };
  return <span className={map[status] ?? "text-muted-foreground"}>{status}</span>;
}

function ActivityBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-md bg-highlight/80"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            title={`${d.count} messages`}
          />
          <span className="text-[10px] text-muted-foreground">
            {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyDocs() {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-serif text-2xl">No documents yet</p>
      <p className="mt-2 text-sm text-muted-foreground">Upload your first PDF, DOCX, or notes file to get started.</p>
      <Link to="/library" className="mt-4 inline-flex rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90">
        Go to library
      </Link>
    </div>
  );
}
