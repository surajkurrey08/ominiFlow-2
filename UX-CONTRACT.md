# Workspace UX contract

This records the inbox refinement, shared workspace navigation, and their
existing owners. Sibling page content retains its own layout and behavior.

## Product context and sources

English customer-support workspace. Preserve customer-entered text and names.
Dates follow the existing browser locale/timezone formatting. Target accessible
native controls, clear focus and responsive reflow.

Business behavior is owned by `backend/app/api/conversations.py`,
`backend/app/services/outbound_message_service.py` and the matching contracts in
`frontend/src/lib/api/inbox.ts`. `README.md` identifies the multi-tenant platform.
The latest user-supplied three-column screenshot establishes the reference matching scope.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Navigation | Shared AppShell | app-shell.tsx and shared workspace CSS | Active route, desktop collapse, mobile drawer, account disclosure | Cross-route browser comparison and narrow navigation |
| Modal | AppDialog | Native dialog with shared CSS | Template preview, sync, delete confirmation, AI generator and website connection | Focus, Escape, scroll and return-focus browser checks |
| Website setup | WebChatSetupDialog / channels browser client | Tenant-scoped web_chat_pairing_service and public platform configuration | Create website channel, copy plugin values, reopen settings, check activity | Backend setup/settings tests, channel proxy tests and isolated browser workflow |
| Template management | TemplatesClient / PlatformTemplateLibrary | Existing templates browser clients and backend template APIs | Library draft/submit, saved list/filter/sync/delete | Isolated browser fixture and template proxy tests |
| Select/Listbox | Native controls in Inbox and Templates | Existing options and handlers; platform-owned popup | Filters, assignee, status, template category/channel | Browser keyboard and open-popup checks |
| Form | Existing Inbox, Templates and Web Chat handlers | inbox-client.tsx, TemplatesClient, PlatformTemplateLibrary and WebChatSetupDialog | Reply, template samples, library admin, AI drafts and website setup | Existing tests and isolated browser fixture |
| Channel routing | ChannelConnectionSelect and flow/keyword forms | channel_scope_service plus validated actual connection IDs | Create, assign legacy flow, filter list, select same-channel flow | Channel isolation DB tests, proxy tests and synthetic browser fixture |
| Channel assistant | ChannelAssistant, ChannelConnectionSelect and AppDialog | routing_config API, channel_assistant_service and guarded flow engine | Channel knowledge, default flow, opt-in free-text replies, instructions, unavailable reply | Assistant boundary tests, native select, save/error/conflict/dirty-state browser checks |
| Scrollbar | frontend/src/app/globals.css | DESIGN.md and scoped inbox CSS | Conversation list, history, inspector | Overflow measurements and browser screenshots |
| Toast | Existing inline live regions | Inbox errors and status feedback | Loading, error, connection state | Failure and loading preview |
| CRUD | frontend/src/lib/api/inbox.ts and existing Contacts/Tags browser clients | Backend conversation and outbound contracts | Read, reply, assignment, status, mode | Existing inbox tests; fixture interactions |

## Visual contract

`DESIGN.md` mirrors the existing CSS source; the inbox palette is scoped to that
route. Native selectors deliberately retain OS-owned option popups. All workspace
routes share the same sidebar logo, icons, order, width, selection treatment and
account controls. Inbox alone owns its bounded content height and custom header.
Other routes retain their existing page content, headers and document scrolling.
Desktop sidebar visibility is controlled from the page header as well as the
sidebar footer. Inbox keeps Hide Menu / Show Menu available in both states;
the toggle announces its expanded state and references the shared sidebar.
Hiding releases the sidebar's content margin and persists the existing local
preference. Mobile uses the labelled menu button and closes on navigation.
The latest compact-density request reduces shared sidebar link heights and
Inbox header/list/composer spacing through CSS sizing, with no whole-app zoom
or transform. At a 1278 × 666 effective desktop viewport, all main sidebar links
through Settings remain visible, at least six conversation rows fit, and chat
history and reply actions remain available with the sidebar open or hidden.

## Navigation and dataset state

Keep conversation selection in the existing URL query parameter. Keep paging,
filter resets and stale-response guards. A pinned conversation moves to the top of the current view; other conversations retain API order. Search remains
explicit-submit, matching the existing workflow; clear immediately resets the
query and returns focus. Filters can be collapsed without losing their values.
Mobile back returns to the same conversation list. Contact details default open on desktop (1180px+), and open on request as an overlay on smaller screens.
Message dates use local calendar-day dividers; each bubble shows its local clock
time and retains the full timestamp in its title. History resize follows the
bottom only while the reader is near it. Reading older messages preserves scroll
position and offers a keyboard-accessible latest-messages shortcut. Loading an
older page retains the visible message position. Customer text is displayed as
stored; this presentation change does not rewrite message data.

