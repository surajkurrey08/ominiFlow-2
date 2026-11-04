# Inbox reference implementation QA

Date: 2026-11-03

## Evidence and scope

- Source visual truth: the 1672 × 941 inline image attached to the user's
  “inbox same to same chahiye” message. This attachment is the source; there is
  no invented local source-image path.
- Implementation: `frontend/src/components/inbox/inbox-client.tsx`, rendered
  through the existing Next.js app with an isolated synthetic API.
- Desktop capture: `.cache/inbox-reference-desktop.png` (1672 × 941).
- Additional captures: `.cache/inbox-reference-laptop.png` (1276 × 664),
  `.cache/inbox-reference-mobile.png` (390 × 844).
- Browser evidence: `.cache/inbox-reference-verification.json`.
- Desktop CSS viewport: 1672 × 941, deviceScaleFactor 1. No browser frame,
  scaling, or density correction was applied. The inline source is evaluated
  as app content at its supplied pixel dimensions.
- State: Inbox, Suraj selected, AI mode, Open, Unassigned, Details visible,
  collapsed filters, three messages and an empty reply draft. The fixture
  mirrors the reference's content for comparison. Real application content
  remains API-driven. The selected conversation's unread badge clears when
  the existing mark-read action completes.
- Comparison: the supplied inline visual and browser-rendered capture were
  inspected for composition, then the conversation rows, message bubbles,
  composer, icons, and inspector were inspected in detail. No automated pixel
  diff or exported side-by-side source composite was available; this is a
  visual/product comparison, not a claim of pixel-identical reproduction.

## Findings and comparison history

1. **Resolved P1 — original layout did not match the supplied composition.**
   The previous screen had a second workspace header, excess top spacing,
   a dark navy shell, and no default right inspector. The replacement scopes
   a plum/purple shell to Inbox, uses one 82px header, and defaults to three
   panels at desktop widths. The final desktop capture shows the list starting
   at x252, thread at x656, inspector at approximately x1284, and panel bottoms
   at approximately y902, consistent with the reference's major regions.
2. **Resolved P2 — compact composer overflow.**
   The first browser pass measured a 369px footer inside a 366px space at
   1180 × 650. Reduced compact tool/action gaps. The final run reports no
   footer overflow at this viewport or the seven additional sizes below.
3. **Resolved P1 — reopening the selected chat on mobile stalled readiness.**
   Selecting the same ID reset messages and channel readiness without changing
   the selection effect dependency. Reopening now restores the thread without
   clearing that state. The final mobile back/list/reopen/send test passes.
4. **Resolved P2 — message and inspector type were too small on desktop.**
   Set message body to 16px/1.5 and desktop inspector tabs to 13px, retaining
   compact rules where necessary. The final desktop capture shows the intended
   message wrapping, readable tabs, and a composer beginning near y736.

No actionable P0/P1/P2 findings remain within this implementation scope.

## Required fidelity surfaces

| Surface | Evaluation |
| --- | --- |
| Fonts and typography | Retained the application's Geist family; matched hierarchy with bold Inbox/contact titles, semibold conversation names, 16px message bodies, and subordinate metadata. Long contact names truncate; message text wraps. The source does not supply a font name, so exact family identity remains an optical refinement. |
| Spacing and rhythm | Matched the major desktop column boundaries, compact top gap, 18px panels, rounded controls, shallow shadows, and large bottom composer. History, list, and inspector scroll independently. |
| Colors and tokens | Inbox-only tokens use plum navigation, vivid purple actions, lavender selected rows/outbound bubbles, white panels, pale borders, and semantic status colors. Existing sibling-page tokens remain intact. |
| Images and icons | Phosphor supplies interface icons; Simple Icons supplies provider marks. Real records do not expose reference portrait assets, so existing contact/account initials remain truthful data fallbacks. No invented customer photographs were added. |
| Copy and content | Labels and structure follow the reference. Counts, names, messages, dates, tags, and history use existing APIs. Email is visibly unavailable because the backend has no email provider. Notes displays existing notes content; pinning is explicitly local to the current view. |

## Interaction and responsive verification

The browser regression used synthetic records and sent no customer messages.
It passed:

- Header metrics, provider filters, status filter, search, and clearing search.
- Sidebar collapse/reopen and keyboard navigation between inspector tabs.
- Takeover/AI mode, shared assignee updates, history/automation tabs, and adding
  and removing persisted contact tags.
- Emoji, contact variables, quick replies, multiline reply, send, and approved
  template flow; these draft tools do not send automatically.
- Mobile inspector open/close and returning to the selected conversation.
- Uncertain-send protection, loading, empty results, service error and retry.
- Eight viewports: 1672 × 941, 1276 × 664, 1180 × 650, 1024 × 700,
  900 × 700, 390 × 844, 320 × 568, and 720 × 450. Document dimensions match
  the viewport, tested controls do not horizontally overflow, and composers
  remain within the viewport. History retains positive usable height.
- No browser page/runtime errors in the final run.

