import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Sparkles, FileText, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyGPT AI — Chat with your study materials" },
      { name: "description", content: "Upload PDFs, notes, and slides. Ask questions and get grounded, cited answers from your own documents." },
      { property: "og:title", content: "StudyGPT AI — Chat with your study materials" },
      { property: "og:description", content: "Grounded AI answers from your own PDFs, notes, and slides — with page citations." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-serif text-xl">StudyGPT<span className="text-highlight"> AI</span></span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/auth" className="rounded-full px-4 py-2 text-sm font-medium hover:bg-accent">
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-highlight" />
            Grounded answers, page-level citations
          </div>
          <h1 className="font-serif text-5xl leading-[1.05] md:text-7xl">
            Turn your PDFs into a{" "}
            <span className="italic">
              <span className="highlight-mark">study partner</span>
            </span>
            .
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Upload lecture notes, textbooks, or slide decks. Ask questions in plain English.
            StudyGPT AI answers only from your materials — with page references you can verify.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:opacity-90"
            >
              Start studying free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium hover:bg-accent">
              I already have an account
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          <Feature icon={<FileText className="h-5 w-5" />} title="Upload anything" body="PDFs, DOCX, and plain text. We parse, chunk, and index them into your private library." />
          <Feature icon={<MessagesSquare className="h-5 w-5" />} title="Ask, don't search" body="Chat in natural language. Get answers backed by the actual pages of your documents." />
          <Feature icon={<Sparkles className="h-5 w-5" />} title="Citations, always" body='If it isn\u2019t in your notes, we say so. No hallucinated facts, no invented references.' />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} StudyGPT AI</span>
          <span className="font-serif italic">Study smarter, not longer.</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-highlight">
        {icon}
      </div>
      <h3 className="font-serif text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
