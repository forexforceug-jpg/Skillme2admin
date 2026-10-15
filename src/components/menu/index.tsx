import { useMenu } from "@refinedev/core";
import { Link, useLocation } from "react-router";

const ICONS: Record<string, JSX.Element> = {
  profiles: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </svg>
  ),
  lessons: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  bookings: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  escrow: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  payouts: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  verification_requests: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  messages: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  reviews: (
    <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  ),
};

const LABELS: Record<string, string> = {
  profiles: "Users",
  lessons: "Lessons",
  bookings: "Bookings",
  escrow: "Escrow",
  payouts: "Payouts",
  verification_requests: "Verifications",
  messages: "Messages",
  reviews: "Reviews",
};

export function AdminMenu() {
  const { menuItems } = useMenu();
  const location = useLocation();

  return (
    <nav className="admin-menu">
      {menuItems.map(item => {
        const name = item.name;
        const isActive =
          location.pathname === item.route || location.pathname.startsWith(item.route + "/");
        return (
          <Link
            key={name}
            to={item.route ?? "/"}
            className={`admin-menu__item ${isActive ? "is-active" : ""}`}
          >
            {ICONS[name] ?? (
              <svg className="admin-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
            <span>{LABELS[name] ?? item.label ?? name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
