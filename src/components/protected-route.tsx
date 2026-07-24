import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        console.log("[Auth] Checking initial session...");
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("[Auth] Error fetching session:", error);
          toast.error("Failed to retrieve authentication session");
          throw error;
        }

        if (active) {
          if (currentSession) {
            console.log("[Auth] Session restored successfully for user:", currentSession.user?.email);
            setSession(currentSession);
          } else {
            console.log("[Auth] No active session found. Redirecting to /auth...");
            navigate({ to: "/auth", replace: true });
          }
        }
      } catch (err) {
        if (active) {
          navigate({ to: "/auth", replace: true });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    checkSession();

    // Listen for authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log(`[Auth] Auth state changed: ${event}`, newSession?.user?.email || "No User");
      
      if (active) {
        setSession(newSession);
        
        if (event === "SIGNED_OUT") {
          console.log("[Auth] User signed out. Redirecting to /auth...");
          navigate({ to: "/auth", replace: true });
        } else if (event === "SIGNED_IN" && newSession) {
          console.log("[Auth] User signed in. Active session user:", newSession.user?.email);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground animate-pulse">Restoring study session...</p>
        </div>
      </div>
    );
  }

  // Only render children if we have a valid session
  return session ? <>{children}</> : null;
}
