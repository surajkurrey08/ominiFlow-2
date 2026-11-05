---
version: alpha
name: Omniflow workspace
description: A quiet conversation workspace for teams managing customer messages.
colors:
  primary: "#6017ff"
  background: "#fcfbff"
  surface: "#ffffff"
  ink: "#171426"
  muted: "#777b9b"
  border: "#e9e8f5"
  selected: "#eee4ff"
typography:
  sans:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
  mono:
    fontFamily: "Geist Mono, monospace"
rounded:
  DEFAULT: "11px"
  panel: "18px"
spacing:
  panel: "20px"
  control-gap: "8px"
components:
  inbox: {}
  templates: {}
  button: {}
  select: {}
---

# Omniflow workspace design

## Overview

Product register: agents scan customer conversations, read messages, and reply.
The visual source is the user's purple three-column inbox reference supplied on
2026-11-03: dark plum navigation, one overview header, channel-first conversation
list, white chat canvas with lavender outbound messages, and a contact inspector.
Match that composition while retaining real customer data and existing actions.
The plum sidebar, purple selection, logo, icons, menu order and account menu
are shared across authenticated workspace routes through `.app-shell-workspace`.
Inbox content styling remains scoped to `.app-shell-inbox`; sibling page content
retains its established layout and scrolling.
The interface is English; customer names and messages may use any language.
The Channel Assistant form uses the shared channel selector and modal behavior,
native option popups, inline save/error status and the existing purple controls.
It edits one channel at a time; long knowledge textareas own their local overflow
while the settings page retains normal document scrolling.
No Japan-specific market or localization requirements are established.
The primary usage is repeated desktop work with a single-pane mobile alternative.

## Colors

Runtime CSS remains canonical (Model B). `frontend/src/app/globals.css` owns the
existing application styles and the inbox's scoped `--inbox-*` variables. The
palette above mirrors those variables; it does not generate a second theme.
Primary maps to `--inbox-accent`, background to `--inbox-wash`, and the remaining
roles map to their corresponding `--inbox-*` names. The shared sidebar owns
`--workspace-accent` and `--workspace-sidebar-width`; the inbox accent references
that shared accent. Runtime CSS remains the single value owner.

Use vivid purple for primary actions and selection. Use muted neutral colors for
metadata; errors and send uncertainty retain their existing semantic tones.

## Typography

Retain Geist through the existing root layout font variables. Conversation names
use normal letter spacing and semibold text. Message text is 14px with 1.55
line height. Metadata is subordinate, with full timestamps in accessible titles.
Do not uppercase customer names or decorate actions with emoji.

## Layout

The inbox owns its viewport height. At 1180px and above, default to three panels:
approximately 26% conversations, flexible chat, and 26% contact details. The
shared workspace sidebar is 184–220px wide. A single 64px overview header replaces the
usual app breadcrumb on this route. Its counters use server totals and filter
the conversation list. The details panel can be closed and reopened.

Below 1180px, contact details open over the workspace on request. Below 1024px,
show the selected conversation or list with an explicit back action. Below 768px,
use the existing mobile navigation drawer. Header, list, history, composer and
inspector keep independent height/scroll ownership; the document does not scroll.
Sparse histories begin near the thread toolbar, as in the reference. Overflowing
histories open at the latest message and retain the reader's position on updates.
Other application routes keep their existing document scrolling.
The compact density uses 40px sidebar links, 64px conversation rows, a 74px
contact header, 50px thread toolbar and 112px reply composer. The list is capped
at 320px when contact details are closed so hiding the sidebar benefits the chat.
Short-height layouts compact further. Use real padding and type sizing; do not
scale the application with CSS zoom or transforms. Enlarged browser rendering
must retain visible controls and independently scrollable message history.

## Elevation & Depth

Borders separate the list, toolbar, thread, and composer. Use restrained borders and shallow control shadows. The purple selected
navigation and plum sidebar may use the subtle surface gradients in the reference.

## Shapes

Use 11px controls, 18px panels, 15px message bubbles and round contact initials.
Message direction is indicated by alignment and restrained bubble color.

## Components