## Mutations and recovery

Flow and keyword creation require an actual channel connection in the owning
workspace. No channel is automatically selected. Keyword flow choices exclude
other channels and unassigned flows, including when they share a provider type.
Changing a keyword channel resets the flow choice. The backend validates the
same invariant independently of the browser and again before queued delivery,
flow start and resume. A channel's missing keyword/default never inherits an
unassigned global rule. Older content remains unassigned without automatic data
creation or reassignment. Binding an existing flow happens explicitly in its
builder; active or referenced flows cannot be silently moved to another channel.
Channel select geometry and keyboard behavior remain native. Shared loading,
error, retry, focus containment and Escape conventions apply to both forms.

Retain the existing send guards, idempotency keys and uncertain-send protection.
Retry still requires an explicit confirmation after checking message delivery;
its presentation is an inline disclosure instead of a browser confirmation.
Do not remove delivery failures, disconnected-channel guidance or permission
errors as part of removing decorative text. Provider tabs add the enumerated `channel_type` filter through the existing inbox proxy and conversation-list API. The service scopes the channel subquery to the current tenant. Existing permission checks remain authoritative.

## Verification

AI Configuration → Channel Assistant preserves drafts when switching its tabs.
Channel changes, reload and link navigation use AppDialog before discarding edits;
browser unload uses the browser lifecycle warning. Native select popups follow the
existing OS-owned contract. Save uses the routing row's version timestamp and
retains edits on errors/conflicts. Channel knowledge is separate from the global
Business Profile and from the existing document-library preview. Runtime policy
and validation live in `backend/app/api/routing_config.py` and
`backend/app/services/channel_assistant_service.py`; credit accounting continues
through `payment_service.py`. AI is opt-in per channel, not enabled by migration.

Run inbox/proxy/realtime unit checks, TypeScript, targeted ESLint, production
build, and the premium static audit scoped to this changed workflow. Use the real
Next.js route with an isolated fixture backend for desktop/mobile, inspector,
filters, compose, empty, loading and error states. Compare shared navigation with
the existing contacts screen. The fixture never sends real customer messages.

## Reference-specific controls

Overview cards fetch actual all/unassigned/pending/resolved totals; unread counts
come from the same tenant-scoped listing. Email is shown unavailable while no
email integration exists. Provider tabs do not invent unsupported API providers.
Contact tags persist through the existing contact-tags endpoint. Previous
conversations use the existing contact-conversation pagination. Notes displays
existing custom-field content only. AI/Human controls and takeover share the
existing conversation-mode mutation. Contact variables and quick replies only
edit the draft. Avatar initials represent missing photos honestly.

## Template management

Website connections remain on Channels and use AppDialog with a website name and
origin form. Validation preserves inputs and focuses the first invalid field.
After saving, display the existing channel key immediately and load platform URLs
through the authenticated widget-settings endpoint. Reading/copying settings never
generates a pairing token, opens a popup, rotates the key or requires approval.
Only channel readers in the owning tenant can retrieve plugin configuration.
Copy feedback never repeats values; denied clipboard access selects the visible
field for manual copying. URL failures preserve the created channel/key and offer
retry instead of requiring another channel creation. Escape and Close return focus.
Check chat activity reads persisted visitor messages; manual installation becomes
Active without a pairing receipt once a visitor message arrives. Existing pairing
endpoints remain compatible, but are not part of this user-requested setup flow.

Top search, refresh, sync, filters and both creation shortcuts appear before the
Library / My templates view switch. Switching
views retains each view's search/filter state. Shared Library search is local;
saved-template search remains debounced, stale-response guarded and immediately
clearable. The Filter button opens real filters. Existing editor routes and
sessionStorage draft contract remain canonical for new/duplicate/library drafts.
Template submission still requires a connected channel and all variable samples;
the explicit confirmation uses the existing Meta submission API. UI cleanup does
not submit, approve, deactivate or delete production templates automatically.
Delete retains confirmation, focuses Cancel, blocks duplicate requests, and
reports failures inside the dialog. Failed synchronization and generation remain
visible and actionable. No essential failure, provider status or credit feedback
is removed as unwanted text.
Both template views show at most 12 items per page. Library paging follows its
local category/search results and resets to page 1 on filter changes; saved
templates use the existing server pagination with page_size=12. Bottom Previous
and Next controls disable at boundaries. Explicit library page changes focus
and scroll to the results, while view switches retain each view's state.
