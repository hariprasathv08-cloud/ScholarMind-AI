import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, LayoutDashboard, Library, LogOut, MessageCircle, User } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listRecentConversations } from "@/lib/chats.functions";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: Library },
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

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
    router.invalidate();
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <Link to="/dashboard" className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-serif text-lg">StudyGPT<span className="text-highlight"> AI</span></span>
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
