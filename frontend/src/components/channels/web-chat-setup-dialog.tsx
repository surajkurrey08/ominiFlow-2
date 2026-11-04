"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppDialog } from "@/components/app-dialog";
import {
  setupWebChat, getWebChatInstallation, getWebChatWidgetSettings,
  type ChannelConnection, type WebChatInstallation, type WebChatWidgetSettings,
} from "@/lib/channels/browser";
import { websiteOrigin } from "@/lib/channels/website-pairing";

function CopySetting({ id, label, value, masked = false }: {
  id: string; label: string; value: string; masked?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
      timer.current = setTimeout(() => setFeedback(""), 2500);
    } catch {
      setVisible(true);
      setFeedback("Copy unavailable. Select the value and copy it manually.");
      requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    }
  }
  return <div className="web-chat-copy-setting">
    <label htmlFor={id}>{label}</label>
    <div className="web-chat-copy-controls">
      <input ref={input} id={id} type={masked && !visible ? "password" : "text"} value={value} readOnly autoComplete="off" spellCheck={false} />
      {masked && <button className="channel-secondary-btn" type="button" aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button>}
      <button className="channel-secondary-btn" type="button" aria-label={`Copy ${label}`} disabled={!value} onClick={() => void copy()}>Copy</button>
    </div>
    <p className="web-chat-copy-feedback" role="status">{feedback}</p>
  </div>;
}

export function WebChatSetupDialog({ channel: initial, onClose, onSaved }: {
  channel: ChannelConnection | null; onClose: () => void; onSaved: () => void;
}) {
  const [channel, setChannel] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const initialWebsite = (initial?.provider_metadata?.web_chat as { website_origin?: string } | undefined)?.website_origin ?? "";
  const [website, setWebsite] = useState(initialWebsite);
  const [phase, setPhase] = useState<"form" | "ready">(initialWebsite ? "ready" : "form");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialWebsite));
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<"name" | "website" | null>(null);
  const [status, setStatus] = useState<WebChatInstallation | null>(null);
  const [settings, setSettings] = useState<WebChatWidgetSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [statusError, setStatusError] = useState("");
  const aliveRef = useRef(true);
  const pendingRef = useRef(false);
  const loadRef = useRef(0);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    aliveRef.current = true;
    firstFieldRef.current?.focus();
    return () => { aliveRef.current = false; loadRef.current += 1; };
  }, []);

  const loadSettings = useCallback(() => {
    if (!channel) return;
    const request = ++loadRef.current;
    return Promise.allSettled([
      getWebChatWidgetSettings(channel.id), getWebChatInstallation(channel.id),
    ]).then(([widget, activity]) => {
      if (!aliveRef.current || loadRef.current !== request) return;
      setSettingsError(""); setStatusError("");
      if (widget.status === "fulfilled") setSettings(widget.value);
      else setSettingsError(widget.reason instanceof Error ? widget.reason.message : "Could not load plugin settings. Try again.");
      if (activity.status === "fulfilled") setStatus(activity.value);
      else setStatusError(activity.reason instanceof Error ? activity.reason.message : "Could not check chat activity. Try again.");
      setLoading(false);
    });
  }, [channel]);

  useEffect(() => {
    if (phase === "ready") { headingRef.current?.focus(); void loadSettings(); }
  }, [phase, loadSettings]);

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
      setChannel(saved); setWebsite(origin); setLoading(true); setPhase("ready"); onSaved();
    } catch (cause) { if (aliveRef.current) setError(cause instanceof Error ? cause.message : "Could not save this website."); }
    finally { pendingRef.current = false; if (aliveRef.current) setBusy(false); }
  }

  const active = status?.installation_status === "active";
  const disconnected = status?.installation_status === "disconnected";
  const publicKey = settings?.public_key ?? channel?.external_account_id ?? "";

  return <AppDialog labelledBy="web-chat-setup-title" onClose={onClose} busy={busy} className="web-chat-setup-dialog">
    <div className="channel-modal">
      <div className="web-chat-dialog-heading"><h2 ref={headingRef} tabIndex={-1} id="web-chat-setup-title">{phase === "form" ? (channel ? "Set up website" : "Create Web Chat") : "Website plugin settings"}</h2><button className="channel-action" type="button" aria-label="Close website setup" disabled={busy} onClick={onClose}>×</button></div>
      {phase === "form" ? <form className="channel-form" noValidate onSubmit={save} aria-busy={busy}>
        <label className="channel-field" htmlFor="web-chat-name"><span>Website name</span><input ref={firstFieldRef} id="web-chat-name" value={name} onChange={e => setName(e.target.value)} maxLength={150} placeholder="BookMyVilla" disabled={busy} aria-invalid={fieldError === "name"} aria-describedby={fieldError === "name" ? "web-chat-setup-error" : undefined} /></label>
        <label className="channel-field" htmlFor="web-chat-website"><span>Website URL</span><input id="web-chat-website" type="url" value={website} onChange={e => setWebsite(e.target.value)} maxLength={2048} placeholder="https://bookmyvilla.online" disabled={busy} aria-invalid={fieldError === "website"} aria-describedby={fieldError === "website" ? "web-chat-setup-error" : undefined} /></label>
        {error && <p className="channel-form-error" id="web-chat-setup-error" role="alert">{error}</p>}
        <p className="channel-modal-sub">Create a channel to get its public widget key and plugin URLs.</p>
        <div className="channel-modal-actions"><button className="channel-secondary-btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="channel-primary-btn" type="submit" disabled={busy}>{busy ? "Saving..." : channel ? "Save website" : "Create channel"}</button></div>
      </form> : <div className="web-chat-connect-state">
        <div className="web-chat-website-summary"><strong>{channel?.name}</strong><span>{website}</span></div>
        <p className="channel-modal-sub">Copy these values into the Omniflow plugin in your website admin, enable chat, and save.</p>
        {settings ? <>
          <CopySetting id="web-chat-frontend" label="Frontend URL" value={settings.frontend_url} />
          <CopySetting id="web-chat-backend" label="Backend URL" value={settings.backend_url} />
          <p className="channel-modal-sub">Use the Backend URL without /api/v1.</p>
        </> : <p className="channel-modal-sub" role="status">{loading ? "Loading plugin URLs..." : "Plugin URLs are unavailable. Retry to load them."}</p>}
        <CopySetting id="web-chat-public-key" label="Public widget key" value={publicKey} masked />
        {settingsError && <p className="channel-form-error" role="alert">{settingsError}</p>}
        <p className="channel-modal-sub">Refresh your website and send a chat message to check delivery in Omniflow Inbox.</p>
        <dl className="web-chat-installation-details" aria-busy={loading}>
          <div><dt>Chat status</dt><dd>{!status ? "Not checked" : disconnected ? "Channel disabled" : active ? "Active" : "Waiting for visitor message"}</dd></div>
          <div><dt>Last visitor message</dt><dd>{status?.last_visitor_message_at ? new Date(status.last_visitor_message_at).toLocaleString() : status ? "No messages received yet" : "Not checked"}</dd></div>
        </dl>
        {statusError && <p className="channel-form-error" role="alert">{statusError}</p>}
        {disconnected && <p className="channel-form-error" role="alert">Activate this channel from Channels before testing the website chat.</p>}
        <div className="channel-modal-actions"><button className="channel-secondary-btn" type="button" onClick={onClose}>Close</button><button className="channel-primary-btn" type="button" disabled={loading} onClick={() => { setLoading(true); void loadSettings(); }}>{loading ? "Checking..." : settingsError ? "Retry loading settings" : "Check chat activity"}</button></div>
      </div>}
    </div>
  </AppDialog>;
}
