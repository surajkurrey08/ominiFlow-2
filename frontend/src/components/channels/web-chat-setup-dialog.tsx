"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppDialog } from "@/components/app-dialog";
import {
  setupWebChat, startWebChatPairing, getWebChatInstallation, cancelWebChatPairing,
  type ChannelConnection, type WebChatPairing, type WebChatInstallation,
} from "@/lib/channels/browser";
import { connectorEvent, PAIRING_PROTOCOL, websiteOrigin } from "@/lib/channels/website-pairing";

const installationLabels: Record<WebChatInstallation["installation_status"], string> = {
  not_connected: "Not connected", awaiting_approval: "Awaiting approval", expired: "Request expired",
  authorized: "Authorized", active: "Active", disconnected: "Disconnected",
};

export function WebChatSetupDialog({ channel: initial, onClose, onSaved }: {
  channel: ChannelConnection | null; onClose: () => void; onSaved: () => void;
}) {
  const [channel, setChannel] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const initialWebsite = (initial?.provider_metadata?.web_chat as { website_origin?: string } | undefined)?.website_origin ?? "";
  const [website, setWebsite] = useState(initialWebsite);
  const [phase, setPhase] = useState<"form" | "ready" | "waiting" | "done">(initialWebsite ? "ready" : "form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"name" | "website" | null>(null);
  const [status, setStatus] = useState<WebChatInstallation | null>(null);
  const [expiry, setExpiry] = useState("");
  const pairingRef = useRef<WebChatPairing | null>(null);
  const popupRef = useRef<Window | null>(null);
  const authOriginRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const pendingRef = useRef(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aliveRef.current = true;
    firstFieldRef.current?.focus();
    return () => {
      aliveRef.current = false;
      popupRef.current?.close();
      const pairing = pairingRef.current;
      pairingRef.current = null;
      if (pairing) void cancelWebChatPairing(pairing.channel_id, pairing.pairing_id).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!channel || phase !== "ready") return;
    let active = true;
    getWebChatInstallation(channel.id).then(value => { if (active) setStatus(value); }).catch(() => {});
    return () => { active = false; };
  }, [channel, phase]);

  useEffect(() => {
    if (phase !== "waiting" || !channel) return;
    let active = true;
    let polling = false;
    let pollFailed = false;
    function message(event: MessageEvent) {
      const pairing = pairingRef.current;
      if (!pairing) return;
      const data = connectorEvent(event, popupRef.current, pairing.pairing_id);
      if (!data) return;
      if (data.type === "connector" && event.origin === pairing.website_origin) {
        const authorizationOrigin = typeof data.authorization_origin === "string" ? websiteOrigin(data.authorization_origin) : null;
        if (!authorizationOrigin) return;
        authOriginRef.current = authorizationOrigin;
        popupRef.current?.postMessage({ protocol: PAIRING_PROTOCOL, type: "connector_ack", request_id: pairing.pairing_id }, pairing.website_origin);
      }
      if (data.type === "ready" && event.origin === authOriginRef.current) {
        popupRef.current?.postMessage({ ...pairing, type: "configuration", request_id: pairing.pairing_id }, event.origin);
      }
      // Completion messages only prompt a server status check. They cannot authorize a channel.
      if (data.type === "saved" && event.origin === authOriginRef.current) void poll();
    }
    async function poll() {
      if (polling || !active) return;
      polling = true;
      try {
        const value = await getWebChatInstallation(channel!.id);
        if (!active) return;
        if (pollFailed) { setError(""); pollFailed = false; }
        setStatus(value);
        if (value.pairing_id && value.pairing_id !== pairingRef.current?.pairing_id) {
          pairingRef.current = null; popupRef.current?.close(); setPhase("ready");
          setError("A newer connection request was started for this website. Connect again to start a fresh request.");
          return;
        }
        if (["authorized", "active"].includes(value.installation_status) && value.pairing_id === pairingRef.current?.pairing_id) {
          pairingRef.current = null;
          popupRef.current?.close();
          setPhase("done"); onSaved();
        } else if (value.installation_status === "expired" || value.installation_status === "disconnected") {
          pairingRef.current = null;
          popupRef.current?.close(); setPhase("ready");
          setError(value.installation_status === "expired" ? "Connection request expired. Connect again to retry." : "This channel was disconnected. Activate it before trying again.");
        } else if (popupRef.current?.closed) {
          await cancelWebChatPairing(channel!.id, pairingRef.current!.pairing_id);
          if (active) { pairingRef.current = null; setPhase("ready"); setError("Authorization window closed. Connect again when you are ready."); }
        }
      } catch (cause) { if (active) { pollFailed = true; setError(cause instanceof Error ? cause.message : "Could not check the connection. Retrying…"); } }
      finally { polling = false; }
    }
    window.addEventListener("message", message);
    const timer = window.setInterval(poll, 2000);
    const connectorTimeout = window.setTimeout(() => {
      if (active && !authOriginRef.current) setError("The website connector did not respond. Install or enable the Omniflow connector on your website, then cancel and connect again.");
    }, 20000);
    void poll();
    return () => { active = false; window.clearInterval(timer); window.clearTimeout(connectorTimeout); window.removeEventListener("message", message); };
  }, [phase, channel, onSaved]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    setError(""); setFieldError(null);
    if (name.trim().length < 2) {
      setFieldError("name"); setError("Enter a website name with at least two characters.");
      document.getElementById("web-chat-name")?.focus(); return;
    }
    const origin = websiteOrigin(website.trim());
    if (!origin) {
      setFieldError("website"); setError("Enter a full HTTPS website address, such as https://bookmyvilla.online. Local HTTP addresses are supported for testing.");
      document.getElementById("web-chat-website")?.focus(); return;
    }
    pendingRef.current = true; setBusy(true);
    try {
      const saved = await setupWebChat({ name: name.trim(), website_url: origin }, channel?.id);
      if (!aliveRef.current) return;
      setChannel(saved); setWebsite(origin); setPhase("ready"); onSaved();
    } catch (cause) { if (aliveRef.current) setError(cause instanceof Error ? cause.message : "Could not save this website."); }
    finally { pendingRef.current = false; if (aliveRef.current) setBusy(false); }
  }

  async function connect() {
    if (!channel || pendingRef.current) return;
    setError("");
    const popup = window.open("about:blank", "_blank", "popup,width=580,height=760");
    if (!popup) { setError("Allow pop-ups for Omniflow, then select Connect website again."); return; }
    popup.document.title = "Connecting website";
    popup.document.body.textContent = "Preparing your website connection…";
    popupRef.current = popup;
    pendingRef.current = true; setBusy(true);
    try {
      const pairing = await startWebChatPairing(channel.id);
      if (!aliveRef.current) { popup.close(); void cancelWebChatPairing(channel.id, pairing.pairing_id).catch(() => {}); return; }
      pairingRef.current = pairing; authOriginRef.current = null;
      setExpiry(pairing.expires_at); setPhase("waiting");
      popup.location.href = pairing.authorization_url;
    } catch (cause) {
      popup.close();
      if (aliveRef.current) setError(cause instanceof Error ? cause.message : "Could not start the website connection.");
    } finally { pendingRef.current = false; if (aliveRef.current) setBusy(false); }
  }

  async function refreshStatus() {
    if (!channel || pendingRef.current) return;
    pendingRef.current = true; setBusy(true); setError("");
    try { setStatus(await getWebChatInstallation(channel.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check connection status."); }
    finally { pendingRef.current = false; setBusy(false); }
  }

  return <AppDialog labelledBy="web-chat-setup-title" onClose={onClose} busy={busy} className="web-chat-setup-dialog">
    <div className="channel-modal">
      <div className="web-chat-dialog-heading"><h2 id="web-chat-setup-title">{phase === "form" ? (channel ? "Set up website" : "Create Web Chat") : phase === "done" ? "Website authorized" : "Connect website"}</h2><button className="channel-action" type="button" aria-label="Close website setup" disabled={busy} onClick={onClose}>×</button></div>
      {phase === "form" ? <form className="channel-form" noValidate onSubmit={save} aria-busy={busy}>
        <label className="channel-field" htmlFor="web-chat-name"><span>Website name</span><input ref={firstFieldRef} id="web-chat-name" value={name} onChange={e => setName(e.target.value)} maxLength={150} placeholder="BookMyVilla" disabled={busy} aria-invalid={fieldError === "name"} aria-describedby={fieldError === "name" ? "web-chat-setup-error" : undefined} /></label>
        <label className="channel-field" htmlFor="web-chat-website"><span>Website URL</span><input id="web-chat-website" type="url" value={website} onChange={e => setWebsite(e.target.value)} maxLength={2048} placeholder="https://bookmyvilla.online" disabled={busy} aria-invalid={fieldError === "website"} aria-describedby={fieldError === "website" ? "web-chat-setup-error" : undefined} /></label>
        {error && <p className="channel-form-error" id="web-chat-setup-error" role="alert">{error}</p>}
        <p className="channel-modal-sub">Authorize the website plugin to connect chat. No keys or code to copy.</p>
        <div className="channel-modal-actions"><button className="channel-secondary-btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="channel-primary-btn" type="submit" disabled={busy}>{busy ? "Saving…" : channel ? "Save website" : "Create channel"}</button></div>
      </form> : <div className="web-chat-connect-state">
        <div className="web-chat-website-summary"><strong>{channel?.name}</strong><span>{website}</span></div>
        <p className="channel-modal-sub" role="status">{phase === "waiting" ? "Approve the connection in the website admin window. Keep this page open." : phase === "done" ? "Settings were saved by the website admin. Refresh the website and send a message to verify Inbox delivery." : "Connect opens your website’s admin authorization. Its Omniflow connector must be installed."}</p>
        {phase === "waiting" && <p className="channel-modal-sub">Request expires at {new Date(expiry).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>}
        {status && <dl className="web-chat-installation-details"><div><dt>Installation</dt><dd>{installationLabels[status.installation_status]}</dd></div><div><dt>Last visitor message</dt><dd>{status.last_visitor_message_at ? new Date(status.last_visitor_message_at).toLocaleString() : "No messages received yet"}</dd></div></dl>}
        {error && <p className="channel-form-error" role="alert">{error}</p>}
        <div className="channel-modal-actions"><button className="channel-secondary-btn" type="button" disabled={busy} onClick={onClose}>{phase === "waiting" ? "Cancel connection" : "Close"}</button>{phase === "ready" && status?.paired_at && <button className="channel-secondary-btn" type="button" disabled={busy} onClick={refreshStatus}>Check chat activity</button>}{phase === "ready" && <button className="channel-primary-btn" type="button" disabled={busy || status?.installation_status === "disconnected"} onClick={connect}>{busy ? "Preparing…" : status?.paired_at ? "Reconnect website" : "Connect website"}</button>}{phase === "done" && <button className="channel-primary-btn" type="button" disabled={busy} onClick={refreshStatus}>{busy ? "Checking…" : "Check chat activity"}</button>}</div>
      </div>}
    </div>
  </AppDialog>;
}
