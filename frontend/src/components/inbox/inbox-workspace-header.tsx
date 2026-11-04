"use client";

import Link from "next/link";

import type { InboxConnectionState } from "@/lib/realtime/inbox";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { InboxIcon } from "./inbox-icons";

export type InboxMetric = "all" | "unassigned" | "pending" | "resolved" | "unread";
export type InboxCounts = Record<InboxMetric, number | null>;

export function InboxWorkspaceHeader({ counts, metric, onSelect, liveState, refreshing, onRefresh }: {
  counts: InboxCounts;
  metric: InboxMetric | null;
  onSelect: (metric: InboxMetric) => void;
  liveState: InboxConnectionState;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const shell = useWorkspaceShell();
  return (
    <header className="inbox-workspace-header">
      <div className="inbox-workspace-title">
        <button type="button" className="inbox-mobile-navigation inbox-icon-button" aria-label={shell?.mobileNavigationOpen ? "Close navigation" : "Open navigation"} aria-controls="app-sidebar" aria-expanded={Boolean(shell?.mobileNavigationOpen)} onClick={shell?.toggleNavigation}><InboxIcon name="menu" /></button>
        <button type="button" className="inbox-sidebar-toggle" aria-label={shell?.sidebarCollapsed ? "Show sidebar menu" : "Hide sidebar menu"} aria-controls="app-sidebar" aria-expanded={!shell?.sidebarCollapsed} title="Toggle sidebar (Ctrl+B)" onClick={shell?.toggleNavigation}><InboxIcon name={shell?.sidebarCollapsed ? "menu" : "back"} /><span>{shell?.sidebarCollapsed ? "Show Menu" : "Hide Menu"}</span></button>
        <h1>Inbox</h1>
      </div>
      <div className="inbox-counters" aria-label="Inbox overview">
        {([
          ["all", "mail", "All conversations"],
          ["unassigned", "user", "Unassigned conversations"],
          ["pending", "clock", "Pending conversations"],
          ["resolved", "check", "Resolved conversations"],
        ] as const).map(([key, icon, label]) => (
          <button type="button" key={key} className={`inbox-counter inbox-counter-${key}`} aria-label={`${label}: ${counts[key] ?? "loading"}`} aria-pressed={metric === key} onClick={() => onSelect(key)} title={label}>
            <InboxIcon name={icon} /><span>{counts[key]?.toLocaleString() ?? "—"}</span>
          </button>
        ))}
      </div>
      <div className="inbox-workspace-account">
        <span className={`inbox-presence ${liveState === "connected" ? "inbox-presence-live" : ""}`} role="status" aria-label={liveState === "connected" ? "Live updates connected" : "Live updates reconnecting"} title={liveState === "connected" ? "Live updates connected" : "Live updates reconnecting"}><span /></span>
        <button type="button" className="inbox-header-refresh inbox-icon-button" aria-label="Refresh conversations and messages" title="Refresh inbox" disabled={refreshing} onClick={onRefresh}><InboxIcon name="refresh" /></button>
        <details className="inbox-header-disclosure">
          <summary className="inbox-header-action" aria-label="Inbox notifications" title="Inbox notifications"><InboxIcon name="bell" />{Boolean(counts.unread) && <span className="inbox-notification-dot" />}</summary>
          <div className="inbox-header-popover">
            <strong>Inbox updates</strong>
            <p>{counts.unread === null ? "Checking unread conversations…" : counts.unread === 0 ? "You're all caught up." : `${counts.unread} conversations have unread messages.`}</p>
            {Boolean(counts.unread) && <button className="text-action" type="button" onClick={(event) => { onSelect("unread"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>View unread conversations</button>}
          </div>
        </details>
        <details className="inbox-header-disclosure inbox-help">
          <summary className="inbox-header-action" aria-label="Inbox help" title="Inbox help"><InboxIcon name="help" /></summary>
          <div className="inbox-header-popover">
            <strong>Your shared inbox</strong>
            <p>Choose a channel, open a conversation and use Takeover to pause the chatbot. Press Enter to send, or Shift + Enter for a new line.</p>
          </div>
        </details>
        <details className="inbox-header-disclosure inbox-profile">
          <summary aria-label="Account menu"><span className="avatar inbox-account-avatar">{shell?.initials || "O"}</span><strong>{shell?.fullName || "Team member"}</strong><InboxIcon name="chevron" /></summary>
          <div className="inbox-header-popover">
            <Link href="/settings">Account settings</Link>
            <button type="button" onClick={() => void shell?.logout()}>Sign out</button>
          </div>
        </details>
      </div>
    </header>
  );
}
