---
version: alpha
name: Omniflow workspace
description: A quiet conversation workspace for teams managing customer messages.
colors:
  primary: "#4f46ff"
  background: "#f7f8fc"
  surface: "#ffffff"
  ink: "#172033"
  muted: "#687386"
  border: "#e5e8ef"
  selected: "#efefff"
typography:
  sans:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
  mono:
    fontFamily: "Geist Mono, monospace"
rounded:
  DEFAULT: "8px"
  panel: "12px"
spacing:
  panel: "20px"
  control-gap: "8px"
components:
  inbox: {}
  button: {}
  select: {}
---

# Omniflow workspace design

## Overview

Product register: agents scan customer conversations, read messages, and reply.
The reference is a familiar support inbox: a stable message list beside a quiet
conversation canvas. The current user requested fewer duplicate labels and more
space for the actual chat. Preserve the existing navy navigation and indigo
identity; this is an inbox refinement, not an application rebrand.

The interface is English; customer names and messages may use any language.
No Japan-specific market or localization requirements are established.
The primary usage is repeated desktop work with a single-pane mobile alternative.

## Colors

Runtime CSS remains canonical (Model B). `frontend/src/app/globals.css` owns the
existing application styles and the inbox's scoped `--inbox-*` variables. The
palette above mirrors those variables; it does not generate a second theme.
Primary maps to `--inbox-accent`, background to `--inbox-wash`, and the remaining
roles map to their corresponding `--inbox-*` names. No shared shell colors change.

Use indigo for the send action and selection. Use muted neutral colors for
metadata; errors and send uncertainty retain their existing semantic tones.

## Typography

Retain Geist through the existing root layout font variables. Conversation names
use normal letter spacing, 13–14px semibold text. Message text is 13px with 1.6
line height. Metadata is subordinate, with full timestamps in accessible titles.
Do not uppercase customer names or decorate actions with emoji.

## Layout

The inbox's existing viewport workspace owns its bounded height. The list and
message history scroll independently; the composer stays below the thread.
Default to two columns. Contact information is optional and occupies a third
column only at 1280px and above. On narrow screens, use the existing conversation
selection/back flow. Other routes keep their established document scrolling.

## Elevation & Depth

Borders separate the list, toolbar, thread, and composer. Only a restrained panel
shadow and selected mode control receive elevation. No decorative gradients.

## Shapes

Use 8px controls, 12px panels and message bubbles, and round contact initials.
Message direction is indicated by alignment and restrained bubble color.

## Components

Use one reply-mode switch, one status selector, and one assignee selector. Do not
repeat the mode in banners or inspector paragraphs. Filters use native details;
native select popups remain platform-owned. Existing API methods, validation,
permissions, loading, errors, pagination, and send protections retain ownership.
Icons use consistent 18px stroke SVGs with named buttons. Busy and disabled actions
keep their dimensions. Preserve visible focus and reduced-motion preferences.
Inbox scrollbar tokens are scoped to the requested route; this does not migrate
the rest of the application's scrollbar system.

## Do's and Don'ts

- Do keep the message body and reply action visually dominant.
- Do retain meaningful connection, delivery, failure and safety feedback.
- Do disclose secondary contact information and filters on demand.
- Don't repeat phone numbers, mode explanations, or status pills in every area.
- Don't change messaging, automation, authentication or unrelated page logic.
