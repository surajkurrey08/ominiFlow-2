# Channel conversation assistant

This feature is configured in **AI Chatbot → Channel Assistant**, not by editing
website code. Each actual channel connection has its own knowledge, instructions,
default flow and unavailable reply. No global business profile or another
channel's documents are injected into a customer conversation.

## Rollout

1. Deploy backend and run `alembic upgrade head`; restart the flow-delivery worker.
2. Deploy frontend. Existing routing and flows retain their behavior by default.
3. Configure and validate the existing AI provider under API Providers. The key
   stays encrypted on the backend. Ensure AI credits are available.
4. Select a channel in Channel Assistant. Enter verified knowledge and optional
   reply instructions. Select **AI assistant**, select the same channel's default
   flow, and enable **Understand free-text replies during flows**. Save settings.
5. Test normal sentences, English/Hindi/Marathi/Roman text, missing details,
   questions during an enquiry, thanks, unavailable AI and human handover.

The default flow handles free-text first messages; keyword triggers still take
precedence. A structured interpretation selects only contiguous conversational
options and captures only allowed fields on that branch. Details already present
in the current message can be saved together; missing questions remain pending.
Questions and acknowledgements do not become dates/names/budgets. The existing
flow snapshot protects in-progress conversations from graph edits. Newly changed
channel knowledge/instructions apply to the next interpreted turn.

The flow must contain the desired language branches. `Hindi`, `हिंदी`, `Marathi`
and `मराठी` match language options without requiring AI. Other accepted option
spellings can be edited in the button's **Other accepted replies** field. Use
`menu`/`language` restart keywords to change the flow's language branch mid-enquiry.
General AI answers follow the selected conversation language.

## Boundaries

- AI runs in the worker, not the inbound webhook transaction, with bounded
  history, output, timeout and no automatic provider retries.
- Only this tenant/channel's configuration and conversation history are used.
- AI cannot jump to payments, external APIs, tags or integration nodes. It cannot
  select a review containing collected variables; confirmations need an explicit
  number/title. Mark other confirmation menus **Require an explicit option
  selection**. Long sentences containing an option's title are not treated as
  exact confirmations, especially when they might negate it.
- Human mode stops automated replies. An explicit human request switches mode;
  it does not guarantee that an agent is online or assign an agent automatically.
- Provider faults, missing credentials, refusals, malformed decisions and zero
  credits produce the channel's unavailable reply and preserve the pending step.
  A human request can still be handled without a paid provider call.
- No live property/gym inventory or booking API was added. Prices, stock,
  availability, refunds and actual bookings require verified integrations or
  team confirmation. Entered knowledge is not a live inventory feed.
- This is a bounded flow assistant, not an autonomous agent. Arbitrary flow
  redesign, jumping between unrelated steps and automatic knowledge crawling are
  outside this feature. The existing document-library preview remains separate;
  channel knowledge is edited directly in the new form.

Provider structured-output request format follows the existing Chat Completions
integration and [OpenAI's API reference](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create).
Model responses are validated again on the server before changing flow state.
