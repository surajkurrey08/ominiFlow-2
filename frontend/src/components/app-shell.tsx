"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { AuthContext } from "@/lib/auth/session";

const navigation = [
  { label: "Analytics", href: "/analytics", mark: "A" },
  { label: "Dashboard", href: "/dashboard", mark: "D" },
  { label: "Inbox", href: "/inbox", mark: "I" },
  { label: "Contacts", href: "/contacts", mark: "C" },
  { label: "Channels", href: "/channels", mark: "↗" },
  { label: "Team", href: "/team", mark: "T" },
  { label: "Keywords", href: "/keywords", mark: "K" },
  { label: "WhatsApp Forms", href: "/whatsapp-forms", mark: "W" },
  { label: "Postings", href: "/postings", mark: "P" },
  { label: "E-commerce", href: "/e-commerce", mark: "E" },
  { label: "Automations", href: "/automations", mark: "A" },
  { label: "Broadcast", href: "/campaigns", mark: "B" },
  { label: "Flow", href: "/flow", mark: "F" },
  { label: "AI Configuration", href: "/ai-configuration", mark: "✨" },
  { label: "Templates", href: "/templates", mark: "▤" },
  { label: "Settings", href: "/settings", mark: "⚙" },
];

interface AppShellProps extends AuthContext {
  children: ReactNode;
}

export function AppShell({ user, tenant, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const initials = [user.first_name[0], user.last_name?.[0]].filter(Boolean).join("").toUpperCase();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("omniflow_sidebar_collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("omniflow_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function logout() {
    const goToLogin = (partial: boolean) => {
      router.replace(partial ? "/login?reason=logout-partial" : "/login");
      router.refresh();
    };
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        goToLogin(true);
        return;
      }
      if (payload && typeof payload === "object" && "server_session_revoked" in payload &&
          payload.server_session_revoked === false) {
        goToLogin(true);
        return;
      }
    } catch {
      goToLogin(true);
      return;
    }
    goToLogin(false);
  }

  return (
    <div className="min-h-screen bg-[#f5f7f6] text-slate-900">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside id="app-sidebar" className={`app-sidebar ${mobileOpen ? "app-sidebar-open" : ""} ${sidebarCollapsed ? "app-sidebar-collapsed" : ""}`}>
        <div className="sidebar-header flex items-center justify-between w-full flex-shrink-0">
          <Link href="/dashboard" className="brand-lockup" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark" aria-hidden="true">o</span>
            <span>omniflow</span>
          </Link>
          <button
            type="button"
            className="sidebar-collapse-btn hidden md:inline-flex items-center justify-center cursor-pointer"
            onClick={toggleSidebar}
            title="Hide sidebar menu (Ctrl+B)"
            aria-label="Hide sidebar menu"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <path d="m14 9-3 3 3 3" />
            </svg>
          </button>
        </div>

        <nav aria-label="Main navigation" className="sidebar-nav mt-8 space-y-1">
          <p className="nav-section-label">WORKSPACE</p>
          {[...navigation, ...(user.is_platform_super_admin
            ? [{ label: "Password reset requests", href: "/platform-admin/password-resets", mark: "🔐" }]
            : [])].map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
              >
                <span className="nav-icon" aria-hidden="true">{item.mark}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom !pt-1 !border-t-0">
          <div className="sidebar-user">
            <span className="avatar avatar-small !w-7 !h-7 !text-[11px]">{initials || "O"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{fullName || "Team member"}</span>
            </span>
          </div>
          <button className="logout-button !mt-1 !py-1.5 !text-[13px]" type="button" onClick={logout}>Sign out</button>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <Link href="/privacy" target="_blank" className="hover:text-white transition-colors">Privacy</Link>
            <span>•</span>
            <Link href="/terms" target="_blank" className="hover:text-white transition-colors">Terms</Link>
            <span>•</span>
            <Link href="/data-deletion" target="_blank" className="hover:text-white transition-colors">Data Deletion</Link>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <div className={`app-main-column ${sidebarCollapsed ? "app-main-column-expanded" : ""}`}>
        <header className="app-topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="mobile-menu-button"
              aria-expanded={mobileOpen}
              aria-controls="app-sidebar"
              onClick={() => setMobileOpen((open) => !open)}
            >
              <span className="sr-only">{mobileOpen ? "Close navigation" : "Open navigation"}</span>
              <span aria-hidden="true">{mobileOpen ? "×" : "☰"}</span>
            </button>
            <button
              type="button"
              className={`desktop-sidebar-toggle hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                sidebarCollapsed
                  ? "bg-[#0b1028] text-white border-[#0b1028] hover:bg-[#1a224a] shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
              }`}
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar menu (Ctrl+B)" : "Hide sidebar menu (Ctrl+B)"}
              aria-label={sidebarCollapsed ? "Expand sidebar menu" : "Hide sidebar menu"}
              aria-expanded={!sidebarCollapsed}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <path d={sidebarCollapsed ? "m12 9 3 3-3 3" : "m15 9-3 3 3 3"} />
              </svg>
              <span>{sidebarCollapsed ? "Expand Menu" : "Hide Menu"}</span>
            </button>
            <div className="topbar-breadcrumb">Workspace <span>/</span> <strong>{navigation.find((item) => item.href === pathname)?.label ?? "Workspace"}</strong></div>
          </div>
          <div className="topbar-user">
            <span className="topbar-tenant">{tenant.name}</span>
            <span className="avatar avatar-top">{initials || "O"}</span>
          </div>
        </header>
        <main id="main-content" className="app-content">{children}</main>
      </div>
    </div>
  );
}
