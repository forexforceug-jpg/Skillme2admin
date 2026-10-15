import { ReactNode, useEffect, useState } from "react";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { AdminMenu } from "../menu";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { data: identity } = useGetIdentity<{ name: string; email: string }>();
  const { mutate: logout } = useLogout();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    import("../../providers/supabase-client").then(({ supabaseClient }) => {
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        try {
          const payload = JSON.parse(atob(session.access_token.split(".")[1]));
          setRole(payload.app_metadata?.user_role ?? "moderator");
        } catch {
          setRole("moderator");
        }
      });
    });
  }, []);

  const initials = (identity?.name ?? "AD").slice(0, 2).toUpperCase();

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <div className="admin-sidebar__logo-mark">S2</div>
          <div className="admin-sidebar__logo-text">
            Skillme<span>2</span>
          </div>
        </div>

        <div className="admin-sidebar__section-label">Management</div>
        <AdminMenu />
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__title">Skillme2 Admin Console</div>
          <div className="admin-topbar__actions">
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar">{initials}</div>
              <div>
                <div className="admin-topbar__name">{identity?.name ?? "Admin"}</div>
                <div className="admin-topbar__role">{role.replace("_", " ")}</div>
              </div>
            </div>
            <button className="btn btn--ghost" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
