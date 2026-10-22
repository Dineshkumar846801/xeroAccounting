"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { workspaceService, authService, ApiError } from "@/app/services/api";

const nav = [
  { label: "Overview", href: "/", icon: "grid" },
  { label: "Accounts", href: "/accounts", icon: "book" },
  { label: "Invoices", href: "/invoices", icon: "invoice" },
  { label: "Receivables", href: "/receivables", icon: "chart" },
];

const paths: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  book: "M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5m0-17v17M5 4.5H4a2 2 0 0 0-2 2v14h16",
  invoice: "M6 2h10l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm9 0v5h5M8 12h8M8 16h6",
  chart: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8V4",
  settings: "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5ZM19 12h3m-20 0h3m7-10v3m0 14v3",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = nav.find((item) => item.href === pathname)?.label ?? "Settings";
  const [companyName, setCompanyName] = useState<string>("Demo Company (Global)");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [desktopVisible, setDesktopVisible] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Initialize and track media query for mobile/tablet breakpoint
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 992px)");
    setIsMobile(mql.matches);

    try {
      const saved = localStorage.getItem("ledgerly_desktop_sidebar");
      if (saved !== null) {
        setDesktopVisible(saved === "true");
      }
    } catch {}

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) {
        setMobileOpen(false); // Reset mobile drawer when transitioning to desktop
      }
    };

    mql.addEventListener("change", handleMediaChange);
    return () => mql.removeEventListener("change", handleMediaChange);
  }, []);

  // Close mobile drawer on route navigation (desktop sidebar retains its state)
  useEffect(() => {
    if (isMobile) {
      setMobileOpen(false);
    }
  }, [pathname, isMobile]);

  function toggleSidebar() {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setDesktopVisible((prev) => {
        const next = !prev;
        try {
          localStorage.setItem("ledgerly_desktop_sidebar", String(next));
        } catch {}
        return next;
      });
    }
  }

  function closeSidebar() {
    if (isMobile) {
      setMobileOpen(false);
    } else {
      setDesktopVisible(false);
      try {
        localStorage.setItem("ledgerly_desktop_sidebar", "false");
      } catch {}
    }
  }

  // Keyboard shortcut: Ctrl+B to toggle sidebar, Escape to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") {
        if (isMobile && mobileOpen) {
          setMobileOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, mobileOpen, desktopVisible]);

  // Fetch actual connected Xero organisation dynamically (deduplicated & cached via service)
  useEffect(() => {
    if (pathname === "/login") return;

    let isMounted = true;
    workspaceService
      .getWorkspace()
      .then((data) => {
        if (isMounted && data?.tenantName) {
          setCompanyName(data.tenantName);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          window.location.replace("/login");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  // Prevent back-forward cache (bfcache) restoration on back button
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await authService.logout();
    } catch {}
    window.location.replace("/login");
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const initial = companyName ? companyName.trim().charAt(0).toUpperCase() : "X";
  const isSidebarVisible = isMobile ? mobileOpen : desktopVisible;

  return (
    <main
      className={`app-shell ${
        !desktopVisible ? "sidebar-desktop-closed" : ""
      } ${mobileOpen ? "mobile-sidebar-open" : ""}`}
    >
      {/* Mobile/Tablet Backdrop overlay */}
      {isMobile && mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Full Sidebar (never truncated to icon-only) */}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-header-row">
          <Link
            href="/"
            className="brand"
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <span className="brand-mark">x</span>
            <span>ledgerly</span>
          </Link>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={closeSidebar}
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            ✕
          </button>
        </div>

        <div className="workspace-switcher" title={companyName}>
          <span className="workspace-dot">{initial}</span>
          <div className="workspace-info">
            <strong className="workspace-name">{companyName}</strong>
            <small className="workspace-type">Connected Xero Organisation</small>
          </div>
        </div>

        <nav>
          <p className="nav-label">Workspace</p>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? "active" : ""}`}
              onClick={() => isMobile && setMobileOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
          <p className="nav-label second">Manage</p>
          <Link
            href="/settings"
            className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="nav-item logout-button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="Sign out of administrative session"
          >
            <Icon name="logout" />
            <span>{isLoggingOut ? "Signing out…" : "Sign out"}</span>
          </button>

          <div className="user-card">
            <div className="avatar">AD</div>
            <div>
              <strong>Administrator</strong>
              <small>Protected session</small>
            </div>
          </div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className={`sidebar-toggle-btn ${!isSidebarVisible ? "sidebar-is-hidden" : ""}`}
              onClick={toggleSidebar}
              aria-label={isSidebarVisible ? "Hide sidebar" : "Show sidebar"}
              title={isSidebarVisible ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <b>/</b>
              <strong>{current}</strong>
            </div>
          </div>

          <div className="top-actions">
            <span className="company-badge-top" title={`Active Xero organisation: ${companyName}`}>
              <span className="live-dot" />
              <span className="company-badge-text">{companyName}</span>
            </span>
            <div className="top-avatar" title="Signed in as Administrator">
              AD
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
