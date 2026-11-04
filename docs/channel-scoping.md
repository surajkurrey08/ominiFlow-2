# Channel-specific flows and keywords

Create a flow by selecting its actual channel connection, for example a website
channel named BookMyVilla. Provider labels such as Web Chat are not a business
boundary. The Flow list displays the assignment and supports channel filtering.
An existing flow is assigned explicitly from its builder. New nodes and edits
retain the canvas, and copies retain their channel assignment.

Create a keyword by selecting its channel, match mode and flow or text reply.
The flow picker lists only that connection's flows. Changing channel clears the
flow selection. The same phrase can be configured independently on two channels.
Neither saving a keyword nor copying a flow creates configuration for another
website automatically.

Backend ownership checks reject foreign-workspace channels and mismatched flow
links. Matching, queued delivery and session start/resume repeat the scope check.
The inbound channel comes from the resolved connection, not a browser-supplied
website name. Old unassigned keywords and defaults do not apply globally.
Each channel must have an explicit matching default if a fallback is needed.
AI knowledge remains workspace-level; separate business AI knowledge is outside
this change and should be configured separately before enabling an AI fallback.

Migration `fc3d4e5f6071` adds nullable connection references and per-channel
uniqueness. Existing names, messages, rules, graphs and history are preserved;
no channels, flows or keywords are seeded, assigned or activated by the migration.
Legacy unassigned content remains visible with a Needs channel status. It cannot
automatically reply until the owner assigns a compatible channel/flow.
Downgrading requires an explicit data plan because channel-specific duplicate
phrases cannot safely be collapsed into the old global uniqueness rule.

Both list pages show at most 12 records per page, with search and channel filters.
Keywords retain status/action/match filters and table/cards views. Creation and
deletion use the shared AppDialog with keyboard focus and Escape behavior.
Long explanatory banners and decorative statistics are removed; validation,
permissions, retry and delivery-related errors remain visible.

Checks: backend channel-scope/keyword/flow tests use a PostgreSQL outer transaction
that rolls back all fixtures. Browser checks use synthetic APIs and cover two
independent Web Chat connections, flow choice reset, failed-save recovery,
channel-loading retry, responsive forms, and keyboard focus. They do not create
or assign production flows or keywords.
