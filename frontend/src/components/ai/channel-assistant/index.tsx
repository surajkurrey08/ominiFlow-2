"use client";

import { useEffect, useRef, useState } from "react";
import { AppDialog } from "@/components/app-dialog";
import { ChannelConnectionSelect, useChannelConnections } from "@/components/channels/channel-connection-select";
import { flowsApi, type FlowSummary } from "@/lib/flows/browser";

type Config = {
  fallback_action: "none" | "flow" | "ai";
  fallback_flow_id: string | null;
  channel_connection_id: string | null;
  flow_ai_enabled: boolean;
  ai_instructions: string;
  ai_knowledge: string;
  ai_unavailable_reply: string;
  updated_at: string | null;
};
const EMPTY: Config = { fallback_action: "none", fallback_flow_id: null, channel_connection_id: null,
  flow_ai_enabled: false, ai_instructions: "", ai_knowledge: "", ai_unavailable_reply: "", updated_at: null };

async function readConfig(response: Response): Promise<Config> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || data?.detail || "Could not load channel settings.");
  if (!data || !["none", "flow", "ai"].includes(data.fallback_action)) throw new Error("Invalid channel settings response. Reload and try again.");
  return { ...EMPTY, ...data };
}

/** Reuses the workspace's native channel selector, inline feedback and AppDialog. */
export function ChannelAssistant() {
  const catalog = useChannelConnections();
  const [channel, setChannel] = useState("");
  const [config, setConfig] = useState<Config>(EMPTY);
  const [saved, setSaved] = useState<Config>(EMPTY);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [discard, setDiscard] = useState<{ channel?: string; href?: string; reload?: boolean } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const savingRef = useRef(false);
  const leavingRef = useRef(false);
  const dirty = loaded && JSON.stringify(config) !== JSON.stringify(saved);

  useEffect(() => {
    if (!channel) return;
    let active = true;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function load() {
      setLoading(true); setLoaded(false); setError(""); setStatus(""); setFlows([]);
      try {
        const [next, list] = await Promise.all([
          fetch(`/api/routing-config?channel_connection_id=${encodeURIComponent(channel)}`, { cache: "no-store", signal }).then(readConfig),
          flowsApi.list(undefined, channel, signal),
        ]);
        if (!active) return;
        if (next.channel_connection_id !== channel) throw new Error("Channel settings did not match the selected channel.");
        setConfig(next); setSaved(next); setFlows(list.items); setLoaded(true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load settings.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [channel, revision]);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { if (!leavingRef.current) { event.preventDefault(); event.returnValue = ""; } }
    function navigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); setDiscard({ href: anchor.href });
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);

  function changeChannel(value: string) {
    if (dirty) { setDiscard({ channel: value }); return; }
    setChannel(value); setLoaded(false); setConfig(EMPTY); setSaved(EMPTY); setError(""); setStatus("");
  }
  function patch(next: Partial<Config>) { setConfig(current => ({ ...current, ...next })); setStatus(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!loaded || !channel || !dirty || savingRef.current) return;
    if (config.fallback_action === "flow" && !config.fallback_flow_id) {
      setError("Select a default flow, or choose a different response mode."); errorRef.current?.focus(); return;
    }
    savingRef.current = true; setSaving(true); setError(""); setStatus("");
    try {
      const { updated_at, ...body } = config;
      const next = await readConfig(await fetch("/api/routing-config", { method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, channel_connection_id: channel, expected_updated_at: updated_at }),
        signal: AbortSignal.timeout(20000),
      }));
      setConfig(next); setSaved(next); setStatus("Channel assistant settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Your edits are still here.` : "Save could not be confirmed. Reload saved settings to check; your edits are still here.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { savingRef.current = false; setSaving(false); }
  }
  const chosenFlowMissing = config.fallback_flow_id && !flows.some(flow => flow.id === config.fallback_flow_id);
  return <section className="channel-assistant-panel" aria-labelledby="channel-assistant-heading">
    <h2 id="channel-assistant-heading">Channel assistant</h2>
    <p>Manage this channel’s knowledge and free-text replies. English, Hindi and Marathi are supported.</p>
    <ChannelConnectionSelect id="assistant-channel" value={channel} onChange={changeChannel} catalog={catalog} disabled={saving} />
    {!channel && <p>Select a channel to configure its assistant.</p>}
    {loading && <p role="status">Loading channel settings…</p>}
    <p ref={errorRef} tabIndex={-1} role={error ? "alert" : undefined} className="channel-assistant-error">{error}</p>
    {channel && !loading && !loaded && error && <button type="button" className="channel-secondary-btn" onClick={() => setRevision(n => n + 1)}>Retry loading settings</button>}
    {loaded && !loading && <form noValidate onSubmit={save} aria-busy={saving}>
      <fieldset disabled={saving}>
        <legend className="sr-only">Channel assistant settings</legend>
        <label htmlFor="assistant-mode">When no keyword matches</label>
        <select id="assistant-mode" value={config.fallback_action} onChange={e => patch({ fallback_action: e.target.value as Config["fallback_action"] })}>
          <option value="none">No automatic reply</option><option value="flow">Start a flow</option><option value="ai">AI assistant</option>
        </select>
        <label htmlFor="assistant-default-flow">Default flow</label>
        <select id="assistant-default-flow" value={config.fallback_flow_id || ""} aria-invalid={config.fallback_action === "flow" && !config.fallback_flow_id}
          onChange={e => patch({ fallback_flow_id: e.target.value || null })} aria-describedby="assistant-flow-help">
          <option value="">{config.fallback_action === "flow" ? "Select a flow" : "No default flow"}</option>
          {chosenFlowMissing && <option value={config.fallback_flow_id!} disabled>Flow unavailable — select another</option>}
          {flows.map(flow => <option key={flow.id} value={flow.id}>{flow.name}{flow.status === "draft" ? " (draft)" : ""}</option>)}
        </select>
        <p id="assistant-flow-help">With AI assistant and free-text replies enabled, this flow also handles enquiries that start as normal sentences.</p>
        <label className="channel-assistant-toggle" htmlFor="assistant-free-text">
          <input id="assistant-free-text" type="checkbox" checked={config.flow_ai_enabled} onChange={e => patch({ flow_ai_enabled: e.target.checked })} />
          Understand free-text replies during flows
        </label>
        <p>Uses your saved AI provider and credits. Questions keep the current flow step; a request for a person switches the chat to human mode.</p>
        <label htmlFor="assistant-knowledge">Channel knowledge</label>
        <textarea id="assistant-knowledge" className="resize-none" value={config.ai_knowledge} onChange={e => patch({ ai_knowledge: e.target.value })} maxLength={20000} rows={10}
          placeholder="Add verified services, property details, policies and contact information for this channel." aria-describedby="assistant-knowledge-help" />
        <p id="assistant-knowledge-help">Only this channel’s knowledge is used. Live prices and availability need a verified data connection or team confirmation.</p>
        <label htmlFor="assistant-instructions">Reply instructions</label>
        <textarea id="assistant-instructions" className="resize-none" value={config.ai_instructions} onChange={e => patch({ ai_instructions: e.target.value })} maxLength={4000} rows={4}
          placeholder="Tone, business terminology and guidance for this channel." />
        <label htmlFor="assistant-unavailable">Reply when AI is unavailable</label>
        <textarea id="assistant-unavailable" className="resize-none" value={config.ai_unavailable_reply} onChange={e => patch({ ai_unavailable_reply: e.target.value })} maxLength={1000} rows={3}
          placeholder="Leave empty for the default reply in the selected language." />
      </fieldset>
      <div className="channel-assistant-actions">
        <button type="submit" className="channel-primary-btn" disabled={!dirty || saving || Boolean(chosenFlowMissing)}>{saving ? "Saving…" : "Save settings"}</button>
        <button type="button" className="channel-secondary-btn" disabled={saving} onClick={() => dirty ? setDiscard({ reload: true }) : setRevision(n => n + 1)}>Reload saved settings</button>
        <span role="status">{status || (dirty ? "Unsaved changes" : "")}</span>
      </div>
    </form>}
    {discard && <AppDialog labelledBy="assistant-discard-title" onClose={() => setDiscard(null)} busy={saving}>
      <h2 id="assistant-discard-title">Discard unsaved changes?</h2><p>Your saved channel settings will remain unchanged.</p>
      <div className="channel-assistant-actions">
        <button type="button" autoFocus className="channel-secondary-btn" onClick={() => setDiscard(null)}>Keep editing</button>
        <button type="button" className="channel-secondary-btn" onClick={() => {
          const target = discard; setDiscard(null); setConfig(saved);
          if (target.href) { leavingRef.current = true; window.location.assign(target.href); }
          else if (target.reload) setRevision(n => n + 1);
          else { setChannel(target.channel || ""); setLoaded(false); }
        }}>Discard changes</button>
      </div>
    </AppDialog>}
  </section>;
}
