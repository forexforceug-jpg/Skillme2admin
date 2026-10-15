import { useState, useEffect, ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { AdminMenu } from "../menu";

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className={`admin-layout ${sidebarOpen ? "admin-layout--sidebar-open" : ""}`}>
      <div
        className="admin-sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <div className="admin-sidebar__logo-mark">S2</div>
          <div className="admin-sidebar__logo-text">
            Skillme<span>2</span>
          </div>
        </div>
        <AdminMenu onNavigate={() => setSidebarOpen(false)} />
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-topbar__hamburger"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle sidebar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <div className="admin-topbar__title">Skillme2 Admin</div>

          <div className="admin-topbar__actions">
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar">SA</div>
              <div className="admin-topbar__identity">
                <div className="admin-topbar__name">Super Admin</div>
                <div className="admin-topbar__role">Super Admin</div>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
