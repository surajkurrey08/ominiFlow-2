"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flowsApi, type FlowSummary } from "@/lib/flows/browser";
import { CreateFlowModal } from "@/components/flow/create-flow-modal";
import { AppDialog } from "@/components/app-dialog";
import { useChannelConnections } from "@/components/channels/channel-connection-select";
const PAGE_SIZE = 12;
function formatDate(value: string) { return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
export function FlowList() {
    const router = useRouter();
    const catalog = useChannelConnections();
    const [items, setItems] = useState<FlowSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [channelFilter, setChannelFilter] = useState("");
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<FlowSummary | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const loadRevision = useRef(0);
    const mounted = useRef(true);
    const refresh = useCallback(() => {
        const revision = ++loadRevision.current;
        return flowsApi.list().then(result => { if (mounted.current && revision === loadRevision.current) {
            setItems(result.items);
            setError("");
        } })
            .catch(cause => { if (mounted.current && revision === loadRevision.current)
            setError(cause instanceof Error ? cause.message : "Could not load flows."); })
            .finally(() => { if (mounted.current && revision === loadRevision.current)
            setLoading(false); });
    }, []);
    useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, [refresh]);
    const filtered = items.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) && (!channelFilter || (channelFilter === "unassigned" ? !f.channel_connection_id : f.channel_connection_id === channelFilter)));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const paged = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    const channelName = (flow: FlowSummary) => catalog.channels.find(c => c.id === flow.channel_connection_id)?.name ?? (flow.channel_connection_id ? "Channel unavailable" : "Unassigned");
    async function copy(id: string) { if (busyId)
        return; setBusyId(id); try {
        await flowsApi.copy(id);
        await refresh();
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not copy flow.");
    }
    finally {
        setBusyId("");
    } }
    async function remove() { if (!deleteTarget || busyId)
        return; setBusyId(deleteTarget.id); setDeleteError(""); try {
        await flowsApi.remove(deleteTarget.id);
        setDeleteTarget(null);
        await refresh();
    }
    catch (cause) {
        setDeleteError(cause instanceof Error ? cause.message : "Could not delete flow.");
    }
    finally {
        setBusyId("");
    } }
    return <section className="routing-page">
    <header className="routing-heading">
    <div>
    <h1>Flows</h1>
    <span>{items.length} flows</span>
    </div>
    <div className="routing-heading-actions">
    <button className="channel-secondary-btn" type="button" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>Refresh</button>
    <button className="channel-primary-btn" type="button" onClick={() => setModalOpen(true)}>Create flow</button>
    </div>
    </header>
    <div className="routing-panel">
      <div className="routing-toolbar">
    <div className="routing-search">
    <input ref={searchRef} aria-label="Search flows" placeholder="Search flows" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/>{search && <button type="button" aria-label="Clear flow search" onClick={() => { setSearch(""); setPage(1); searchRef.current?.focus(); }}>Clear</button>}</div>
    <label className="routing-filter">Channel<select aria-label="Filter flows by channel" value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setPage(1); }}>
    <option value="">All channels</option>
    <option value="unassigned">Unassigned</option>{catalog.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </label>
    </div>
      {catalog.error && <p className="routing-notice" role="alert">{catalog.error} <button type="button" onClick={catalog.reload}>Retry channels</button>
        </p>}
      {error && <p className="routing-notice" role="alert">{error} <button type="button" onClick={() => void refresh()}>Retry</button>
        </p>}
      {loading ? <p className="routing-empty" role="status">Loading flows...</p> : !filtered.length ? <div className="routing-empty">
        <strong>{items.length ? "No matching flows" : "No flows yet"}</strong>
        <button className="channel-secondary-btn" type="button" onClick={() => items.length ? (setSearch(""), setChannelFilter(""), setPage(1)) : setModalOpen(true)}>{items.length ? "Clear filters" : "Create flow"}</button>
        </div> : <div className="routing-table-scroll">
        <table className="routing-table">
        <thead>
        <tr>
        <th>Flow</th>
        <th>Channel</th>
        <th>Status</th>
        <th>Updated</th>
        <th>
        <span className="sr-only">Actions</span>
        </th>
        </tr>
        </thead>
        <tbody>{paged.map(f => <tr key={f.id}>
            <td>
            <button type="button" className="routing-name" onClick={() => router.push(`/flow/${f.id}`)}>{f.name}</button>
            </td>
            <td>{channelName(f)}</td>
            <td>
            <span className={`routing-status ${f.channel_connection_id && f.status === "active" ? "routing-status-active" : ""}`}>{!f.channel_connection_id ? "Needs channel" : f.status === "active" ? "Active" : "Draft"}</span>
            </td>
            <td>{formatDate(f.updated_at)}</td>
            <td>
            <div className="routing-row-actions">
            <button type="button" onClick={() => router.push(`/flow/${f.id}`)}>Edit</button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void copy(f.id)}>{busyId === f.id ? "Saving..." : "Copy"}</button>
            <button type="button" className="routing-delete" onClick={() => { setDeleteError(""); setDeleteTarget(f); }}>Delete</button>
            </div>
            </td>
            </tr>)}</tbody>
        </table>
        </div>}
      {!loading && filtered.length > 0 && <footer className="routing-pagination">
        <span>{(current - 1) * PAGE_SIZE + 1}-{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <div>
        <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
        <span>Page {current} of {pages}</span>
        <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
        </div>
        </footer>}
    </div>
    {modalOpen && <CreateFlowModal onClose={() => setModalOpen(false)} onCreated={id => router.push(`/flow/${id}`)}/>}
    {deleteTarget && <AppDialog labelledBy="delete-flow-title" onClose={() => setDeleteTarget(null)} busy={Boolean(busyId)}>
        <div className="channel-modal">
        <h2 id="delete-flow-title">Delete flow?</h2>
        <p className="channel-modal-sub">Delete {deleteTarget.name}? This cannot be undone.</p>{deleteError && <p className="channel-form-error" role="alert">{deleteError}</p>}<div className="channel-modal-actions">
        <button className="channel-secondary-btn" type="button" disabled={Boolean(busyId)} onClick={() => setDeleteTarget(null)}>Cancel</button>
        <button className="channel-action channel-action-danger" type="button" disabled={Boolean(busyId)} onClick={() => void remove()}>Delete flow</button>
        </div>
        </div>
        </AppDialog>}
  </section>;
}
