import { AccessControlProvider } from "@refinedev/core";
import { supabaseClient } from "./supabase-client";

function decodeJwt(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return { can: false, reason: "Not signed in" };

    const payload = decodeJwt(session.access_token);
    const role = payload.app_metadata?.user_role;

    if (!role) return { can: false, reason: "No role assigned" };

    // Super Admin: full access
    if (role === "super_admin") return { can: true };

    // Admin: cannot delete users or change roles
    if (role === "admin") {
      if (resource === "profiles" && ["delete"].includes(action as string)) {
        return { can: false, reason: "Only Super Admin can delete users" };
      }
      if (resource === "user_roles") {
        return { can: false, reason: "Only Super Admin can manage roles" };
      }
      return { can: true };
    }

    // Moderator: read-only on messages, reviews, lessons
    if (role === "moderator") {
      const allowed = ["messages", "reviews", "lessons", "blog-posts", "categories"];
      if (allowed.includes(resource as string) && action === "list") {
        return { can: true };
      }
      return { can: false, reason: "Moderators have limited access" };
    }

    return { can: false, reason: "Unauthorized" };
  },
};