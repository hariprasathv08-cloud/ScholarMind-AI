import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, MoreVertical, Trash2, Upload as UploadIcon, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { listDocuments, deleteDocument, processDocument } from "@/lib/documents.functions";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown";
const MAX_BYTES = 25 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — ScholarMind AI" }, { name: "robots", content: "noindex" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const fetchDocs = useServerFn(listDocuments);
  const runProcess = useServerFn(processDocument);
  const runDelete = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const { data: docs = [], isLoading, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: () => fetchDocs(),
    refetchInterval: (q) => {
      const rows = q.state.data as { status: string }[] | undefined;
      return rows?.some((d) => d.status === "processing" || d.status === "pending") ? 2000 : false;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => runDelete({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-conversations"] });
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);

    for (const file of list) {
      if (file.size > MAX_BYTES) { toast.error(`${file.name}: exceeds 25 MB`); continue; }
      setUploading(file.name);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errMsg = await uploadRes.text();
          throw new Error(errMsg || "Upload failed");
        }

        const doc = await uploadRes.json() as { id: string };

        // 3) Kick off processing (server: parse -> chunk -> embed -> store)
        qc.invalidateQueries({ queryKey: ["documents"] });
        toast.success(`${file.name} uploaded — processing…`);
        runProcess({ data: { id: doc.id } })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["documents"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            toast.success(`${file.name} is ready`);
          })
          .catch((e: unknown) => {
            qc.invalidateQueries({ queryKey: ["documents"] });
            toast.error(`${file.name}: ${e instanceof Error ? e.message : "processing failed"}`);
          });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(null);
      }
    }
    refetch();
  }, [qc, refetch, runProcess]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Your materials</p>
          <h1 className="mt-1 font-serif text-4xl">Library</h1>
        </div>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`mb-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${dragOver ? "border-highlight bg-accent" : "border-border bg-card"}`}
      >
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent">
          <UploadIcon className="h-5 w-5 text-highlight" />
        </div>
        <p className="font-serif text-2xl">Drop files here</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, TXT, or Markdown · up to 25 MB</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
        />
        {uploading && <p className="mt-3 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Uploading {uploading}…</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-serif text-xl">Documents ({docs.length})</h2>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : docs.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No documents yet. Upload one above to start.</div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(d.size_bytes / 1024).toFixed(0)} KB · {d.page_count ?? "—"} pages ·{" "}
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </p>
                    {d.status === "failed" && d.error && <p className="mt-1 text-xs text-destructive text-wrap break-all">Error: {d.error}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 shrink-0 ml-14 sm:ml-0">
                  <StatusPill status={d.status} />
                  {d.status === "ready" && (
                    <Link
                      to="/chat/$documentId"
                      params={{ documentId: d.id }}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      <MessageCircle className="mr-1 inline h-3.5 w-3.5" />Chat
                    </Link>
                  )}
                  <DeleteButton onDelete={() => deleteMut.mutate(d.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "bg-highlight/15 text-highlight",
    processing: "bg-blue-500/15 text-blue-400",
    pending: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-muted"}`}>
      {status === "processing" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
      {status}
    </span>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((s) => !s)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              onClick={() => { setOpen(false); if (confirm("Delete this document and all its chunks?")) onDelete(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
