"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowsClockwiseIcon, FunnelIcon, LightningIcon, MagnifyingGlassIcon, PlusIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import { AppDialog } from "@/components/app-dialog";
import { useRouter } from "next/navigation";
import { useCreditBalance } from "@/lib/credits/use-credit-balance";
import { AiTemplateModal, AI_TEMPLATE_DRAFT_KEY } from "@/components/templates/ai-template-modal";
import { PlatformTemplateLibrary } from "@/components/templates/platform-template-library";

import {
  TemplateApiError,
  TEMPLATE_PAGE_SIZE,
  getTemplate,
  listTemplates,
  syncTemplates,
  deleteTemplate,
  type AiTemplateDraft,
  type MessageTemplate,
} from "@/lib/templates/browser";
import { listChannels, type ChannelConnection } from "@/lib/channels/browser";

const PAGE_SIZE = TEMPLATE_PAGE_SIZE;
const STATUS_OPTIONS = ["draft", "submitted", "pending", "approved", "rejected", "paused", "disabled", "failed"] as const;
const CATEGORY_OPTIONS = ["marketing", "utility", "authentication"] as const;
const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

type Notice = { kind: "success" | "error"; text: string } | null;

const STATUS_TONE: Record<string, string> = {
  approved: "channel-pill-ok",
  pending: "channel-pill-warn",
  submitted: "channel-pill-warn",
  draft: "channel-pill-muted",
  rejected: "channel-pill-bad",
  paused: "channel-pill-muted",
  disabled: "channel-pill-muted",
  failed: "channel-pill-bad",
};

function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

// Render text with {{placeholders}} visually highlighted.
function renderWithPlaceholders(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE);
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={last}>{text.slice(last, match.index)}</Fragment>);
    parts.push(<mark className="tpl-var" key={`${match.index}-v`}>{match[0]}</mark>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={last}>{text.slice(last)}</Fragment>);
  return parts;
}

function uniquePlaceholders(template: MessageTemplate): string[] {
  const found = new Set<string>();
  for (const component of template.components) {
    const text = typeof component.text === "string" ? component.text : "";
    for (const m of text.matchAll(PLACEHOLDER_RE)) found.add(m[1]);
  }
  return [...found];
}

interface Part { header?: Record<string, unknown>; body?: Record<string, unknown>; footer?: Record<string, unknown>; buttons: Record<string, unknown>[]; }

function splitComponents(template: MessageTemplate): Part {
  const part: Part = { buttons: [] };
  for (const component of template.components) {
    const kind = String(component.type ?? "").toUpperCase();
    if (kind === "HEADER") part.header = component;
    else if (kind === "BODY") part.body = component;
    else if (kind === "FOOTER") part.footer = component;
    else if (kind === "BUTTONS" && Array.isArray(component.buttons)) part.buttons = component.buttons as Record<string, unknown>[];
  }
  return part;
}

