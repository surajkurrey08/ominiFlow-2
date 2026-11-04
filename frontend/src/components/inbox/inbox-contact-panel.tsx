"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Conversation, ConversationStatus } from "@/lib/api/conversations";
import { getContact, listContactConversations, setContactTags, type Contact } from "@/lib/contacts/browser";
import { listTags, type Tag } from "@/lib/tags/browser";
import { assignInboxConversation, changeInboxConversationStatus } from "@/lib/api/inbox";
import type { InboxUserOption } from "@/lib/api/inbox";
import { INBOX_STATUSES } from "@/lib/inbox/proxy-utils";
import { ChannelBadge, InboxIcon } from "./inbox-icons";

export type ContactPanelTab = "details" | "history" | "automation";

export function InboxContactPanel({ conversation, users, tab, onTab, onClose, onUpdate, onSelect, onModeChange, openTags, onTagsOpened }: {
  conversation: Conversation;
  users: InboxUserOption[];
  tab: ContactPanelTab;
  onTab: (tab: ContactPanelTab) => void;
  onClose: () => void;
  onUpdate: (conversation: Conversation) => void;
  onSelect: (conversation: Conversation) => void;
  onModeChange: (mode: "human" | "chatbot") => void;
  openTags: boolean;
  onTagsOpened: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const currentContact = useRef(conversation.contact.id);
  const tagPicker = useRef<HTMLDetailsElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    currentContact.current = conversation.contact.id;
    void Promise.resolve().then(async () => {
      setLoading(true); setError(""); setContact(null); setHistory([]); setHistoryPage(1); setCopied(false); setBusy(false);
      const results = await Promise.allSettled([getContact(conversation.contact.id), listContactConversations(conversation.contact.id), listTags()]);
      if (!active) return;
      if (results[0].status === "fulfilled") setContact(results[0].value);
      else setError("Contact details could not load. Refresh the conversation to try again.");
      if (results[1].status === "fulfilled") { setHistory(results[1].value.items); setHistoryTotal(results[1].value.total); }
      else setHistoryTotal(0);
      if (results[2].status === "fulfilled") setTags(results[2].value.items);
      else setTags([]);
      setLoading(false);
    });
    return () => { active = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, [conversation.contact.id]);

  useEffect(() => {
    if (!openTags || tab !== "details" || !tagPicker.current) return;
    tagPicker.current.open = true;
    tagPicker.current.querySelector<HTMLElement>("summary")?.focus();
    onTagsOpened();
  }, [openTags, tab, onTagsOpened]);

  async function updateTags(ids: string[]) {
    if (busy || !contact) return;
    const id = conversation.contact.id;
    setBusy(true); setError("");
    const before = contact;
    const available = new Map([...contact.tags, ...tags].map((tag) => [tag.id, tag]));
    setContact({ ...contact, tags: ids.map((tagId) => available.get(tagId)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag)) });
    try {
      const updated = await setContactTags(id, ids);
      if (currentContact.current === id) setContact(updated);
    } catch (failure) {
      if (currentContact.current === id) { setContact(before); setError(failure instanceof Error ? failure.message : "Tags could not be updated."); }
    } finally { if (currentContact.current === id) setBusy(false); }
  }

  async function mutate(action: Promise<Conversation>) {
    const id = conversation.id;
    setError("");
    try { const result = await action; if (currentContact.current === result.contact.id && id === result.id) onUpdate(result); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The conversation could not be updated."); }
  }

  async function loadMoreHistory() {
    if (busy) return;
    const id = conversation.contact.id;
    setBusy(true);
    try {
      const result = await listContactConversations(id, historyPage + 1);
      if (currentContact.current === id) { setHistory((current) => [...current, ...result.items]); setHistoryPage((page) => page + 1); }
    } catch { setError("Earlier conversations could not load. Try again."); }
    finally { if (currentContact.current === id) setBusy(false); }
  }

  const phone = contact?.phone_number || conversation.contact.phone_number;
  const name = contact?.name || conversation.contact.name || "Unknown contact";
  const initial = name.match(/[\p{L}\p{N}]/u)?.[0].toUpperCase() || "?";
  const selectedTags = contact?.tags ?? [];
  const previousConversations = history.filter((item) => item.id !== conversation.id);
  const historyList = <div className="inspector-history-list">
    {loading ? <p className="inspector-muted" role="status">Loading conversations…</p> : previousConversations.length === 0 ? <p className="inspector-muted">No previous conversations for this contact.</p> : previousConversations.map((item) => (
      <button type="button" key={item.id} onClick={() => onSelect(item)}><ChannelBadge type={item.channel.channel_type} /><span><strong>{item.channel.name}</strong><small>{new Date(item.last_message_at || item.created_at).toLocaleDateString()} · {item.status}</small></span><InboxIcon name="back" /></button>
    ))}
    {history.length < historyTotal && <button type="button" className="text-action" disabled={busy} onClick={() => void loadMoreHistory()}>{busy ? "Loading…" : "Load more conversations"}</button>}
  </div>;

  return (
    <aside id="inbox-contact-details" className="inbox-contact-panel" aria-label="Contact and conversation information">
      <header className="inspector-tabs">
        <div role="tablist" aria-label="Conversation information">
          {([ ["details", "user", "Details"], ["history", "clock", "History"], ["automation", "lightning", "Automation"] ] as const).map(([key, icon, label]) => (
            <button key={key} id={`inspector-tab-${key}`} role="tab" type="button" aria-selected={tab === key} aria-controls="inspector-content" tabIndex={tab === key ? 0 : -1} onClick={() => onTab(key)} onKeyDown={(event) => {
              const tabs: ContactPanelTab[] = ["details", "history", "automation"];
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              onTab(tabs[next]); document.getElementById(`inspector-tab-${tabs[next]}`)?.focus();
            }}><InboxIcon name={icon} /><span>{label}</span></button>
          ))}
        </div>
        <button type="button" className="inspector-close" aria-label="Close contact details" onClick={onClose}><InboxIcon name="close" /></button>
      </header>
      <div className="inspector-content" id="inspector-content" role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
        {error && <p className="thread-inline-error" role="alert">{error}</p>}
        {tab === "details" && <>
          <div className="inspector-person">
            <span className="contact-avatar">{initial}</span>
            <div><h2>{name}</h2><p><ChannelBadge type={conversation.channel.channel_type} />{phone || "Phone unavailable"}{phone && <button type="button" aria-label="Copy phone number" title={copied ? "Copied" : "Copy phone number"} onClick={() => {
              void navigator.clipboard.writeText(phone).then(() => { setCopied(true); copyTimer.current = setTimeout(() => setCopied(false), 2000); }).catch(() => setError("Phone number could not be copied."));
            }}><InboxIcon name={copied ? "check" : "copy"} /></button>}</p>{contact?.email && <small>{contact.email}</small>}</div>
            <details className="inspector-person-menu"><summary aria-label="Contact actions"><InboxIcon name="more" /></summary><div><Link href="/contacts">Open contact directory</Link></div></details>
          </div>
          <div className="inspector-fields">
            <label><span>Assignee</span><div className="inspector-select"><InboxIcon name="user" /><select aria-label="Contact assignee" value={conversation.assigned_user?.id ?? ""} onChange={(event) => void mutate(assignInboxConversation(conversation.id, event.target.value || null))}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{[user.first_name, user.last_name].filter(Boolean).join(" ")}</option>)}</select></div></label>
            <label><span>Status</span><div className="inspector-select"><span className={`conversation-status-dot status-${conversation.status}`} /><select aria-label="Contact conversation status" value={conversation.status} onChange={(event) => void mutate(changeInboxConversationStatus(conversation.id, event.target.value as ConversationStatus))}>{INBOX_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase()+status.slice(1)}</option>)}</select></div></label>
          </div>
          <section className="inspector-tags"><h3>Tags</h3><div className="inspector-tag-list">
            {selectedTags.map((tag) => <span className="inspector-tag" key={tag.id}>{tag.name}<button type="button" aria-label={`Remove ${tag.name} tag`} disabled={busy} onClick={() => void updateTags(selectedTags.filter((item) => item.id !== tag.id).map((item) => item.id))}><InboxIcon name="close" /></button></span>)}
            {!loading && selectedTags.length === 0 && <span className="inspector-muted">No tags yet</span>}
            <details ref={tagPicker} className="inspector-tag-picker"><summary aria-label="Add contact tag" title="Add tag"><InboxIcon name="plus" /></summary><div>
              {tags.length === 0 ? <p>No tags available. Create tags in <Link href="/contacts">Contacts</Link>.</p> : tags.map((tag) => <label key={tag.id}><input type="checkbox" disabled={busy || !contact} checked={selectedTags.some((item) => item.id === tag.id)} onChange={(event) => void updateTags(event.target.checked ? [...selectedTags.map((item) => item.id), tag.id] : selectedTags.filter((item) => item.id !== tag.id).map((item) => item.id))} />{tag.name}</label>)}
            </div></details>
          </div></section>
          <div className="inspector-accordions">
            <details><summary><InboxIcon name="note" /><strong>Notes</strong><InboxIcon name="chevron" /></summary><p className="inspector-muted">{typeof contact?.field_values?.notes === "string" ? contact.field_values.notes : "No notes saved for this contact."}</p></details>
            <details><summary><InboxIcon name="history" /><strong>Previous Conversations</strong><span className="inspector-count">{Math.max(0, historyTotal - (history.some((item) => item.id === conversation.id) ? 1 : 0))}</span><InboxIcon name="chevron" /></summary>{historyList}</details>
            <details><summary><InboxIcon name="clock" /><strong>Activity</strong><InboxIcon name="chevron" /></summary><dl className="inspector-activity"><div><dt>Conversation started</dt><dd>{new Date(conversation.created_at).toLocaleString()}</dd></div><div><dt>Last message</dt><dd>{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : "No messages yet"}</dd></div><div><dt>Reply mode</dt><dd>{conversation.mode === "human" ? "Human" : "AI chatbot"}</dd></div></dl></details>
          </div>
        </>}
        {tab === "history" && <section className="inspector-tab-section"><h2>Conversation history</h2>{historyList}</section>}
        {tab === "automation" && <section className="inspector-tab-section"><span className="inspector-automation-icon"><InboxIcon name="lightning" /></span><h2>{conversation.mode === "human" ? "Human takeover is active" : "AI chatbot is active"}</h2><p className="inspector-muted">{conversation.mode === "human" ? "Automatic replies are paused for this conversation." : "Connected automations can respond to this conversation."}</p><button type="button" className="send-button" onClick={() => onModeChange(conversation.mode === "human" ? "chatbot" : "human")}>{conversation.mode === "human" ? "Resume AI replies" : "Take over conversation"}</button><Link className="text-action" href="/automations">Manage automations</Link></section>}
      </div>
    </aside>
  );
}