Supporting checks: 18 frontend inbox/realtime/contacts tests, 10 backend
conversation tests, targeted ESLint, TypeScript, production build, strict
premium audit (zero findings), and `git diff --check` passed. DESIGN.md lint
has zero errors and four advisory orphan-token warnings for semantic colors
that are documented and used in CSS rather than component YAML.

## Follow-up polish and limits

- P3: The source font family and custom brand symbol were not supplied as
  assets. The existing type family and closest library icon preserve the app's
  established implementation; exact brand asset substitution can be separate.
- Reference portraits and unsupported email behavior are intentionally not
  fabricated to make dynamic production data resemble the sample image.
- Verification covers synthetic API integration and rendering. Live provider
  delivery was not exercised during UI QA.

## Implementation checklist

- [x] Reference composition and compact top spacing implemented.
- [x] Existing APIs, tenant scoping, send safeguards, and stored text retained.
- [x] Responsive and primary interaction regressions resolved and recaptured.
- [x] Build, lint, meaningful tests, and design context checks completed.

## Shared sidebar follow-up

The user's subsequent sidebar consistency request expands the sidebar styling
to all authenticated workspace routes. `AppShell` now renders one shared logo,
icon set, menu order, account disclosure and collapse control. Inbox retains its
own content header and height ownership; sibling page bodies keep their layout.

Evidence: `.cache/sidebar-inbox.png` and `.cache/sidebar-dashboard.png` were
captured and inspected together at the same 1672 × 941 viewport. Both sidebar
crops are 242 × 941. Their only expected visual differences are the active link
and route/data state. `.cache/sidebar-mobile.png` records the narrow drawer.
`.cache/sidebar-consistency-verification.json` records computed-style and
interaction checks across Inbox, Dashboard, Contacts, Channels and Team.

Resolved P1: changing routes previously replaced the reference sidebar with the
legacy logo, letter icons, navigation order, width and selection color. Shared
`.app-shell-workspace` styles now own these properties on every route. The final
cross-route comparison confirms matching widths, padding, typography, icons,
labels and active treatment. The inbox count also loads on direct entry to a
sibling page and persists during navigation. Secondary active routes remain
reachable through More tools. Settings, sign out and legal links are available
from the same sidebar account disclosure on every workspace page.

Verification: five-route comparison, direct reload, desktop collapse/reopen and
persistence, active secondary route, 390px mobile drawer navigation/closing,
and account/legal access passed with no browser runtime errors. Targeted ESLint,
production build including TypeScript, strict static audit, DESIGN.md lint
(zero errors; the same four documented token warnings), and whitespace checks
also passed. No actionable P0/P1/P2 sidebar findings remain.

## Sidebar hide/show follow-up

Inbox now keeps a labelled desktop Hide Menu / Show Menu control beside the
title in both visibility states. This is an intentional addition requested
after the reference implementation. The hidden state was visually inspected
in `.cache/sidebar-hidden.png`: the sidebar is fully offscreen, the content
margin is zero, all three panels use the released width, and Show Menu remains
available. The existing saved preference and Ctrl+B behavior are preserved.

The isolated browser check passed hide/show, reload persistence, Ctrl+B,
header overflow checks at widths 1672, 1276, 1180, 1024, 900 and 768, and the
390px mobile drawer. Initial preview compilation exceeded the first navigation
timeout; the rerun completed successfully. Targeted ESLint, TypeScript, strict
static audit and whitespace checks passed. No runtime errors were observed.

## Compact density follow-up

The user's latest two screenshots establish a new request for smaller controls
and more visible content. This intentionally supersedes the initial reference's
larger density. Updated shared sidebar links to 40px and width to 184–220px;
Inbox header to 64px, conversation rows to 64px, contact header/toolbar to
74px/50px and reply composer to 112px. Message body is 14px/1.55. The closed
inspector layout caps the conversation list at 320px, preserving room for chat.
Short and mobile viewport rules retain bounded controls and independent scroll
ownership. No CSS zoom or whole-app scale is used.

Rendered evidence: `.cache/inbox-compact-desktop.png`,
`.cache/inbox-compact-laptop.png`, `.cache/inbox-compact-mobile.png`, and
`.cache/inbox-compact-enlarged-open.png` / `-hidden.png`. The enlarged captures
use a 1278 × 666 CSS viewport at deviceScaleFactor 1.5 (1917 × 999 image pixels),
representing the effective space and enlarged rendering in the supplied screen
images without claiming knowledge of the user's browser zoom setting. Both
sidebar states were inspected visually. Sidebar Settings is within the frame,
six full conversation rows fit, reply actions are reachable, and document and
tested control containers do not overflow.

At 1276 × 664, message-history height increased from 203px in the original
reference implementation to 327px. At the enlarged-capture viewport it is
329px with both sidebar states. Composer bottom is 643px within the 666px view.
Typography, purple palette, icon assets, stored text and action behavior are
retained; the changed size/spacing follows the latest explicit request.