export function TemplatesClient() {
  const router = useRouter();
  const creditBalance = useCreditBalance();
  const [aiOpen, setAiOpen] = useState(false);
  const [view, setView] = useState<"library" | "mine">("library");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [libraryFiltersOpen, setLibraryFiltersOpen] = useState(true);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const loadRequest = useRef(0);
  const detailRequest = useRef(0);

  function useAiDraft(draft: AiTemplateDraft) {
    try {
      sessionStorage.setItem(AI_TEMPLATE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage may be unavailable; the editor just starts blank.
    }
    setAiOpen(false);
    router.push("/templates/new");
  }
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [detail, setDetail] = useState<MessageTemplate | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncChannel, setSyncChannel] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(template: MessageTemplate) {
    if (deletingId) return;
    setDeletingId(template.id);
    setNotice(null);
    try {
      await deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setDeleteTarget(null);
      if (templates.length === 1 && page > 1) setPage((current) => current - 1);
      if (detail?.id === template.id) {
        detailRequest.current += 1;
        setDetail(null);
      }
      setNotice({ kind: "success", text: `Template "${template.name}" deleted successfully.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof TemplateApiError ? error.message : "Failed to delete template.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  const channelsById = useMemo(() => {
    const map = new Map<string, ChannelConnection>();
    for (const c of channels) map.set(c.id, c);
    return map;
  }, [channels]);
  const whatsappChannels = useMemo(() => channels.filter((c) => c.channel_type === "whatsapp"), [channels]);
  const connectedWhatsApp = useMemo(() => whatsappChannels.filter((c) => c.status === "connected"), [whatsappChannels]);
  const hasActiveFilters = Boolean(search || channelId || status || category || language);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await listTemplates({
        page, page_size: PAGE_SIZE,
        channel_id: channelId || undefined,
        status: status || undefined,
        category: category || undefined,
        language: language || undefined,
        search: search || undefined,
      });
      if (request !== loadRequest.current) return;
      setTemplates(result.items);
      setTotal(result.total);
    } catch (error) {
      if (request === loadRequest.current && !(error instanceof TemplateApiError && error.status === 401)) setLoadError(true);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [page, channelId, status, category, language, search]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
    return () => { loadRequest.current += 1; };
  }, [load]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const result = await listChannels({ page: 1, page_size: 100, channel_type: "whatsapp" });
        setChannels(result.items);
      } catch {
        // Channel list is only used for labels/filters; failure is non-fatal.
      }
    });
  }, []);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function changeFilter(setter: (v: string) => void, value: string) {
    setPage(1);
    setter(value);
  }

  async function openDetail(template: MessageTemplate) {
    const request = ++detailRequest.current;
    setDetail(template);
    try {
      const fresh = await getTemplate(template.id);
      if (request === detailRequest.current) setDetail(fresh);
    } catch {
      // Keep the list row's copy if the detail fetch fails.
    }
  }

  async function runSync() {
    if (!syncChannel) return;
    setSyncing(true);
    setNotice(null);
    try {
      const result = await syncTemplates(syncChannel);
      setSyncOpen(false);
      setSyncChannel("");
      setNotice({
        kind: "success",
        text: `Sync complete — ${result.received} received, ${result.created} new, ${result.updated} updated, ${result.deactivated} deactivated.`,
      });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof TemplateApiError ? error.message : "Could not synchronize templates." });
    } finally {
      setSyncing(false);
    }
  }

  const rangeLabel = total === 0 ? "No templates" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`;

  return (
    <section className="templates-page" aria-label="Message templates">
      <header className="templates-page-header">
        <h1>Templates</h1>
        <div className="templates-header-actions">
          <Link href="/ai-credits" className="templates-credit" title="AI credit balance"><LightningIcon size={16} aria-hidden="true" /><span>{creditBalance === null ? "..." : creditBalance.toFixed(2)} credits</span></Link>
        </div>
      </header>
      {notice && !deleteTarget && <div className={`templates-notice templates-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span>{notice.text}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><XIcon size={17} aria-hidden="true" /></button></div>}
      <div className="templates-top-toolbar">
        <div className="templates-search"><MagnifyingGlassIcon size={18} aria-hidden="true" /><input type="search" aria-label={view === "library" ? "Search template library" : "Search my templates"} value={view === "library" ? librarySearch : searchInput} maxLength={100} onChange={(event) => { if (view === "library") setLibrarySearch(event.target.value); else setSearchInput(event.target.value); }} placeholder="Search templates" />{(view === "library" ? librarySearch : searchInput) && <button type="button" aria-label={view === "library" ? "Clear library search" : "Clear template search"} onClick={() => { if (view === "library") setLibrarySearch(""); else { setSearchInput(""); setSearch(""); setPage(1); } }}><XIcon size={16} aria-hidden="true" /></button>}</div>
        <div className="templates-list-actions">
          <button type="button" className="templates-btn templates-icon-btn" aria-label="Refresh templates" disabled={loading} onClick={() => { void load(); setLibraryRefresh((value) => value + 1); }}><ArrowsClockwiseIcon size={18} aria-hidden="true" /></button>
          <button type="button" className="templates-btn" onClick={() => { setSyncChannel(connectedWhatsApp[0]?.id ?? ""); setSyncOpen(true); }}>Sync from Meta</button>
          <button type="button" className="templates-btn" aria-expanded={view === "library" ? libraryFiltersOpen : filtersOpen} aria-controls={view === "library" ? "library-filters" : "template-filters"} onClick={() => { if (view === "library") setLibraryFiltersOpen((open) => !open); else setFiltersOpen((open) => !open); }}><FunnelIcon size={17} aria-hidden="true" />Filters</button>
          <button type="button" className="templates-btn templates-btn-ai" onClick={() => setAiOpen(true)}><SparkleIcon size={17} aria-hidden="true" />Create with AI</button>
          <Link href="/templates/new" className="templates-btn templates-btn-primary"><PlusIcon size={17} aria-hidden="true" />Create new template</Link>
        </div>
      </div>
      <div className="templates-create-options">
        <button type="button" onClick={() => setAiOpen(true)}><span className="templates-create-icon"><SparkleIcon size={23} aria-hidden="true" /></span><strong>Create with AI</strong><ArrowRightIcon size={18} aria-hidden="true" /></button>
        <Link href="/templates/new"><span className="templates-create-icon"><PlusIcon size={23} aria-hidden="true" /></span><strong>Create new template</strong><ArrowRightIcon size={18} aria-hidden="true" /></Link>
      </div>
      <div className="templates-view-tabs" role="group" aria-label="Template view">
        <button type="button" aria-pressed={view === "library"} onClick={() => setView("library")}>Template library</button>
        <button type="button" aria-pressed={view === "mine"} onClick={() => setView("mine")}>My templates<span>{loading ? "..." : total}</span></button>
      </div>
      <div hidden={view !== "library"}><PlatformTemplateLibrary searchQuery={librarySearch} onSearchChange={setLibrarySearch} filtersOpen={libraryFiltersOpen} refreshKey={libraryRefresh} /></div>
      <div className="templates-mine" hidden={view !== "mine"}>
        <div className="templates-filter-panel" id="template-filters" hidden={!filtersOpen}>
          <label>Channel<select value={channelId} onChange={(event) => changeFilter(setChannelId, event.target.value)}><option value="">All channels</option>{whatsappChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}><option value="">All statuses</option>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
          <label>Category<select value={category} onChange={(event) => changeFilter(setCategory, event.target.value)}><option value="">All categories</option>{CATEGORY_OPTIONS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
          <label>Language<input value={language} onChange={(event) => changeFilter(setLanguage, event.target.value.trim())} placeholder="en_US" maxLength={12} /></label>
          {hasActiveFilters && <button type="button" className="templates-btn" onClick={() => { setSearchInput(""); setSearch(""); setChannelId(""); setStatus(""); setCategory(""); setLanguage(""); setPage(1); }}>Clear filters</button>}
        </div>
        <p className="templates-range" aria-live="polite">{rangeLabel}</p>
      {loading ? (
        <div className="channel-state" role="status">Loading templates…</div>
      ) : loadError ? (
        <div className="channel-state channel-state-error" role="alert">
          <strong>Templates could not be loaded.</strong>
          <p>The templates service did not respond. Please try again.</p>
          <button type="button" className="channel-secondary-btn" onClick={() => void load()}>Try again</button>
        </div>
      ) : templates.length === 0 ? (
        <div className="channel-state channel-empty">
          <span className="channel-empty-mark" aria-hidden="true">▤</span>
          <strong>{hasActiveFilters ? "No matching templates" : "No templates yet"}</strong>
          <p>{hasActiveFilters ? "Adjust your search or filters." : "Sync a connected WhatsApp channel to import its approved templates."}</p>
          {!hasActiveFilters && connectedWhatsApp.length > 0 && (
            <button type="button" className="channel-primary-btn" onClick={() => { setSyncChannel(connectedWhatsApp[0].id); setSyncOpen(true); }}>Sync templates</button>
          )}
        </div>
      ) : (
        <>
          <div className="contact-table" role="table" aria-label="Templates">
            <div className="contact-row tpl-row contact-head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Channel</span>
              <span role="columnheader">Language</span>
              <span role="columnheader">Category</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Updated</span>
              <span role="columnheader" className="contact-actions-col">Actions</span>
            </div>
            {templates.map((template) => (
              <div className="contact-row tpl-row" role="row" key={template.id}>
                <span role="cell" data-label="Name"><button type="button" className="contact-link" onClick={() => void openDetail(template)}>{template.name}</button></span>
                <span role="cell" data-label="Channel">{channelsById.get(template.channel_connection_id)?.name ?? "—"}</span>
                <span role="cell" data-label="Language">{template.language}</span>
                <span role="cell" data-label="Category">{titleCase(template.category)}</span>
                <span role="cell" data-label="Status"><span className={`channel-pill ${STATUS_TONE[template.status] ?? "channel-pill-muted"}`}>{titleCase(template.status)}</span></span>
                <span role="cell" data-label="Updated">{formatDate(template.updated_at)}</span>
                <span role="cell" data-label="Actions" className="contact-actions-col">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-md shadow-2xs"
                      onClick={() => void openDetail(template)}
                      title="Preview Template"
                    >
                      Preview
                    </button>
                    {template.status === "draft" && (
                      <Link
                        href={`/templates/new?id=${encodeURIComponent(template.id)}`}
                        className="px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold rounded-md shadow-2xs"
                        title="Edit Draft"
                      >
                        Edit
                      </Link>
                    )}
                    <Link
                      href={`/templates/new?duplicate=${encodeURIComponent(template.id)}`}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-md shadow-2xs"
                      title="Duplicate Template"
                    >
                      Duplicate
                    </Link>
                    <button
                      type="button"
                      disabled={deletingId === template.id}
                      onClick={() => setDeleteTarget(template)}
                      className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold rounded-md shadow-2xs disabled:opacity-50"
                      title="Delete Template"
                    >
                      {deletingId === template.id ? "…" : "Delete"}
                    </button>
                  </div>
                </span>
              </div>
            ))}
          </div>

          <nav className="contact-pagination" aria-label="Pagination">
            <button type="button" className="channel-secondary-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="channel-secondary-btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </nav>
        </>
      )}

      </div>
      {/* Preview modal */}
      {detail && <TemplatePreview template={detail} channelName={channelsById.get(detail.channel_connection_id)?.name ?? null} onClose={() => { detailRequest.current += 1; setDetail(null); }} />}

      {/* Sync modal */}
      {syncOpen && (
        <AppDialog labelledBy="sync-title" onClose={() => setSyncOpen(false)} busy={syncing}>
          <div className="channel-modal channel-modal-sm">
            <h2 id="sync-title">Sync WhatsApp templates</h2>
            <p className="channel-modal-sub">Fetch the latest approved templates from Meta for a connected channel.</p>
            {connectedWhatsApp.length === 0 ? (
              <p className="channel-form-error" role="alert">No connected WhatsApp channel is available. Connect one from Channels first.</p>
            ) : (
              <label className="channel-field team-manage-field">
                <span>Channel</span>
                <select value={syncChannel} onChange={(e) => setSyncChannel(e.target.value)}>
                  {connectedWhatsApp.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <div className="channel-modal-actions">
              <button type="button" className="channel-secondary-btn" onClick={() => setSyncOpen(false)} disabled={syncing}>Cancel</button>
              <button type="button" className="channel-primary-btn" onClick={() => void runSync()} disabled={syncing || !syncChannel}>{syncing ? "Syncing…" : "Sync now"}</button>
            </div>
          </div>
        </AppDialog>
      )}
      {deleteTarget && <AppDialog labelledBy="delete-template-title" onClose={() => setDeleteTarget(null)} busy={Boolean(deletingId)}>
        <div className="channel-modal channel-modal-sm">
          <h2 id="delete-template-title">Delete template?</h2>
          {notice?.kind === "error" && <p className="channel-form-error" role="alert">{notice.text}</p>}
          <p className="channel-modal-sub">Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
          <div className="channel-modal-actions">
            <button type="button" className="channel-secondary-btn" autoFocus disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button type="button" className="templates-btn templates-btn-danger" disabled={Boolean(deletingId)} onClick={() => void handleDelete(deleteTarget)}>{deletingId ? "Deleting..." : "Delete template"}</button>
          </div>
        </div>
      </AppDialog>}
      <AiTemplateModal open={aiOpen} onClose={() => setAiOpen(false)} onUse={useAiDraft} />
    </section>
  );
}

function TemplatePreview({ template, channelName, onClose }: { template: MessageTemplate; channelName: string | null; onClose: () => void }) {
  const part = splitComponents(template);
  const variables = uniquePlaceholders(template);
  const headerText = typeof part.header?.text === "string" ? part.header.text : null;
  const headerFormat = typeof part.header?.format === "string" ? part.header.format.toUpperCase() : null;
  const bodyText = typeof part.body?.text === "string" ? part.body.text : "";
  const footerText = typeof part.footer?.text === "string" ? part.footer.text : null;

  return (
    <AppDialog labelledBy="tpl-title" onClose={onClose}>
      <div className="channel-modal contact-detail-modal">
        <div className="contact-detail-head">
          <div>
            <h2 id="tpl-title">{template.name}</h2>
            <span className={`channel-pill ${STATUS_TONE[template.status] ?? "channel-pill-muted"}`}>{titleCase(template.status)}</span>
          </div>
          <button type="button" className="contact-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <dl className="channel-facts contact-detail-facts">
          <div><dt>Channel</dt><dd>{channelName ?? "—"}</dd></div>
          <div><dt>Language</dt><dd>{template.language}</dd></div>
          <div><dt>Category</dt><dd>{titleCase(template.category)}</dd></div>
          <div><dt>Template ID</dt><dd>{template.external_template_id ?? "—"}</dd></div>
        </dl>

        <div className="tpl-preview">
          <h3>Preview</h3>
          <div className="tpl-bubble">
            {part.header && (
              headerFormat && headerFormat !== "TEXT"
                ? <div className="tpl-media-header">{titleCase(headerFormat.toLowerCase())} header</div>
                : headerText && <div className="tpl-header">{renderWithPlaceholders(headerText)}</div>
            )}
            {bodyText && <div className="tpl-body">{renderWithPlaceholders(bodyText)}</div>}
            {footerText && <div className="tpl-footer">{footerText}</div>}
            {part.buttons.length > 0 && (
              <div className="tpl-buttons">
                {part.buttons.map((button, index) => (
                  <span className="tpl-button" key={index}>{typeof button.text === "string" ? button.text : "Button"}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tpl-vars">
          <h3>Variables</h3>
          {variables.length > 0 ? (
            <ul className="tpl-var-list">
              {variables.map((v) => <li key={v}><code className="tpl-var">{`{{${v}}}`}</code> — required when sending</li>)}
            </ul>
          ) : (
            <p className="contact-muted">This template has no variables.</p>
          )}
        </div>

        {template.rejected_reason && (
          <div className="p-3.5 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-700">
              <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Meta Rejection Notice</span>
            </div>
            <p className="font-medium">{template.rejected_reason}</p>
            <p className="text-[11px] text-rose-600">
              Duplicate this template to correct the issue and resubmit for approval.
            </p>
          </div>
        )}


        <div className="channel-modal-actions flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/templates/new?duplicate=${encodeURIComponent(template.id)}`}
              className="channel-secondary-btn"
            >
              Duplicate &amp; Edit
            </Link>
            {template.status === "draft" && (
              <Link
                href={`/templates/new?id=${encodeURIComponent(template.id)}`}
                className="channel-primary-btn"
              >
                Edit Draft
              </Link>
            )}
          </div>
          <button type="button" className="channel-secondary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </AppDialog>
  );
}
