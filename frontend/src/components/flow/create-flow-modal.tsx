"use client";
import { useRef, useState, type FormEvent } from "react";
import { flowsApi } from "@/lib/flows/browser";
import { AppDialog } from "@/components/app-dialog";
import { ChannelConnectionSelect, useChannelConnections } from "@/components/channels/channel-connection-select";
export function CreateFlowModal({ onClose, onCreated }: {
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const catalog = useChannelConnections();
    const [name, setName] = useState("");
    const [channelId, setChannelId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [invalid, setInvalid] = useState(false);
    const pending = useRef(false);
    async function create(event: FormEvent) {
        event.preventDefault();
        if (pending.current)
            return;
        if (!name.trim()) {
            setError("Enter a flow name.");
            document.getElementById("new-flow-name")?.focus();
            return;
        }
        if (!channelId) {
            setInvalid(true);
            setError("Select the channel this flow belongs to.");
            document.getElementById("new-flow-channel")?.focus();
            return;
        }
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            const flow = await flowsApi.create(name.trim(), channelId);
            onCreated(flow.id);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not create the flow.");
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return <AppDialog labelledBy="create-flow-title" onClose={onClose} busy={busy} className="routing-form-dialog">
    <div className="channel-modal">
      <div className="web-chat-dialog-heading">
    <h2 id="create-flow-title">Create flow</h2>
    <button type="button" className="channel-action" aria-label="Close create flow" disabled={busy} onClick={onClose}>Close</button>
    </div>
      <form className="channel-form" noValidate onSubmit={create}>
        <label className="channel-field" htmlFor="new-flow-name">
    <span>Flow name</span>
    <input id="new-flow-name" value={name} onChange={e => setName(e.target.value)} maxLength={150} disabled={busy}/>
    </label>
        <ChannelConnectionSelect id="new-flow-channel" value={channelId} onChange={value => { setChannelId(value); setInvalid(false); }} catalog={catalog} disabled={busy} invalid={invalid}/>
        {error && <p className="channel-form-error" role="alert">{error}</p>}
        <div className="channel-modal-actions">
    <button type="button" className="channel-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button>
    <button type="submit" className="channel-primary-btn" disabled={busy || catalog.loading || Boolean(catalog.error) || !catalog.channels.length}>{busy ? "Creating..." : "Create flow"}</button>
    </div>
      </form>
    </div>
  </AppDialog>;
}
