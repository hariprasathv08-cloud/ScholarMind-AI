// Custom drop-in replacement client for Supabase Auth using our local API routes.
// This allows all existing components to use their existing imports without modifications.

type User = {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
};

type Session = {
  access_token: string;
  user: User;
};

type AuthStateListener = (event: string, session: Session | null) => void;

const listeners = new Set<AuthStateListener>();
let cachedUser: User | null = null;
let hasChecked = false;

function fireEvent(event: string, session: Session | null) {
  listeners.forEach((callback) => {
    try {
      callback(event, session);
    } catch (e) {
      console.error("[Auth Client] Error in auth state listener:", e);
    }
  });
}

async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (e) {
    console.error("[Auth Client] Failed to check auth session:", e);
    return null;
  }
}

export const supabase = {
  auth: {
    async getUser() {
      if (hasChecked) {
        return { data: { user: cachedUser }, error: null };
      }
      const user = await fetchMe();
      cachedUser = user;
      hasChecked = true;
      return { data: { user: cachedUser }, error: null };
    },

    async getSession() {
      if (hasChecked) {
        const session = cachedUser
          ? { access_token: "dummy-custom-jwt-token", user: cachedUser }
          : null;
        return { data: { session }, error: null };
      }
      const user = await fetchMe();
      cachedUser = user;
      hasChecked = true;
      const session = cachedUser
        ? { access_token: "dummy-custom-jwt-token", user: cachedUser }
        : null;
      return { data: { session }, error: null };
    },

    async signInWithPassword({ email, password }: any) {
      try {
        const res = await fetch("/api/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const body = await res.json();
        if (!res.ok || body.error) {
          return { data: { user: null, session: null }, error: new Error(body.error || "Login failed") };
        }

        const user: User = {
          id: body.user.id,
          email: body.user.email,
          user_metadata: { full_name: body.user.name },
        };
        cachedUser = user;
        hasChecked = true;

        const session = { access_token: "dummy-custom-jwt-token", user };
        fireEvent("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      } catch (e) {
        return {
          data: { user: null, session: null },
          error: e instanceof Error ? e : new Error("Network error during login"),
        };
      }
    },

    async signUp({ email, password, options }: any) {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name: options?.data?.full_name,
          }),
        });
        const body = await res.json();
        if (!res.ok || body.error) {
          return { data: { user: null, session: null }, error: new Error(body.error || "Sign up failed") };
        }

        const user: User = {
          id: body.user.id,
          email: body.user.email,
          user_metadata: { full_name: body.user.name },
        };
        cachedUser = user;
        hasChecked = true;

        const session = { access_token: "dummy-custom-jwt-token", user };
        fireEvent("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      } catch (e) {
        return {
          data: { user: null, session: null },
          error: e instanceof Error ? e : new Error("Network error during signup"),
        };
      }
    },

    async signInWithOAuth({ provider }: { provider: string }) {
      if (provider === "google") {
        window.location.href = "/api/auth/google";
        return { data: { provider }, error: null };
      }
      return { data: null, error: new Error("Unsupported OAuth provider") };
    },

    async signOut() {
      try {
        await fetch("/api/auth/signout", { method: "POST" });
      } catch (e) {
        console.error("[Auth Client] Error signing out from server:", e);
      }
      cachedUser = null;
      hasChecked = true;
      fireEvent("SIGNED_OUT", null);
      return { error: null };
    },

    onAuthStateChange(callback: AuthStateListener) {
      listeners.add(callback);

      // Trigger initial event based on cached/initial state
      const session = cachedUser
        ? { access_token: "dummy-custom-jwt-token", user: cachedUser }
        : null;
      callback("INITIAL_SESSION", session);

      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },
  },
};
