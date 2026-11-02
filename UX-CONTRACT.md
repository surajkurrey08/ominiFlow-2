# Workspace UX contract

This records the inbox refinement and the existing owners it reuses. It does not
authorize a migration of other application screens.

## Product context and sources

English customer-support workspace. Preserve customer-entered text and names.
Dates follow the existing browser locale/timezone formatting. Target accessible
native controls, clear focus and responsive reflow.

Business behavior is owned by `backend/app/api/conversations.py`,
`backend/app/services/outbound_message_service.py` and the matching contracts in
`frontend/src/lib/api/inbox.ts`. `README.md` identifies the multi-tenant platform.
The screenshot and current user request establish the visual cleanup scope.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in inbox-client.tsx | Existing options and handlers; platform-owned popup | Filters, assignee, status, templates | Browser keyboard and open-popup checks |
| Form | Existing inbox sendReply/sendTemplate handlers | frontend/src/components/inbox/inbox-client.tsx | Text reply and approved template | Existing tests and isolated browser fixture |
| Scrollbar | frontend/src/app/globals.css | DESIGN.md and scoped inbox CSS | Conversation list, history, inspector | Overflow measurements and browser screenshots |
| Toast | Existing inline live regions | Inbox errors and status feedback | Loading, error, connection state | Failure and loading preview |
| CRUD | frontend/src/lib/api/inbox.ts | Backend conversation and outbound contracts | Read, reply, assignment, status, mode | Existing inbox tests; fixture interactions |

## Visual contract

`DESIGN.md` mirrors the existing CSS source; the inbox palette is scoped to that
route. Native selectors deliberately retain OS-owned option popups. The shared
shell and other routes retain existing layout and controls.

## Navigation and dataset state

Keep conversation selection in the existing URL query parameter. Keep paging,
filter resets, stale-response guards and list ordering unchanged. Search remains
explicit-submit, matching the existing workflow; clear immediately resets the
query and returns focus. Filters can be collapsed without losing their values.
Mobile back returns to the same conversation list. Contact details are optional.

## Mutations and recovery

Retain the existing send guards, idempotency keys and uncertain-send protection.
Retry still requires an explicit confirmation after checking message delivery;
its presentation is an inline disclosure instead of a browser confirmation.
Do not remove delivery failures, disconnected-channel guidance or permission
errors as part of removing decorative text. No networking or authorization
behavior changes are part of this UI task.

## Verification

Run inbox/proxy/realtime unit checks, TypeScript, targeted ESLint, production
build, and the premium static audit scoped to this changed workflow. Use the real
Next.js route with an isolated fixture backend for desktop/mobile, inspector,
filters, compose, empty, loading and error states. Compare shared navigation with
the existing contacts screen. The fixture never sends real customer messages.
