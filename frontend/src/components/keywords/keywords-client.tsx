"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppDialog } from "@/components/app-dialog";
import { ChannelConnectionSelect, useChannelConnections } from "@/components/channels/channel-connection-select";
import { createKeyword, deleteKeyword, listKeywords, updateKeyword, type Keyword, type MatchType } from "@/lib/keywords/browser";
import { flowsApi, type FlowSummary } from "@/lib/flows/browser";
type RuleForm = {
    id: string | null;
    channelId: string;
    text: string;
    match: MatchType;
    action: "flow" | "text";
    flowId: string;
    reply: string;
    active: boolean;
};
const MATCHES: Record<MatchType, string> = { exact: "Exact match", contains: "Contains", starts_with: "Starts with", ends_with: "Ends with" };
const emptyForm = (): RuleForm => ({ id: null, channelId: "", text: "", match: "exact", action: "flow", flowId: "", reply: "", active: true });
const PAGE_SIZE = 12;
export function KeywordsClient() {
    const catalog = useChannelConnections();
    const [keywords, setKeywords] = useState<Keyword[]>([]);
    const [flows, setFlows] = useState<FlowSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [flowsLoading, setFlowsLoading] = useState(true);
    const [error, setError] = useState("");
    const [flowsError, setFlowsError] = useState("");
    const [search, setSearch] = useState("");
    const [channelFilter, setChannelFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [matchFilter, setMatchFilter] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [view, setView] = useState<"table" | "grid">("table");
    const [paging, setPaging] = useState({ filter: "", page: 1 });
    const [form, setForm] = useState<RuleForm | null>(null);
    const [formError, setFormError] = useState("");
    const [invalid, setInvalid] = useState("");
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<Keyword | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const [deleting, setDeleting] = useState(false);
    const pending = useRef(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const loadRevision = useRef(0);
    const mounted = useRef(true);
    const load = useCallback(() => {
        const revision = ++loadRevision.current;
        return listKeywords().then(items => { if (mounted.current && revision === loadRevision.current) {
            setKeywords(items);
            setError("");
        } })
            .catch(cause => { if (mounted.current && revision === loadRevision.current)
            setError(cause instanceof Error ? cause.message : "Could not load keywords."); })
            .finally(() => { if (mounted.current && revision === loadRevision.current)
            setLoading(false); });
    }, []);
    const loadFlows = useCallback(() => flowsApi.list().then(result => { setFlows(result.items); setFlowsError(""); })
        .catch(cause => setFlowsError(cause instanceof Error ? cause.message : "Could not load flows."))
        .finally(() => setFlowsLoading(false)), []);
    useEffect(() => { mounted.current = true; void load(); void loadFlows(); return () => { mounted.current = false; }; }, [load, loadFlows]);
    const channelName = (keyword: Keyword) => keyword.channel_name ?? catalog.channels.find(c => c.id === keyword.channel_connection_id)?.name ?? (keyword.channel_connection_id ? "Channel unavailable" : "Unassigned");
    const flowName = (keyword: Keyword) => keyword.flow_name ?? flows.find(f => f.id === keyword.flow_id)?.name ?? "Flow unavailable";
    const filtered = useMemo(() => keywords.filter(k => {
        if (channelFilter && (channelFilter === "unassigned" ? Boolean(k.channel_connection_id) : k.channel_connection_id !== channelFilter))
            return false;
        if (statusFilter && k.is_active !== (statusFilter === "active"))
            return false;
        if (matchFilter && k.match_type !== matchFilter)
            return false;
        if (actionFilter && (actionFilter === "flow" ? !k.flow_id : Boolean(k.flow_id)))
            return false;
        return !search || [k.keyword_text, k.flow_name, k.reply_text, k.channel_name].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    }), [keywords, channelFilter, statusFilter, matchFilter, actionFilter, search]);
    const filterKey = JSON.stringify([channelFilter, statusFilter, matchFilter, actionFilter, search]);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = paging.filter === filterKey ? Math.min(paging.page, pages) : 1;
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const choices = flows.filter(f => Boolean(form?.channelId) && f.channel_connection_id === form?.channelId);
    const statusLabel = (k: Keyword) => !k.channel_connection_id ? "Needs channel" : k.flow_id && !flowsLoading && !flowsError && !flows.some(f => f.id === k.flow_id && f.channel_connection_id === k.channel_connection_id) ? "Needs matching flow" : k.is_active ? "Active" : "Inactive";
    function openForm(keyword?: Keyword) {
        setInvalid("");
        setFormError("");
        setForm(keyword ? { id: keyword.id, channelId: keyword.channel_connection_id ?? "", text: keyword.keyword_text, match: keyword.match_type, action: keyword.flow_id ? "flow" : "text", flowId: keyword.flow_id ?? "", reply: keyword.reply_text ?? "", active: keyword.is_active } : emptyForm());
    }
    function validation(field: string, message: string) { setInvalid(field); setFormError(message); document.getElementById(field)?.focus(); }
    async function save(event: FormEvent) {
        event.preventDefault();
        if (!form || pending.current)
            return;
        if (!form.channelId)
            return validation("keyword-channel", "Select a channel for this keyword.");
        if (!form.text.trim())
            return validation("keyword-phrase", "Enter a keyword or phrase.");
        if (form.action === "flow" && !choices.some(f => f.id === form.flowId))
            return validation("keyword-flow", "Choose a flow assigned to the selected channel.");
        if (form.action === "text" && !form.reply.trim())
            return validation("keyword-reply", "Enter a reply message.");
        pending.current = true;
        setSaving(true);
        setInvalid("");
        setFormError("");
        try {
            const payload = { keyword_text: form.text.trim(), match_type: form.match, channel_connection_id: form.channelId, flow_id: form.action === "flow" ? form.flowId : null, reply_text: form.action === "text" ? form.reply.trim() : null, is_active: form.active };
            if (form.id)
                await updateKeyword(form.id, payload);
            else
                await createKeyword(payload);
            setForm(null);
            await load();
        }
        catch (cause) {
            setFormError(cause instanceof Error ? cause.message : "Could not save keyword.");
        }
        finally {
            pending.current = false;
            setSaving(false);
        }
    }
    async function toggle(keyword: Keyword) {
        if (busyId)
            return;
        setBusyId(keyword.id);
        try {
            const result = await updateKeyword(keyword.id, { is_active: !keyword.is_active });
            setKeywords(items => items.map(k => k.id === keyword.id ? result : k));
            setError("");
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not update keyword status.");
        }
        finally {
            setBusyId("");
        }
    }
    async function remove() {
        if (!deleteTarget || deleting)
            return;
        setDeleting(true);
        setDeleteError("");
        try {
            await deleteKeyword(deleteTarget.id);
            setDeleteTarget(null);
            await load();
        }
        catch (cause) {
            setDeleteError(cause instanceof Error ? cause.message : "Could not delete keyword.");
        }
        finally {
            setDeleting(false);
        }
    }
    const actions = (k: Keyword) => <div className="routing-row-actions">
    <button type="button" onClick={() => openForm(k)}>Edit</button>
    <button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(k)}>{busyId === k.id ? "Saving..." : k.is_active ? "Disable" : "Enable"}</button>
    <button type="button" className="routing-delete" onClick={() => { setDeleteError(""); setDeleteTarget(k); }}>Delete</button>
    </div>;
    return <section className="routing-page">
    <header className="routing-heading">
    <div>
    <h1>Keywords</h1>
    <span>{keywords.length} rules</span>
    </div>
    <div className="routing-heading-actions">
    <button type="button" className="channel-secondary-btn" disabled={loading} onClick={() => { setLoading(true); setFlowsLoading(true); void load(); void loadFlows(); }}>Refresh</button>
    <button type="button" className="channel-primary-btn" onClick={() => openForm()}>New keyword</button>
    </div>
    </header>
    <div className="routing-panel">
      <div className="routing-toolbar">
        <div className="routing-search">
    <input ref={searchRef} aria-label="Search keywords" placeholder="Search keywords" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button type="button" aria-label="Clear keyword search" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>Clear</button>}</div>
        <label className="routing-filter">Channel<select aria-label="Filter keywords by channel" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
    <option value="">All channels</option>
    <option value="unassigned">Unassigned</option>{catalog.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </label>
        <label className="routing-filter">Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
    <option value="">All statuses</option>
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
    </select>
    </label>
        <details className="routing-filter-menu">
    <summary>Filters</summary>
    <div>
    <label>Match<select value={matchFilter} onChange={e => setMatchFilter(e.target.value)}>
    <option value="">All matches</option>{Object.entries(MATCHES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </label>
    <label>Action<select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
    <option value="">All actions</option>
    <option value="flow">Run flow</option>
    <option value="text">Send reply</option>
    </select>
    </label>
    </div>
    </details>
        <div className="routing-view">
    <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
    <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Cards</button>
    </div>
      </div>
      {catalog.error && <p className="routing-notice" role="alert">{catalog.error} <button type="button" onClick={catalog.reload}>Retry channels</button>
        </p>}
      {error && <p className="routing-notice" role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button>
        </p>}
      {loading ? <p className="routing-empty" role="status">Loading keywords...</p> : !filtered.length ? <div className="routing-empty">
        <strong>{keywords.length ? "No matching keywords" : "No keywords yet"}</strong>
        <button type="button" className="channel-secondary-btn" onClick={() => keywords.length ? (setSearch(""), setChannelFilter(""), setStatusFilter(""), setMatchFilter(""), setActionFilter("")) : openForm()}>{keywords.length ? "Clear filters" : "New keyword"}</button>
        </div> : view === "table" ? <div className="routing-table-scroll">
        <table className="routing-table">
        <thead>
        <tr>
        <th>Keyword</th>
        <th>Channel</th>
        <th>Match</th>
        <th>Action</th>
        <th>Status</th>
        <th>
        <span className="sr-only">Actions</span>
        </th>
        </tr>
        </thead>
        <tbody>{paged.map(k => <tr key={k.id}>
            <td>
            <strong>{k.keyword_text}</strong>
            </td>
            <td>{channelName(k)}</td>
            <td>{MATCHES[k.match_type]}</td>
            <td>{k.flow_id ? <Link href={`/flow/${k.flow_id}`}>{flowName(k)}</Link> : <span className="routing-reply-preview" title={k.reply_text ?? ""}>{k.reply_text || "No reply"}</span>}</td>
            <td>
            <span className={`routing-status ${statusLabel(k) === "Active" ? "routing-status-active" : ""}`}>{statusLabel(k)}</span>
            </td>
            <td>{actions(k)}</td>
            </tr>)}</tbody>
        </table>
        </div> : <div className="routing-rule-grid">{paged.map(k => <article key={k.id}>
            <div>
            <strong>{k.keyword_text}</strong>
            <span className="routing-status">{statusLabel(k)}</span>
            </div>
            <p>{channelName(k)}</p>
            <p>{MATCHES[k.match_type]}</p>
            <p>{k.flow_id ? flowName(k) : k.reply_text || "No reply"}</p>{actions(k)}</article>)}</div>}
      {!loading && filtered.length > 0 && <footer className="routing-pagination">
        <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <div>
        <button type="button" disabled={page <= 1} onClick={() => setPaging({ filter: filterKey, page: page - 1 })}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPaging({ filter: filterKey, page: page + 1 })}>Next</button>
        </div>
        </footer>}
    </div>
    {form && <AppDialog labelledBy="keyword-rule-title" onClose={() => setForm(null)} busy={saving} className="keyword-rule-dialog">
        <div className="channel-modal">
      <div className="web-chat-dialog-heading">
        <h2 id="keyword-rule-title">{form.id ? "Edit keyword" : "New keyword"}</h2>
        <button className="channel-action" type="button" aria-label="Close keyword form" disabled={saving} onClick={() => setForm(null)}>Close</button>
        </div>
      <form className="channel-form" noValidate aria-busy={saving} onSubmit={save}>
        <ChannelConnectionSelect id="keyword-channel" value={form.channelId} catalog={catalog} disabled={saving} invalid={invalid === "keyword-channel"} onChange={channelId => { setForm({ ...form, channelId, flowId: "" }); setInvalid(""); }}/>
        <label className="channel-field" htmlFor="keyword-phrase">
        <span>Keyword</span>
        <input id="keyword-phrase" value={form.text} maxLength={255} disabled={saving} onChange={e => setForm({ ...form, text: e.target.value })} aria-invalid={invalid === "keyword-phrase"} aria-describedby={invalid === "keyword-phrase" ? "keyword-form-error" : undefined}/>
        </label>
        <label className="channel-field" htmlFor="keyword-match">
        <span>Match</span>
        <select id="keyword-match" value={form.match} disabled={saving} onChange={e => setForm({ ...form, match: e.target.value as MatchType })}>{Object.entries(MATCHES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <fieldset className="routing-action-choice">
        <legend>Action</legend>
        <label>
        <input type="radio" name="keyword-action" value="flow" checked={form.action === "flow"} disabled={saving} onChange={() => setForm({ ...form, action: "flow" })}/>Run flow</label>
        <label>
        <input type="radio" name="keyword-action" value="text" checked={form.action === "text"} disabled={saving} onChange={() => setForm({ ...form, action: "text" })}/>Send reply</label>
        </fieldset>
        {form.action === "flow" ? <div className="channel-field">
            <label htmlFor="keyword-flow">Flow</label>
            <select id="keyword-flow" aria-label="Flow to trigger" value={choices.some(f => f.id === form.flowId) ? form.flowId : ""} disabled={saving || flowsLoading || Boolean(flowsError) || !form.channelId} aria-invalid={invalid === "keyword-flow"} aria-describedby="keyword-flow-help" onChange={e => setForm({ ...form, flowId: e.target.value })}>
            <option value="">{flowsLoading ? "Loading flows..." : "Select a flow"}</option>{choices.map(f => <option key={f.id} value={f.id}>{f.name} ({f.status})</option>)}</select>
            <p id="keyword-flow-help" className="routing-field-help">{!form.channelId ? "Select a channel first." : !flowsLoading && !flowsError && !choices.length ? "No flows assigned to this channel." : ""}</p>{flowsError && <p className="routing-notice" role="alert">{flowsError} <button type="button" onClick={() => { setFlowsLoading(true); void loadFlows(); }}>Retry flows</button>
                </p>}</div> : <label className="channel-field" htmlFor="keyword-reply">
            <span>Reply</span>
    <textarea id="keyword-reply" className="resize-none" rows={4} maxLength={4096} value={form.reply} disabled={saving} onChange={e => setForm({ ...form, reply: e.target.value })} aria-invalid={invalid === "keyword-reply"} aria-describedby={invalid === "keyword-reply" ? "keyword-form-error" : undefined}/>
            </label>}
        <label className="routing-active">
        <input type="checkbox" checked={form.active} disabled={saving} onChange={e => setForm({ ...form, active: e.target.checked })}/>Active</label>
        {formError && <p className="channel-form-error" role="alert" id="keyword-form-error">{formError}</p>}
        <div className="channel-modal-actions">
        <button className="channel-secondary-btn" type="button" disabled={saving} onClick={() => setForm(null)}>Cancel</button>
        <button className="channel-primary-btn" type="submit" disabled={saving || catalog.loading || Boolean(catalog.error)}>{saving ? "Saving..." : form.id ? "Save changes" : "Create keyword"}</button>
        </div>
      </form>
    </div>
        </AppDialog>}
    {deleteTarget && <AppDialog labelledBy="delete-keyword-title" onClose={() => setDeleteTarget(null)} busy={deleting}>
        <div className="channel-modal">
        <h2 id="delete-keyword-title">Delete keyword?</h2>
        <p className="channel-modal-sub">Delete {deleteTarget.keyword_text} from {channelName(deleteTarget)}? This cannot be undone.</p>{deleteError && <p className="channel-form-error" role="alert">{deleteError}</p>}<div className="channel-modal-actions">
        <button className="channel-secondary-btn" type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button>
        <button className="channel-action channel-action-danger" type="button" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting..." : "Delete keyword"}</button>
        </div>
        </div>
        </AppDialog>}
  </section>;
}