The Templates page places search, refresh, Meta sync, filters and creation actions
at the top, followed by compact Create with AI / Create new template shortcut
cards as explicitly requested. Library / My templates views follow these actions.
Remove long onboarding descriptions, empty settings controls and decorative
preview labels. Library cards prioritize title,
message body and actions; technical template names and variable counts are
disclosed under Details. Category chips and search filter the library locally.
Saved templates retain server-backed filters, paging, status and row actions.
Both views show a maximum of 12 templates per page, with Previous / Next and
the current page below the results. Library filters reset its page to 1.
Use the shared purple accent and 12–14px text rather than a separate green theme.
This page scrolls naturally; it does not inherit Inbox's fixed-height frame.

`AppDialog` owns native modal behavior for template previews, synchronization,
deletion and AI generation: focus containment, Escape, return focus, background
isolation and a bounded scrolling surface. Preserve meaningful status, failure,
credit usage, disconnected-channel guidance and destructive-action confirmation.
Reusable library examples are not labelled pre-approved; approval remains a
provider result. Required variable samples must be supplied before submission.

`AppShell` owns one sidebar for all workspace pages, including nested routes.
Only active links and live counts change with route/data. Secondary destinations
remain in More tools, which opens for an active secondary route. The bottom
account disclosure retains settings, sign out and legal links. Desktop collapse
persists across routes; mobile navigation closes after following a link.
Inbox also exposes a visible Hide Menu / Show Menu button beside its title on
desktop, so collapsing never requires finding the footer control. The expanded
state is announced and the button remains available after the sidebar hides.

One AI/Human mode switch and Takeover action own reply mode. The thread and
inspector expose the same assignment/status actions. Inspector tabs use the ARIA
tab keyboard pattern; filters and small menus use native disclosures. Native
select popups remain platform-owned. Contact tags use the existing Contacts and
Tags APIs. History is paginated; Notes displays the existing notes custom-field
value if present, rather than claiming a separate notes persistence service.

Use Phosphor for interface icons and Simple Icons for provider marks. Account and
contact initials remain the fallback when the data does not include a photo;
never fabricate customer portraits. Busy/disabled actions retain their dimensions.
Reply tools insert emoji, preset text and real contact values into the draft.
Media uses the existing approved-template flow. Sending still requires the
existing explicit send action, validation and idempotency protections.

Inbox scrollbar tokens remain scoped to this route. Preserve visible keyboard
focus, reduced motion and forced-colors operation. A latest-messages shortcut
appears while reading older history. Resizing media/composer follows the bottom
only when the reader is already near it. Pinning is local to the current inbox
view; it does not claim a persisted conversation favorite.

## Do's and Don'ts

Flow creation selects one actual channel connection, by name, through the shared
ChannelConnectionSelect. Provider type is derived from that connection rather
than used as a substitute for website ownership. The builder and list expose the
assignment; existing unassigned content remains visible and needs explicit
assignment. Keyword forms require a channel and show flows only from that same
connection. Changing the keyword channel clears its selected flow. Channel and
flow loading failures preserve drafts and provide retry. AppDialog owns both
creation forms; native select popups remain platform-owned.

Flow and Keyword lists share a compact white table surface, short headings,
purple primary actions, channel filters and bottom pagination (12 per page).
Keywords retain Table/Cards and secondary filters without decorative KPI cards,
long onboarding text or priority explanations. Row channel and status remain
visible, including Needs channel for legacy records. Header action labels stay
on one line with matching heights; controls can wrap as a group on narrow views.

Website connection uses the existing Channels controls and shared AppDialog.
Create Web Chat collects a website name and origin, then immediately displays
Frontend URL, Backend URL and the generated Public widget key with Copy controls.
Users paste these values into their website admin plugin and enable chat there.
The public key is masked with a Show/Hide action; copying includes its full value.
Service URLs come from platform configuration, never a guessed localhost address.
The same settings reopen from each channel card without creating a new key.
No authorization popup or connector route is required for this manual setup.
Readiness and stored visitor activity remain distinct; copying is not delivery.

- Do keep the message body and reply action visually dominant.
- Do retain meaningful connection, delivery, failure and safety feedback.
- Do show desktop contact details by default and disclose filters on demand.
- Don't hard-code counters, portraits, tags or past conversations to match a mockup.
- Don't change messaging, automation, authentication or unrelated page logic.