`.cache/inbox-compact-verification.json` records all eight viewport checks plus
filters, tags, takeover, history, keyboard, reply/template, uncertain-send,
loading, empty, error and retry flows. No browser runtime errors occurred.
`.cache/inbox-compact-enlarged-verification.json` records density-specific
geometry checks. Production build including TypeScript, strict static audit,
DESIGN.md lint (zero errors and the same four advisory warnings), and whitespace
checks passed. No actionable P0/P1/P2 compact-layout findings remain.

## Templates cleanup and top placement

Date: 2026-11-04. The user supplied the existing Templates screen and requested
a UI cleanup, then explicitly asked for the search/sync/filter/create toolbar
and both creation cards above the library. That correction is the final layout
contract. Both creation shortcuts remain compact and functional; long library
descriptions, repeated preview labels and the inactive settings control are
removed. Technical names and variable counts are disclosed under Details.

The inline user screenshots are the source of the requested order and cleanup,
not a requirement to retain the former oversized cards or green accent.
Implementation captures `.cache/templates-desktop.png` (1672 × 941),
`.cache/templates-laptop.png` (1278 × 666), and
`.cache/templates-mobile.png` (390px CSS width, full document) were inspected.
Desktop/laptop captures use deviceScaleFactor 1, without density correction.
The desktop and laptop views show search and action buttons above the compact
creation cards, followed by Library / My templates and the template content.
The narrow layout stacks controls without horizontal overflow.

Fidelity surfaces: retained Geist and the existing purple workspace accent;
used 12–14px controls/body text, 13px card corners and compact spacing. Replaced
decorative emoji in the library with existing Phosphor icons. No new raster
assets are needed. Stored message bodies and provider error/status information
remain intact; library examples are no longer mislabelled pre-approved. Credits
remain visible, and required sample values gate submission.

Resolved P1: actions previously followed the entire library. They now precede
both content views, verified by DOM order and screenshot. Resolved P2: saved
template Filter and page settings controls had no behavior; Filter now opens
the active view's filters, while the inactive settings control is removed.
Resolved P1: delete failure feedback was initially outside the blocking dialog;
the final browser pass confirms an in-dialog error and a successful explicit
retry. Preview, sync, delete and AI use the native AppDialog owner for focus,
Escape, background isolation and focus restoration. At 320 × 568, the AI dialog
measures 288 × 346, with no inner horizontal overflow.

Verification evidence: `.cache/templates-verification.json` records eight
viewport checks (1672 × 941, 1278 × 666, 1180 × 650, 900 × 700, 768 × 700,
390 × 844, 320 × 568 and 720 × 450) and passing library search/category/clear,
metadata, sample validation/submission, draft navigation, saved filters/search,
preview focus/Escape, delete cancel/failure/retry, sync, AI generation,
empty/error/retry, disconnected-channel and admin validation flows. No runtime
errors occurred. `.cache/templates-toolbar-dialog-check.mjs` additionally
verifies Library's top Filter/Sync controls and narrow dialog focus behavior.
All submissions, deletions and AI operations used synthetic API fixtures.

Production build including TypeScript, targeted ESLint of changed components,
six template-proxy tests, design-context lint (zero errors; four documented
advisory token warnings), and whitespace checks passed. The static auditor's
contract/source checks were run against the four changed template/dialog
components through its API because CLI sourceRoots accepts directories only;
`.cache/templates-premium-audit.json` records the exact source-file scope and
zero findings. A broader templates-directory lint also found three existing
errors and four warnings in the unmodified template-editor.tsx; these are not
reported as a passing whole-directory lint. Its draft navigation was exercised
in the browser, and the production build succeeds.

## Local session outage

The later dashboard screenshot displayed the proxy's temporary refresh error.
Port 8000 refused connections and Docker Desktop was stopped. Started the
installed Docker Desktop, existing omniflow-postgres / omniflow-redis containers
and FastAPI on 127.0.0.1:8000. API and database health endpoints returned 200.
The refresh endpoint answered 401 for a synthetic invalid credential, confirming
it was reachable; no real user refresh credential was inspected or used. The
user's authenticated browser session still needs a refresh, with sign-in if its
stored session has expired. Authentication/authorization code was not changed
for this operational outage.

## Twelve templates per page

The latest request limits each Templates view to 12 items. The library slices
its filtered results into 12-item pages and places range, page and Previous /
Next controls below the grid. Search/category changes reset pagination, and
out-of-range pages clamp to the available result count. Page navigation focuses
and scrolls to the result region. Saved templates now request page_size=12 from
the existing server API, using the same shared page-size constant.

`.cache/templates-pagination-verification.json` records passing 13-item library
pagination (12 + 1), 25-item library pagination (12 + 12 + 1), first/last disabled
controls, footer placement below the last card, filter/clear page reset, result
focus, 320px layout and saved-template paging with page_size=12. Screenshots are
`.cache/templates-pagination-last.png` and `.cache/templates-pagination-mobile.png`.
The isolated browser run observed no runtime errors and changed no real records.
Targeted ESLint, TypeScript and whitespace checks passed.

final result: passed
