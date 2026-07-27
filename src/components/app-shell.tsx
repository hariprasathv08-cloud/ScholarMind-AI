import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, LayoutDashboard, Library, LogOut, MessageCircle, User, Search, Brain, Layers, Calendar, Menu, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listRecentConversations } from "@/lib/chats.functions";
import { Logo } from "@/components/logo";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: Library },
  { to: "/search", label: "Search", icon: Search },
  { to: "/quizzes", label: "Quizzes", icon: Brain },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/study-plan", label: "Study Plan", icon: Calendar },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<{ email?: string; name?: string; avatar?: string }>({});

  const getRecentChats = useServerFn(listRecentConversations);

  const { data: recentChats } = useQuery({
    queryKey: ["recent-conversations"],
    queryFn: () => getRecentChats(),
    staleTime: 10_000,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) setProfile({ email: u.email ?? undefined, name: (u.user_metadata as any)?.full_name ?? (u.user_metadata as any)?.name ?? u.email?.split("@")[0], avatar: (u.user_metadata as any)?.avatar_url });
    });
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
    router.invalidate();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background text-foreground">
      {/* Mobile Top Header */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 md:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <Logo variant="mark" className="h-5 w-5" />
          <span className="font-serif text-base text-foreground">ScholarMind <span className="text-primary font-bold">AI</span></span>
        </Link>
        <div className="h-8 w-8 overflow-hidden rounded-full bg-accent grid place-items-center">
          {profile.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
        </div>
      </header>

      {/* Mobile Sidebar Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer Content */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out md:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
            <Logo variant="mark" className="h-6 w-6" />
            <span className="font-serif text-lg text-foreground">ScholarMind <span className="text-primary font-bold">AI</span></span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 mt-4">
          {nav.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 flex-1 overflow-y-auto px-3 pb-3">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent chats</p>
          <div className="flex flex-col gap-0.5">
            {(recentChats ?? []).length === 0 && (
              <p className="px-3 text-xs text-muted-foreground">No chats yet.</p>
            )}
            {recentChats?.map((c) => (
              <Link
                key={c.id}
                to="/chat/$documentId"
                params={{ documentId: c.document_id! }}
                search={{ conversation: c.id }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                title={c.title}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-accent">
              {profile.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.name ?? "Student"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <button
              onClick={() => { setIsMobileMenuOpen(false); signOut(); }}
              title="Sign out"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
        <Link to="/dashboard" className="flex items-center gap-3 px-5 py-5">
          <Logo variant="mark" className="h-6 w-6" />
          <span className="font-serif text-lg text-foreground">ScholarMind <span className="text-primary font-bold">AI</span></span>
        </Link>

        <nav className="flex flex-col gap-0.5 px-3">
          {nav.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 flex-1 overflow-y-auto px-3 pb-3">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent chats</p>
          <div className="flex flex-col gap-0.5">
            {(recentChats ?? []).length === 0 && (
              <p className="px-3 text-xs text-muted-foreground">No chats yet.</p>
            )}
            {recentChats?.map((c) => (
              <Link
                key={c.id}
                to="/chat/$documentId"
                params={{ documentId: c.document_id! }}
                search={{ conversation: c.id }}
                className="flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                title={c.title}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-accent">
              {profile.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.name ?? "Student"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
