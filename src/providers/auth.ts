import { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "./supabase-client";

function decodeJwt(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { success: false, error };
    return { success: true, redirectTo: "/" };
  },

  logout: async () => {
    await supabaseClient.auth.signOut();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) return { authenticated: true };
    return { authenticated: false, redirectTo: "/login" };
  },

  onError: async (error) => {
    console.error("Auth error:", error);
    return { error };
  },

  getPermissions: async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;
    const payload = decodeJwt(session.access_token);
    return payload.app_metadata?.user_role ?? null;
  },

  getIdentity: async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      name: user.email ?? "Admin",
      email: user.email ?? "",
    };
  },
};