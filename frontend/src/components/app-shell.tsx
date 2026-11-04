"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, HouseIcon, EnvelopeIcon, UsersIcon, ShareNetworkIcon, LightningIcon, RobotIcon, FilesIcon, BroadcastIcon, ChartBarIcon, GearIcon, CaretDoubleLeftIcon, type Icon } from "@phosphor-icons/react";

import type { AuthContext } from "@/lib/auth/session";
import { WorkspaceShellContext } from "@/components/workspace-shell-context";
import { listInboxConversations } from "@/lib/api/inbox";

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

const workspaceNavigationOrder = ["/dashboard", "/inbox", "/contacts", "/channels", "/automations", "/ai-configuration", "/templates", "/campaigns", "/analytics", "/team", "/settings"];
const workspaceNavigationIcons: Record<string, Icon> = {
  "/dashboard": HouseIcon, "/inbox": EnvelopeIcon, "/contacts": UsersIcon, "/channels": ShareNetworkIcon,
  "/automations": LightningIcon, "/ai-configuration": RobotIcon, "/templates": FilesIcon,
  "/campaigns": BroadcastIcon, "/analytics": ChartBarIcon, "/team": UsersIcon, "/settings": GearIcon,
};

interface AppShellProps extends AuthContext {
  children: ReactNode;
}

export function AppShell({ user, tenant, children }: AppShellProps) {
  const pathname = usePathname();
  const isInbox = pathname === "/inbox";
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inboxTotal, setInboxTotal] = useState<number | null>(null);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const initials = [user.first_name[0], user.last_name?.[0]].filter(Boolean).join("").toUpperCase();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setSidebarCollapsed(localStorage.getItem("omniflow_sidebar_collapsed") === "true"); } catch {}
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    void listInboxConversations({ page: 1, page_size: 1 }).then((result) => {
      if (active) setInboxTotal(result.total);
    }).catch(() => { /* Navigation stays usable when the count is unavailable. */ });
    return () => { active = false; };
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
    <WorkspaceShellContext.Provider value={{ fullName, initials, inboxTotal, sidebarCollapsed, mobileNavigationOpen: mobileOpen, setInboxTotal, toggleNavigation: () => { if (window.matchMedia("(min-width: 768px)").matches) toggleSidebar(); else setMobileOpen((open) => !open); }, logout }}>
    <div className={`app-shell app-shell-workspace min-h-screen bg-[#f5f7f6] text-slate-900 ${isInbox ? "app-shell-inbox" : ""} ${pathname === "/templates" ? "app-shell-templates" : ""}`}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside id="app-sidebar" className={`app-sidebar ${mobileOpen ? "app-sidebar-open" : ""} ${sidebarCollapsed ? "app-sidebar-collapsed" : ""}`}>
        <div className="sidebar-header flex items-center justify-between w-full flex-shrink-0">
          <Link href="/dashboard" className="brand-lockup" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark" aria-hidden="true"><ArrowsClockwiseIcon size={28} weight="bold" /></span>
            <span>Omniflow</span>
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
          {[...workspaceNavigationOrder.map((href) => navigation.find((item) => item.href === href)!), ...(user.is_platform_super_admin
            ? [{ label: "Password reset requests", href: "/platform-admin/password-resets", mark: "🔐" }]
            : [])].map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            const NavigationIcon = workspaceNavigationIcons[item.href] ?? FilesIcon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
              >
                <span className="nav-icon" aria-hidden="true"><NavigationIcon size={25} /></span>
                <span>{item.href === "/dashboard" ? "Home" : item.href === "/ai-configuration" ? "AI Chatbot" : item.href === "/automations" ? "Automation" : item.label}</span>
                {item.href === "/inbox" && inboxTotal !== null && <span className="nav-inbox-count">{inboxTotal}</span>}
              </Link>
            );
          })}
          <details className="inbox-extra-tools" open={navigation.some((item) => !workspaceNavigationOrder.includes(item.href) && (pathname === item.href || pathname.startsWith(`${item.href}/`)))}><summary>More tools</summary>{navigation.filter((item) => !workspaceNavigationOrder.includes(item.href)).map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}</details>
        </nav>

        <div className="sidebar-bottom !pt-1 !border-t-0">
          <details className="workspace-sidebar-account">
            <summary aria-label="Sidebar account menu"><span className="avatar avatar-small">{initials || "O"}</span></summary>
            <div className="workspace-sidebar-account-menu">
              <strong>{fullName || "Team member"}</strong>
              <Link href="/settings" onClick={() => setMobileOpen(false)}>Account settings</Link>
              <button type="button" onClick={logout}>Sign out</button>
              <Link href="/privacy" target="_blank">Privacy</Link>
              <Link href="/terms" target="_blank">Terms</Link>
              <Link href="/data-deletion" target="_blank">Data Deletion</Link>
            </div>
          </details>
          <button type="button" className="inbox-sidebar-collapse" aria-label="Hide sidebar menu" onClick={() => { if (window.matchMedia("(min-width: 768px)").matches) toggleSidebar(); else setMobileOpen(false); }}><CaretDoubleLeftIcon size={24} /></button>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <div className={`app-main-column ${sidebarCollapsed ? "app-main-column-expanded" : ""}`}>
        <header className={`app-topbar ${isInbox ? "inbox-shell-topbar" : ""} ${sidebarCollapsed ? "flex" : "flex md:!hidden"}`}>
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
            {sidebarCollapsed && (
              <button
                type="button"
                className="desktop-sidebar-toggle hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer bg-[#0b1028] text-white border-[#0b1028] hover:bg-[#1a224a] shadow-sm"
                onClick={toggleSidebar}
                title="Expand sidebar menu (Ctrl+B)"
                aria-label="Expand sidebar menu"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <path d="m12 9 3 3-3 3" />
                </svg>
                <span>Expand Menu</span>
              </button>
            )}
          </div>
        </header>
        <main id="main-content" className="app-content">{children}</main>
      </div>
    </div>
    </WorkspaceShellContext.Provider>
  );
}
