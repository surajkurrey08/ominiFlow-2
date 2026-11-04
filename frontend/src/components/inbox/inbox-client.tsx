"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { InboxApiError, assignInboxConversation, changeInboxConversationMode, changeInboxConversationStatus, getInboxChannelAvailability, getInboxContactDetails, getInboxConversation, getInboxFilterOptions, getInboxTemplates, inboxMediaUrl, listInboxConversations, listInboxMessages, markInboxConversationRead, sendInboxTextMessage, sendInboxTemplateMessage, type InboxChannelOption, type InboxContactDetails, type InboxTemplateOption, type InboxUserOption } from "@/lib/api/inbox";
import { uploadTemplateMedia } from "@/lib/templates/browser";
import type { Conversation, ConversationListParams, ConversationStatus } from "@/lib/api/conversations";
import { MAX_TEXT_LENGTH, type Message } from "@/lib/api/messages";
import { canSendWhatsAppReply, INBOX_STATUSES } from "@/lib/inbox/proxy-utils";
import { createInboxEventStream, type InboxConnectionState } from "@/lib/realtime/inbox";
import { InboxIcon, ChannelBadge } from "@/components/inbox/inbox-icons";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { InboxWorkspaceHeader, type InboxCounts, type InboxMetric } from "@/components/inbox/inbox-workspace-header";
import { InboxContactPanel, type ContactPanelTab } from "@/components/inbox/inbox-contact-panel";
import type { ChannelType } from "@/lib/api/channels";

const PAGE_SIZE = 25;
const MESSAGE_PAGE_SIZE = 100;

function contactInitial(name: string | null | undefined) {
  return name?.match(/[\p{L}\p{N}]/u)?.[0].toUpperCase() || "?";
}

interface InboxClientProps {
  initialConversationId: string | null;
}

type Readiness = { can_send: boolean } | null;
type ContactAvailability = { is_blocked: boolean } | null;

function shortTime(value: string | null | undefined) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function fullTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function messageDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toDateString();
}

function messageDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short", day: "numeric", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function messageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function conversationPreview(conversation: Conversation) {
  const latest = conversation.last_message;
  if (!latest) return "No messages yet";
  if (latest.text) return latest.text;
  const type = latest.message_type;
  if (type === "image") return "Image attachment";
  if (type === "video") return "Video attachment";
  if (type === "audio") return "Audio message";
  if (type === "document") return "Document attachment";
  if (type === "location") return "Shared a location";
  if (type === "template") return "Template message";
  return "Message";
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => {
    const aTime = new Date(a.sent_at ?? a.created_at).getTime();
    const bTime = new Date(b.sent_at ?? b.created_at).getTime();
    return aTime - bTime || a.id.localeCompare(b.id);
  });
}

function supportsInboxTemplate(template: InboxTemplateOption) {
  if (!template || !Array.isArray(template.components)) return false;
  const header = template.components.find((component) => String(component.type).toUpperCase() === "HEADER");
  if (header) {
    const fmt = String(header.format || (header.text ? "TEXT" : "")).toUpperCase();
    if (fmt && !["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) return false;
  }
  const buttons = template.components.find((component) => String(component.type).toUpperCase() === "BUTTONS");
  return !Array.isArray(buttons?.buttons) || buttons.buttons.every((button) =>
    !button || typeof button !== "object" || String((button as Record<string, unknown>).type).toUpperCase() !== "URL" ||
    typeof (button as Record<string, unknown>).url !== "string" || !String((button as Record<string, unknown>).url).includes("{{"));
}

export function InboxClient({ initialConversationId }: InboxClientProps) {
  const shell = useWorkspaceShell();
  const setShellInboxTotal = shell?.setInboxTotal;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [unreadFilter, setUnreadFilter] = useState<"all" | "unread" | "read">("all");
  const [channelFilter, setChannelFilter] = useState("");
  const [channelTypeFilter, setChannelTypeFilter] = useState<ChannelType | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [channels, setChannels] = useState<InboxChannelOption[]>([]);
  const [users, setUsers] = useState<InboxUserOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [messagesLoading, setMessagesLoading] = useState(Boolean(initialConversationId));
  const [messagesError, setMessagesError] = useState("");
  const [readiness, setReadiness] = useState<Readiness>(null);
  const [contactAvailability, setContactAvailability] = useState<ContactAvailability>(null);
  const [contactDetails, setContactDetails] = useState<InboxContactDetails | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [sendError, setSendError] = useState("");
  const [uncertainSend, setUncertainSend] = useState(false);
  const [liveState, setLiveState] = useState<InboxConnectionState>("connecting");
  const [liveMessage, setLiveMessage] = useState("");
  const [mobileThread, setMobileThread] = useState(Boolean(initialConversationId));
  const [templates, setTemplates] = useState<InboxTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateChannelId, setTemplateChannelId] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateValues, setTemplateValues] = useState<string[]>([]);
  const [templateHeaderValues, setTemplateHeaderValues] = useState<string[]>([]);
  const [templateMediaFile, setTemplateMediaFile] = useState<File | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [showContactDetails, setShowContactDetails] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<ContactPanelTab>("details");
  const [openTagPicker, setOpenTagPicker] = useState(false);
  const [pinnedConversations, setPinnedConversations] = useState<Set<string>>(new Set());
  const [composerTool, setComposerTool] = useState<"emoji" | "quick" | "variables" | "add" | null>(null);
  const [counts, setCounts] = useState<InboxCounts>({ all: null, unassigned: null, pending: null, resolved: null, unread: null });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailsToggleRef = useRef<HTMLButtonElement>(null);

  const selectedIdRef = useRef(selectedId);
  const selectedConversationRef = useRef(selectedConversation);
  const listRequestId = useRef(0);
  const messageRequestId = useRef(0);
  const selectionRequestId = useRef(0);
  const messagePageRef = useRef(1);
  const loadConversationsRef = useRef<(showLoading?: boolean) => Promise<void>>(async () => {});
  const refreshThreadRef = useRef<(conversationId: string) => Promise<void>>(async () => {});
  const threadRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const atLatestRef = useRef(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const scrollMode = useRef<"bottom" | number | null>(null);
  const summaryRequestId = useRef(0);
  const refreshSummaryRef = useRef<() => Promise<void>>(async () => {});

  const refreshSummary = useCallback(async () => {
    const request = ++summaryRequestId.current;
    const filters = [{}, { unassigned: true }, { status: "pending" as const }, { status: "resolved" as const }, { unread: true }];
    const results = await Promise.allSettled(filters.map((filter) => listInboxConversations({ page: 1, page_size: 1, ...filter })));
    if (request !== summaryRequestId.current) return;
    const keys: InboxMetric[] = ["all", "unassigned", "pending", "resolved", "unread"];
    setCounts(Object.fromEntries(keys.map((key, index) => [key, results[index].status === "fulfilled" ? (results[index] as PromiseFulfilledResult<Awaited<ReturnType<typeof listInboxConversations>>>).value.total : null])) as InboxCounts);
    if (results[0].status === "fulfilled") setShellInboxTotal?.(results[0].value.total);
  }, [setShellInboxTotal]);

  useEffect(() => {
    refreshSummaryRef.current = refreshSummary;
    void refreshSummary();
    return () => { summaryRequestId.current += 1; };
  }, [refreshSummary]);

  const updateScrollPosition = useCallback(() => {
    const element = threadRef.current;
    if (!element) return;
    const atLatest = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    atLatestRef.current = atLatest;
    setAwayFromLatest(!atLatest);
  }, []);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedConversationRef.current = selectedConversation; }, [selectedConversation]);

  const updateUrl = useCallback((conversationId: string | null) => {
    const url = new URL(window.location.href);
    if (conversationId) url.searchParams.set("conversation", conversationId);
    else url.searchParams.delete("conversation");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const loadConversations = useCallback(async (showLoading = false) => {
    const requestId = ++listRequestId.current;
    if (showLoading) setListLoading(true);
    setListError("");
    const params: ConversationListParams = {
      page,
      page_size: PAGE_SIZE,
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(unreadFilter !== "all" ? { unread: unreadFilter === "unread" } : {}),
      ...(channelFilter ? { channel_id: channelFilter } : {}),
      ...(channelTypeFilter ? { channel_type: channelTypeFilter } : {}),
      ...(assigneeFilter === "unassigned" ? { unassigned: true } : assigneeFilter ? { assigned_user_id: assigneeFilter } : {}),
      ...(appliedSearch ? { search: appliedSearch } : {}),
    };

    try {
      const result = await listInboxConversations(params);
      if (requestId !== listRequestId.current) return;
      setConversations(result.items);
      setTotal(result.total);
      const selected = selectedIdRef.current;
      const latestSelected = result.items.find((item) => item.id === selected);
      if (latestSelected) setSelectedConversation(latestSelected);
      if (!selected && result.items[0]) {
        setSelectedId(result.items[0].id);
        setSelectedConversation(result.items[0]);
        setMessages([]);
        setMessageTotal(0);
        setMessagesLoading(true);
        setLoadingEarlier(false);
        setReadiness(null);
        setContactAvailability(null);
        setAvailabilityError("");
        setMobileThread(true);
        updateUrl(result.items[0].id);
      }
    } catch (error) {
      if (requestId === listRequestId.current) {
        setListError(error instanceof Error ? error.message : "Could not load conversations.");
      }
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  }, [page, statusFilter, unreadFilter, channelFilter, channelTypeFilter, assigneeFilter, appliedSearch, updateUrl]);

  useEffect(() => { loadConversationsRef.current = loadConversations; }, [loadConversations]);

  useEffect(() => { void Promise.resolve().then(() => loadConversations()); }, [loadConversations]);

  useEffect(() => {
    let active = true;
    void getInboxFilterOptions().then((options) => {
      if (!active) return;
      setChannels(options.channels);
      setUsers(options.users);
    }).catch(() => {
      // Conversation search/list remains available if optional filter data cannot load.
    });
    return () => { active = false; };
  }, []);

  const loadMessages = useCallback(async (conversationId: string, appendOlder = false) => {
    const requestId = ++messageRequestId.current;
    setMessagesError("");
    if (!appendOlder) setMessagesLoading(true);
    const nextPage = appendOlder ? messagePageRef.current + 1 : 1;
    if (appendOlder) setLoadingEarlier(true);

    try {
      const result = await listInboxMessages(conversationId, nextPage, MESSAGE_PAGE_SIZE);
      if (requestId !== messageRequestId.current) return;
      const chronological = [...result.items].reverse();
      if (appendOlder) {
        scrollMode.current = threadRef.current?.scrollHeight ?? 0;
        setMessages((current) => mergeMessages(chronological, current));
        messagePageRef.current = nextPage;
      } else {
        const nearBottom = !threadRef.current ||
          threadRef.current.scrollHeight - threadRef.current.scrollTop - threadRef.current.clientHeight < 100;
        if (nearBottom) scrollMode.current = "bottom";
        setMessages((current) => current.length ? mergeMessages(current, chronological) : chronological);
      }
      setMessageTotal(result.total);
    } catch (error) {
      if (requestId === messageRequestId.current) {
        setMessagesError(error instanceof Error ? error.message : "Could not load message history.");
      }
    } finally {
      if (requestId === messageRequestId.current) {
        if (!appendOlder) setMessagesLoading(false);
        else setLoadingEarlier(false);
      }
    }
  }, []);

  useLayoutEffect(() => {
    const element = threadRef.current;
    const mode = scrollMode.current;
    if (!element || mode === null) return;
    if (mode === "bottom") element.scrollTop = element.scrollHeight;
    else element.scrollTop += element.scrollHeight - mode;
    scrollMode.current = null;
    updateScrollPosition();
  }, [messages, updateScrollPosition]);

  useEffect(() => {
    const history = threadRef.current;
    const content = messageContentRef.current;
    if (!history || !content) return;
    const observer = new ResizeObserver(() => {
      // Keep the latest reply in view when media loads or the composer grows.
      // Reading older messages must retain the reader's scroll position.
      if (atLatestRef.current) history.scrollTop = history.scrollHeight;
      updateScrollPosition();
    });
    observer.observe(history);
    observer.observe(content);
    return () => observer.disconnect();
  }, [selectedConversation?.id, updateScrollPosition]);

  useEffect(() => {
    if (!selectedId) {
      selectionRequestId.current += 1;
      messageRequestId.current += 1;
      return;
    }

    let active = true;
    const currentSelectionRequestId = ++selectionRequestId.current;
    const historyRequestId = ++messageRequestId.current;
    const selectedBefore = selectedConversationRef.current;
    const conversationPromise = selectedBefore?.id === selectedId
      ? Promise.resolve(selectedBefore)
      : getInboxConversation(selectedId);

    messagePageRef.current = 1;
    void conversationPromise.then(async (conversation) => {
      if (!active) return;
      setSelectedConversation(conversation);
      setMessagesLoading(true);
      setMessagesError("");
      setReadiness(null);
      setContactAvailability(null);
      setContactDetails(null);
      setAvailabilityError("");
      setSendError("");
      setUncertainSend(false);
      const [history, channel, contact] = await Promise.allSettled([
        listInboxMessages(selectedId, 1, MESSAGE_PAGE_SIZE),
        getInboxChannelAvailability(conversation.channel.id),
        getInboxContactDetails(conversation.contact.id),
      ]);
      if (!active || currentSelectionRequestId !== selectionRequestId.current) return;

      const historyResult = history as PromiseSettledResult<Awaited<ReturnType<typeof listInboxMessages>>>;
      if (historyRequestId === messageRequestId.current) {
        if (historyResult.status === "fulfilled") {
          const chronological = [...historyResult.value.items].reverse();
          atLatestRef.current = true;
          scrollMode.current = "bottom";
          setMessages(chronological);
          setMessageTotal(historyResult.value.total);
        } else {
          setMessagesError(historyResult.reason instanceof Error ? historyResult.reason.message : "Could not load message history.");
        }
      }

      const channelResult = channel as PromiseSettledResult<{ can_send: boolean }>;
      const contactResult = contact as PromiseSettledResult<InboxContactDetails>;
      if (channelResult.status === "fulfilled") setReadiness(channelResult.value);
      else setAvailabilityError("Could not confirm the WhatsApp channel state. Refresh to try again.");
      if (contactResult.status === "fulfilled") {
        setContactDetails(contactResult.value);
        setContactAvailability({ is_blocked: contactResult.value.is_blocked });
      }
      else setAvailabilityError("Could not confirm whether this contact can receive messages. Refresh to try again.");

      if (conversation.unread_count > 0) {
        void markInboxConversationRead(selectedId).then((updated) => {
          if (!active) return;
          setSelectedConversation(updated);
          setConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
        }).catch((error: unknown) => {
          if (active) setMessagesError(error instanceof Error ? "Messages loaded, but read status could not be updated." : "Read status could not be updated.");
        });
      }
      if (historyRequestId === messageRequestId.current) setMessagesLoading(false);
    }).catch((error: unknown) => {
      if (!active || currentSelectionRequestId !== selectionRequestId.current) return;
      const message = error instanceof Error ? error.message : "Conversation could not be opened.";
      setMessagesError(message);
      setSelectedConversation(null);
      if (error instanceof InboxApiError && error.status === 404) {
        setSelectedId(null);
        selectedIdRef.current = null;
        setMessages([]);
        setMessageTotal(0);
        setReadiness(null);
        setContactAvailability(null);
        updateUrl(null);
      }
      setMessagesLoading(false);
    });

    return () => { active = false; };
  }, [selectedId, updateUrl]);

  const refreshThread = useCallback(async (conversationId: string) => {
    const [conversationResult] = await Promise.allSettled([
      getInboxConversation(conversationId),
      loadMessages(conversationId),
    ]);
    if (conversationResult.status === "fulfilled" && selectedIdRef.current === conversationId) {
      setSelectedConversation(conversationResult.value);
    }
  }, [loadMessages]);

  useEffect(() => { refreshThreadRef.current = refreshThread; }, [refreshThread]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const stream = createInboxEventStream({
      onStateChange: (state) => {
        setLiveState(state);
        if (state === "connected") {
          void loadConversationsRef.current(false);
          void refreshSummaryRef.current();
          const currentId = selectedIdRef.current;
          if (currentId) void refreshThreadRef.current(currentId);
        }
      },
      onAuthError: (code) => {
        if (code === 4401) {
          const destination = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/login?reason=session-expired&next=${encodeURIComponent(destination)}`);
        } else {
          setLiveMessage("Your role does not allow live inbox updates. You can still refresh manually.");
        }
      },
    });
    const unsubscribe = stream.onEvent((event) => {
      setLiveMessage("");
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadConversationsRef.current(false);
        void refreshSummaryRef.current();
        const currentId = selectedIdRef.current;
        if (currentId && event.conversation_id === currentId) {
          void refreshThreadRef.current(currentId);
        }
      }, 100);
    });
    stream.connect();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
      stream.disconnect();
    };
  }, []);

  const selectConversation = useCallback((conversation: Conversation) => {
    if (selectedIdRef.current === conversation.id) {
      setMobileThread(true);
      return;
    }
    setSelectedId(conversation.id);
    selectedIdRef.current = conversation.id;
    setSelectedConversation(conversation);
    setMessages([]);
    setMessageTotal(0);
    setMessagesLoading(true);
    setLoadingEarlier(false);
    setReadiness(null);
    setContactAvailability(null);
    setAvailabilityError("");
    setMobileThread(true);
    setDraft("");
    setSendError("");
    setUncertainSend(false);
    setMobileInspectorOpen(false);
    setComposerTool(null);
    updateUrl(conversation.id);
  }, [updateUrl]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !draft.trim() || sendingRef.current || uncertainSend || canReplyReason) return;
    const outgoingText = draft;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const message = await sendInboxTextMessage(selectedId, outgoingText);
      scrollMode.current = "bottom";
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
      void loadConversations(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Message could not be sent.";
      setSendError(message);
      const definitelyRejected = error instanceof InboxApiError && error.outcome === "rejected";
      if (!definitelyRejected && (!(error instanceof InboxApiError) || error.status === 0 || error.status >= 500)) {
        setUncertainSend(true);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function updateConversation(updated: Conversation) {
    setSelectedConversation((current) => current?.id === updated.id ? updated : current);
    setConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
    await loadConversations(false);
    void refreshSummary();
  }

  async function handleModeChange(mode: "chatbot" | "human") {
    if (!selectedConversation) return;
    try {
      const updated = await changeInboxConversationMode(selectedConversation.id, mode);
      await updateConversation(updated);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Mode could not be changed.");
    }
  }

  async function openTemplatePicker() {
    if (!selectedConversation) return;
    const willOpen = !templateOpen;
    setTemplateOpen(willOpen);
    if (!willOpen) return;

    const channelId = selectedConversation.channel.id;
    if (templateChannelId === channelId && templates.length > 0) return;

    setTemplatesLoading(true);
    try {
      const result = await getInboxTemplates(channelId);
      setTemplates(result.items);
      setTemplateChannelId(channelId);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not load approved templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const templateBody = selectedTemplate?.components.find((component) => String(component.type).toUpperCase() === "BODY");
  const templateHeader = selectedTemplate?.components.find((component) => String(component.type).toUpperCase() === "HEADER");
  const templateBodyText = typeof templateBody?.text === "string" ? templateBody.text : "";
  const templateHeaderFormat = String(templateHeader?.format ?? "").toUpperCase();
  const templateHeaderText = typeof templateHeader?.text === "string" ? templateHeader.text : "";
  const templateHeaderVariables = [...new Set(templateHeaderText.match(/{{\s*[a-z_][a-z0-9_]*\s*}}|{{\s*\d+\s*}}/gi) ?? [])];
  const templateVariables = [...new Set(templateBodyText.match(/{{\s*[a-z_][a-z0-9_]*\s*}}|{{\s*\d+\s*}}/gi) ?? [])];

  async function sendTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedConversation || !selectedTemplate || templateBusy || canReplyReason) return;
    setTemplateBusy(true);
    setSendError("");
    try {
      const components: Record<string, unknown>[] = [];
      if (templateHeaderFormat === "TEXT" && templateHeaderVariables.length) {
        components.push({
          type: "header",
          parameters: templateHeaderVariables.map((variable, index) => ({
            type: "text", text: templateHeaderValues[index] ?? "",
            ...( /^[{\s]*[a-z_]/i.test(variable) ? { parameter_name: variable.replace(/[{}\s]/g, "") } : {}),
          })),
        });
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(templateHeaderFormat)) {
        if (!templateMediaFile) throw new Error(`Choose a ${templateHeaderFormat.toLowerCase()} header file.`);
        const media = await uploadTemplateMedia(
          selectedConversation.channel.id,
          templateHeaderFormat.toLowerCase() as "image" | "video" | "document",
          templateMediaFile,
        );
        components.push({
          type: "header",
          parameters: [{
            type: templateHeaderFormat.toLowerCase(),
            id: media.id,
            ...(templateHeaderFormat === "DOCUMENT" ? { filename: media.filename } : {}),
          }],
        });
      }
      if (templateVariables.length) {
        components.push({
          type: "body",
          parameters: templateVariables.map((variable, index) => ({
          type: "text", text: templateValues[index] ?? "",
          ...( /^[{\s]*[a-z_]/i.test(variable) ? { parameter_name: variable.replace(/[{}\s]/g, "") } : {}),
          })),
        });
      }
      const result = await sendInboxTemplateMessage(selectedId, {
        type: "template", template_name: selectedTemplate.name,
        language: selectedTemplate.language, components,
      });
      scrollMode.current = "bottom";
      setMessages((current) => mergeMessages(current, [result]));
      setTemplateOpen(false); setTemplateId(""); setTemplateValues([]); setTemplateHeaderValues([]); setTemplateMediaFile(null);
      void loadConversations(false);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Template could not be sent.");
    } finally {
      setTemplateBusy(false);
    }
  }

  const canReplyReason = selectedConversation
    ? availabilityError || canSendWhatsAppReply(selectedConversation, readiness, contactAvailability)
    : "Select a conversation to reply.";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canLoadEarlier = messages.length < messageTotal;
  const activeFilterCount = [statusFilter !== "all", unreadFilter !== "all", Boolean(channelFilter), Boolean(assigneeFilter)].filter(Boolean).length;
  const activeMetric: InboxMetric | null = unreadFilter === "unread" ? "unread" : assigneeFilter === "unassigned" ? "unassigned" : statusFilter === "pending" ? "pending" : statusFilter === "resolved" ? "resolved" : statusFilter === "all" && !assigneeFilter ? "all" : null;

  function selectMetric(metric: InboxMetric) {
    setStatusFilter(metric === "pending" || metric === "resolved" ? metric : "all");
    setAssigneeFilter(metric === "unassigned" ? "unassigned" : "");
    setUnreadFilter(metric === "unread" ? "unread" : "all");
    setPage(1);
  }

  function refreshInbox() {
    void loadConversations(true);
    void refreshSummary();
    if (selectedIdRef.current) void refreshThread(selectedIdRef.current);
  }

  function revealContact(tab: ContactPanelTab = "details", tags = false) {
    setPanelTab(tab); setShowContactDetails(true); setMobileInspectorOpen(true);
    if (tags) setOpenTagPicker(true);
  }

  function insertDraft(value: string) {
    const input = composerRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + value + draft.slice(end);
    if (next.length > MAX_TEXT_LENGTH) { setSendError(`Replies can contain up to ${MAX_TEXT_LENGTH} characters.`); return; }
    setDraft(next); setComposerTool(null);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + value.length, start + value.length); });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim().slice(0, 100));
    setPage(1);
  }

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  return (
    <section className="inbox-page page-enter" aria-label="Inbox">
      <InboxWorkspaceHeader counts={counts} metric={activeMetric} onSelect={selectMetric} liveState={liveState} refreshing={listLoading} onRefresh={refreshInbox} />

      {liveMessage && <p role="status" className="inbox-live-warning">{liveMessage}</p>}

      <div className={`inbox-layout ${showContactDetails && selectedConversation ? "inbox-details-open" : ""} ${mobileInspectorOpen ? "inbox-details-mobile-open" : ""} ${mobileThread ? "inbox-has-selection" : ""}`}>
        <aside className={`conversation-pane min-h-0 flex-col border-r border-slate-200 ${mobileThread ? "hidden md:flex" : "flex"}`} aria-label="Conversation list">
          <div className="conversation-pane-header">
            <div className="inbox-channel-tabs" role="group" aria-label="Filter by channel">
              <button type="button" className="channel-tab-all" aria-pressed={!channelTypeFilter} onClick={() => { setChannelTypeFilter(""); setChannelFilter(""); setPage(1); }}>All</button>
              {([ ["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["email", "Email"], ["facebook", "Messenger"] ] as const).map(([type, label]) => <button type="button" key={type} aria-label={`${label} conversations`} aria-pressed={channelTypeFilter === type} disabled={type === "email"} title={type === "email" ? "Email integration is not available" : `${label} conversations`} onClick={() => { if (type === "email") return; setChannelTypeFilter(type); setChannelFilter(""); setPage(1); }}><ChannelBadge type={type} size={23} /></button>)}
              <button type="button" className="channel-tab-filter" aria-label="Show conversation filters" title="Conversation filters" onClick={() => { const filter = document.getElementById("inbox-filters") as HTMLDetailsElement | null; if (filter) filter.open = !filter.open; }}><InboxIcon name="filter" />{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
            </div>

            <form className="inbox-search" onSubmit={submitSearch} role="search" noValidate>
              <label className="sr-only" htmlFor="inbox-search">Search conversations</label>
              <span><InboxIcon name="search" /></span>
              <input ref={searchRef} id="inbox-search" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} placeholder="Search conversations" />
              {searchInput && <button type="button" onClick={() => { setSearchInput(""); setAppliedSearch(""); setPage(1); searchRef.current?.focus(); }} aria-label="Clear search"><InboxIcon name="close" /></button>}
            </form>

            <details className="inbox-filters" id="inbox-filters">
              <summary><InboxIcon name="filter" /><span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span><span className="filter-chevron" aria-hidden="true">⌄</span></summary>
              <div className="inbox-filter-grid">
              <label>
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => updateFilter(setStatusFilter, event.target.value as ConversationStatus | "all")}>
                  <option value="all">All statuses</option>
                  {INBOX_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                </select>
              </label>
              <label>
                <span>Unread</span>
                <select value={unreadFilter} onChange={(event) => updateFilter(setUnreadFilter, event.target.value as typeof unreadFilter)}>
                  <option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option>
                </select>
              </label>
              <label>
                <span>Channel</span>
                <select value={channelFilter} onChange={(event) => updateFilter(setChannelFilter, event.target.value)}>
                  <option value="">All channels</option>
                  {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                </select>
              </label>
              <label>
                <span>Assigned</span>
                <select value={assigneeFilter} onChange={(event) => updateFilter(setAssigneeFilter, event.target.value)}>
                  <option value="">Everyone</option><option value="unassigned">Unassigned</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.role}</option>)}
                </select>
              </label>
              </div>
            </details>
          </div>

          {listError ? (
            <div className="inbox-list-state" role="alert">
              <span className="empty-state-mark">!</span>
              <p className="mt-3 text-sm font-semibold text-slate-800">Conversations could not load</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{listError}</p>
              <button className="text-action mt-3" type="button" onClick={() => void loadConversations(true)}>Try again</button>
            </div>
          ) : listLoading && conversations.length === 0 ? (
            <div className="inbox-list-state" role="status"><span className="loading-spinner" /><p className="mt-3 text-sm text-slate-500">Loading conversations…</p></div>
          ) : conversations.length === 0 ? (
            <div className="inbox-list-state">
              <span className="empty-state-mark">◎</span>
              <p className="mt-3 text-sm font-semibold text-slate-800">No conversations here yet</p>
              <p className="mt-1 max-w-52 text-xs leading-5 text-slate-500">New customer conversations will appear here when they arrive.</p>
              {(appliedSearch || statusFilter !== "all" || unreadFilter !== "all" || channelFilter || channelTypeFilter || assigneeFilter) && (
                <button className="text-action mt-3" type="button" onClick={() => {
                  setAppliedSearch(""); setSearchInput(""); setStatusFilter("all"); setUnreadFilter("all"); setChannelFilter(""); setChannelTypeFilter(""); setAssigneeFilter(""); setPage(1);
                }}>Clear filters</button>
              )}
            </div>
          ) : (
            <div className="conversation-list" aria-label="Conversations">
              {[...conversations].sort((a, b) => Number(pinnedConversations.has(b.id)) - Number(pinnedConversations.has(a.id))).map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={`conversation-row ${selectedId === conversation.id ? "conversation-row-selected" : ""} ${conversation.unread_count > 0 ? "conversation-row-unread" : ""}`}
                  onClick={() => selectConversation(conversation)}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                >
                  <span className="contact-avatar" aria-hidden="true">{contactInitial(conversation.contact.name)}</span>
                  <span className="conversation-row-content">
                    <span className="conversation-row-top">
                      <span className="conversation-contact"><ChannelBadge type={conversation.channel.channel_type} /><span>{conversation.contact.name || "Unknown contact"}</span>{pinnedConversations.has(conversation.id) && <InboxIcon name="star" filled />}</span>
                      <time className="conversation-time" dateTime={conversation.last_message_at ?? conversation.updated_at}>{shortTime(conversation.last_message_at ?? conversation.updated_at)}</time>
                    </span>
                    <span className="conversation-row-bottom">
                      <span className="conversation-preview">{conversationPreview(conversation)}</span>
                      {conversation.unread_count > 0 && <span className="unread-count" aria-label={`${conversation.unread_count} unread messages`}>{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="conversation-pagination">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || listLoading} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page">←</button>
              <button type="button" disabled={page >= pageCount || listLoading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label="Next page">→</button>
            </div>
          </div>
        </aside>

        <section className={`thread-pane min-w-0 flex-col ${mobileThread ? "flex" : "hidden md:flex"}`} aria-label="Message thread">
          {selectedConversation ? (
            <>
              <header className="thread-header">
                <button type="button" className="thread-back" onClick={() => setMobileThread(false)} aria-label="Back to conversations"><InboxIcon name="back" /></button>
                <span className="contact-avatar contact-avatar-thread" aria-hidden="true">{contactInitial(selectedConversation.contact.name)}</span>
                <div className="thread-contact">
                  <h2>{selectedConversation.contact.name || "Unknown contact"}</h2>
                  <p><ChannelBadge type={selectedConversation.channel.channel_type} />{selectedConversation.contact.phone_number || selectedConversation.channel.name}</p>
                </div>
                <div className="thread-header-actions">
                  <button type="button" className="inbox-icon-button thread-pin" aria-label="Pin conversation in this view" aria-pressed={pinnedConversations.has(selectedConversation.id)} title="Pin conversation in this view" onClick={() => setPinnedConversations((current) => { const next = new Set(current); if (next.has(selectedConversation.id)) next.delete(selectedConversation.id); else next.add(selectedConversation.id); return next; })}><InboxIcon name="star" filled={pinnedConversations.has(selectedConversation.id)} /></button>
                  <button type="button" className="inbox-icon-button thread-tag-action" aria-label="Manage contact tags" title="Contact tags" onClick={() => revealContact("details", true)}><InboxIcon name="tag" /></button>
                  <details className="thread-more-menu"><summary className="inbox-icon-button" aria-label="Conversation actions" title="Conversation actions"><InboxIcon name="more" /></summary><div><button type="button" onClick={() => void refreshThread(selectedConversation.id)}>Refresh messages</button><button type="button" onClick={() => revealContact()}>Contact details</button><a href="/channels">Manage channel</a></div></details>
                  <button type="button" className="takeover-button" onClick={() => void handleModeChange(selectedConversation.mode === "human" ? "chatbot" : "human")} title={selectedConversation.mode === "human" ? "Resume chatbot replies" : "Pause the chatbot and take over"}><InboxIcon name="user" /><span>{selectedConversation.mode === "human" ? "Release" : "Takeover"}</span></button>
                  <button ref={detailsToggleRef} type="button" className="inbox-icon-button thread-details-action" onClick={() => revealContact()} aria-label="Contact details" aria-expanded={mobileInspectorOpen} aria-controls="inbox-contact-details" title="Contact details"><InboxIcon name="info" /></button>
                </div>
              </header>

              <div className="thread-toolbar">
                <div className="thread-toolbar-fields">
                  <label className="thread-field">
                    <span className="sr-only">Assignee</span><InboxIcon name="user" />
                    <select aria-label="Assign conversation" value={selectedConversation.assigned_user?.id ?? ""}
                      onChange={(event) => void assignInboxConversation(selectedConversation.id, event.target.value || null)
                        .then(updateConversation).catch((error) => setSendError(error instanceof Error ? error.message : "Assignment could not be changed."))}>
                      <option value="">Unassigned</option>
                      {users.map((user) => <option key={user.id} value={user.id}>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.role}</option>)}
                    </select>
                  </label>
                  <label className="thread-field">
                    <span className="sr-only">Status</span><span className={`conversation-status-dot status-${selectedConversation.status}`} aria-hidden="true" />
                    <select aria-label="Conversation status" value={selectedConversation.status}
                      onChange={(event) => void changeInboxConversationStatus(selectedConversation.id, event.target.value as ConversationStatus)
                        .then(updateConversation).catch((error) => setSendError(error instanceof Error ? error.message : "Status could not be changed."))}>
                      {INBOX_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="reply-mode" role="group" aria-label="Reply mode">
                  <button type="button" aria-pressed={(selectedConversation.mode ?? "chatbot") === "chatbot"} onClick={() => void handleModeChange("chatbot")} title="Chatbot replies automatically" aria-label="AI chatbot replies"><InboxIcon name="sparkle" />AI</button>
                  <button type="button" aria-pressed={selectedConversation.mode === "human"} onClick={() => void handleModeChange("human")} title="Pause automation and reply manually">Human</button>
                </div>
              </div>

              <div className="message-area">
                <div className="message-history min-h-0 flex-1 overflow-y-auto" ref={threadRef} onScroll={updateScrollPosition} tabIndex={0} role="log" aria-live="polite" aria-label="Messages">
                  {canLoadEarlier && !messagesLoading && (
                    <button type="button" className="load-earlier-button" disabled={loadingEarlier} onClick={() => void loadMessages(selectedConversation.id, true)}>{loadingEarlier ? "Loading…" : "Load earlier messages"}</button>
                  )}
                  {messagesLoading && messages.length === 0 && <div className="thread-state" role="status"><span className="loading-spinner" /><span>Loading messages…</span></div>}
                  {messagesError && messages.length === 0 && (
                    <div className="thread-state" role="alert"><p>{messagesError}</p><button className="text-action" type="button" onClick={() => void refreshThread(selectedConversation.id)}>Try again</button></div>
                  )}
                  {!messagesLoading && !messagesError && messages.length === 0 && (
                    <div className="thread-state"><span className="empty-state-mark">✉</span><p className="mt-3 text-sm text-slate-500">No messages in this conversation yet.</p></div>
                  )}
                  <div className="message-history-content" ref={messageContentRef}>
                    {messages.map((message, index) => {
                      const timestamp = message.sent_at ?? message.created_at;
                      const previous = messages[index - 1];
                      const startsDay = !previous || messageDay(timestamp) !== messageDay(previous.sent_at ?? previous.created_at);
                      return (
                        <Fragment key={message.id}>
                          {startsDay && <div className="message-date"><span>{messageDayLabel(timestamp)}</span></div>}
                        <MessageBubble message={message} contactName={selectedConversation.contact.name} />
                        </Fragment>
                      );
                    })}
                  </div>
                  {messagesError && messages.length > 0 && <p role="status" className="thread-inline-error">{messagesError}</p>}
                </div>
                {awayFromLatest && messages.length > 0 && (
                  <button type="button" className="jump-to-latest" onClick={() => {
                    const history = threadRef.current;
                    if (!history) return;
                    history.scrollTop = history.scrollHeight;
                    updateScrollPosition();
                    history.focus({ preventScroll: true });
                  }}><InboxIcon name="down" /><span>Latest messages</span></button>
                )}
              </div>

              <div className="composer-wrap">
                {canReplyReason && <p className="composer-notice" role="status">{canReplyReason}</p>}
                {sendError && <div className={`send-error ${uncertainSend ? "send-error-uncertain" : ""}`} role="alert">
                  <p>{sendError}</p>
                  {/WhatsApp authentication failed/i.test(sendError) && <a className="text-action mt-2 inline-block" href="/channels">Open Channels to reconnect WhatsApp</a>}
                  {uncertainSend && <>
                    <p className="mt-1 text-xs leading-5">The message may already have reached WhatsApp. Refresh and check the thread before deciding whether to retry.</p>
                    <button type="button" className="text-action mt-2" onClick={() => void refreshThread(selectedConversation.id)}>Refresh message status</button>
                    <details className="retry-confirmation">
                      <summary>I checked the message status</summary>
                      <p>Only retry if the previous reply was not sent. Retrying can create a duplicate.</p>
                      <button type="button" className="retry-confirm" onClick={() => { setUncertainSend(false); setSendError(""); }}>Confirm it was not sent — allow one retry</button>
                    </details>
                  </>}
                </div>}
                {templateOpen && (
                  <form className="mb-2.5 max-h-[260px] overflow-y-auto rounded-xl border border-indigo-200 bg-slate-50/95 p-3 shadow-xs" noValidate onSubmit={(event) => {
                    if (!event.currentTarget.checkValidity()) {
                      event.preventDefault();
                      setSendError("Complete the required template fields.");
                      event.currentTarget.querySelector<HTMLElement>(":invalid")?.focus();
                      return;
                    }
                    void sendTemplate(event);
                  }}>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-bold text-slate-800 uppercase tracking-wide">Approved WhatsApp Template</strong>
                        {templatesLoading && <span className="text-xs text-indigo-600 animate-pulse font-medium">Loading templates…</span>}
                      </div>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer" onClick={() => setTemplateOpen(false)}>✕ Close</button>
                    </div>
                    <label className="mt-2.5 block text-xs font-medium text-slate-600">Choose template
                      <select
                        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                        value={templateId}
                        disabled={templatesLoading}
                        onChange={(event) => { setTemplateId(event.target.value); setTemplateValues([]); setTemplateHeaderValues([]); setTemplateMediaFile(null); }}
                      >
                        <option value="">
                          {templatesLoading
                            ? "⏳ Loading approved templates…"
                            : templates.filter(supportsInboxTemplate).length === 0
                              ? "No approved templates available"
                              : "Choose a template…"}
                        </option>
                        {templates.filter(supportsInboxTemplate).map((template) => (
                          <option key={template.id} value={template.id}>{template.name} · {template.language}</option>
                        ))}
                      </select>
                    </label>
                    {selectedTemplate && templateHeaderVariables.map((variable, index) => (
                      <label key={`header-${variable}-${index}`} className="mt-2 block text-xs font-medium text-slate-600">Header value for {variable}
                        <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs" required maxLength={60} value={templateHeaderValues[index] ?? ""}
                          onChange={(event) => setTemplateHeaderValues((current) => { const next = [...current]; next[index] = event.target.value; return next; })} />
                      </label>
                    ))}
                    {selectedTemplate && ["IMAGE", "VIDEO", "DOCUMENT"].includes(templateHeaderFormat) && (
                      <label className="mt-2 block text-xs font-medium text-slate-600">
                        {templateHeaderFormat.toLowerCase()} header file
                        <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" type="file" required
                          accept={templateHeaderFormat === "IMAGE" ? "image/jpeg,image/png,.jpg,.jpeg,.png" : templateHeaderFormat === "VIDEO" ? "video/mp4,.mp4" : "application/pdf,.pdf"}
                          onChange={(event) => setTemplateMediaFile(event.target.files?.[0] ?? null)} />
                      </label>
                    )}
                    {selectedTemplate && templateVariables.map((variable, index) => (
                      <label key={`${variable}-${index}`} className="mt-2 block text-xs font-medium text-slate-600">Value for {variable}
                        <input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs" required maxLength={1024} value={templateValues[index] ?? ""}
                          onChange={(event) => setTemplateValues((current) => { const next = [...current]; next[index] = event.target.value; return next; })} />
                      </label>
                    ))}
                    {selectedTemplate && (
                      <div className="mt-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 leading-relaxed" aria-label="Template preview">
                        <span className="block font-semibold text-[11px] text-slate-500 uppercase tracking-wide mb-1">Preview</span>
                        {templateVariables.reduce((preview, variable, index) => preview.replace(variable, templateValues[index] || `[${variable}]`), templateBodyText) || selectedTemplate.name}
                      </div>
                    )}
                    <button className="send-button mt-3" type="submit" disabled={!selectedTemplate || templateBusy || Boolean(canReplyReason)}>
                      {templateBusy ? "Sending…" : "Confirm and send template"}
                    </button>
                  </form>
                )}
                <form className="reply-composer" onSubmit={sendReply} noValidate onKeyDown={(event) => { if (event.key === "Escape") { setComposerTool(null); composerRef.current?.focus(); } }}>
                  {composerTool && <div className="composer-toolbox">
                    <header><strong>{composerTool === "emoji" ? "Emoji" : composerTool === "quick" ? "Quick replies" : composerTool === "variables" ? "Contact variables" : "Add to your reply"}</strong><button type="button" className="inbox-icon-button" aria-label="Close reply tools" onClick={() => setComposerTool(null)}><InboxIcon name="close" /></button></header>
                    {composerTool === "emoji" && <div className="composer-emoji-list">{["😀", "😊", "👍", "🙏", "🎉", "❤️", "✅", "👋"].map((emoji) => <button type="button" key={emoji} onClick={() => insertDraft(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}
                    {composerTool === "quick" && <div className="composer-option-list">{["Hi! How can I help you today?", "Thank you for reaching out. I'll check and get back to you.", "You're welcome! Let us know if you need anything else."].map((reply) => <button type="button" key={reply} onClick={() => insertDraft(reply)}>{reply}</button>)}</div>}
                    {composerTool === "variables" && <div className="composer-option-list">{[["Contact name", selectedConversation.contact.name], ["Phone number", selectedConversation.contact.phone_number], ["Email", contactDetails?.email]].map(([label, value]) => <button type="button" key={label} disabled={!value} onClick={() => value && insertDraft(value)}>{label}<span>{value || "Not available"}</span></button>)}</div>}
                    {composerTool === "add" && <div className="composer-option-list"><button type="button" onClick={() => { setComposerTool(null); void openTemplatePicker(); }}>Approved template or media header</button><button type="button" onClick={() => setComposerTool("quick")}>Quick reply</button><button type="button" onClick={() => setComposerTool("variables")}>Contact information</button></div>}
                  </div>}
                  <label htmlFor="reply-message" className="sr-only">Write a WhatsApp reply</label>
                  <textarea
                    ref={composerRef}
                    className="resize-none"
                    id="reply-message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    maxLength={MAX_TEXT_LENGTH}
                    placeholder={canReplyReason ? "Replies are unavailable" : "Write a reply…"}
                    disabled={Boolean(canReplyReason) || sending || uncertainSend}
                    rows={1}
                    aria-describedby="reply-guidance"
                  />
                  <div className="composer-footer">
                    <div className="composer-tools" role="group" aria-label="Reply tools">
                      <button type="button" className="composer-add" disabled={Boolean(canReplyReason) || sending || uncertainSend} aria-label="Add to reply" aria-expanded={composerTool === "add"} onClick={() => setComposerTool(composerTool === "add" ? null : "add")} title="Add to reply"><InboxIcon name="plus" /></button>
                      <button type="button" disabled={Boolean(canReplyReason)} aria-label="Attach media using a template" title="Attach media using an approved template" onClick={() => void openTemplatePicker()}><InboxIcon name="attachment" /></button>
                      <button type="button" disabled={Boolean(canReplyReason) || sending || uncertainSend} aria-label="Choose emoji" aria-expanded={composerTool === "emoji"} title="Emoji" onClick={() => setComposerTool(composerTool === "emoji" ? null : "emoji")}><InboxIcon name="smile" /></button>
                      <button type="button" disabled={Boolean(canReplyReason) || sending || uncertainSend} aria-label="Quick replies" aria-expanded={composerTool === "quick"} title="Quick replies" onClick={() => setComposerTool(composerTool === "quick" ? null : "quick")}><InboxIcon name="lightning" /></button>
                      <button type="button" disabled={Boolean(canReplyReason) || sending || uncertainSend} aria-label="Insert contact variable" aria-expanded={composerTool === "variables"} title="Contact variables" onClick={() => setComposerTool(composerTool === "variables" ? null : "variables")}><InboxIcon name="variable" /></button>
                    </div>
                    <div className="composer-send-actions">
                      <span id="reply-guidance" className="sr-only">Enter to send. Shift + Enter for a new line.</span>
                      {Array.from(draft).length > MAX_TEXT_LENGTH * 0.85 && <span className="character-count">{Array.from(draft).length}/{MAX_TEXT_LENGTH}</span>}
                      <button type="button" className="composer-template" disabled={Boolean(canReplyReason)} onClick={() => void openTemplatePicker()} aria-expanded={templateOpen}><InboxIcon name={templateOpen ? "close" : "template"} /><span>Templates</span></button>
                      <button type="submit" disabled={!draft.trim() || Boolean(canReplyReason) || sending || uncertainSend} className="send-button" title="Send message (Enter). Shift + Enter adds a new line.">
                        {sending ? "Sending…" : <><span>Send</span><InboxIcon name="send" /></>}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="thread-empty">
              <span className="thread-empty-icon" aria-hidden="true">◎</span>
              <h2 className="mt-4 text-lg font-semibold text-slate-800">Your conversations, together</h2>
              <p className="mt-2 max-w-xs text-center text-sm leading-6 text-slate-500">Select a conversation to read its history and reply to your customer.</p>
            </div>
          )}
        </section>
        {selectedConversation && showContactDetails && (
          <InboxContactPanel
            conversation={selectedConversation} users={users} tab={panelTab} onTab={setPanelTab}
            onClose={() => { setShowContactDetails(false); setMobileInspectorOpen(false); detailsToggleRef.current?.focus(); }}
            onUpdate={(updated) => void updateConversation(updated)} onSelect={selectConversation}
            onModeChange={(mode) => void handleModeChange(mode)} openTags={openTagPicker}
            onTagsOpened={() => setOpenTagPicker(false)}
          />
        )}
      </div>
    </section>
  );
}

function MessageBubble({ message, contactName }: { message: Message; contactName: string | null }) {
  const [mediaError, setMediaError] = useState(false);
  const [downloadingMedia, setDownloadingMedia] = useState(false);
  const outbound = message.direction === "outbound";
  const time = message.sent_at ?? message.created_at;
  const mediaUrl = message.media_url ? inboxMediaUrl(message.id) : null;
  const mediaLabel = message.message_type === "image" ? "Image" : message.message_type === "video" ? "Video" : message.message_type === "audio" ? "Audio" : message.message_type === "document" ? "Document" : "Attachment";

  async function downloadDocument() {
    if (!mediaUrl || downloadingMedia) return;
    setDownloadingMedia(true);
    setMediaError(false);
    try {
      const response = await fetch(mediaUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Media download failed.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
      link.download = filename?.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || mediaLabel.toLowerCase();
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      setMediaError(true);
    } finally {
      setDownloadingMedia(false);
    }
  }

  return (
    <article className={`message-row ${outbound ? "message-row-outbound" : "message-row-inbound"}`}>
      {!outbound && <span className="message-avatar" aria-hidden="true">{contactInitial(contactName)}</span>}
      <div className={`message-bubble ${outbound ? "message-bubble-outbound" : "message-bubble-inbound"}`}>
        {message.text && <p className="message-text">{message.text}</p>}
        {mediaUrl && !mediaError && message.message_type === "image" && (
          <a href={mediaUrl} target="_blank" rel="noreferrer" className="message-media-image-link">
            <Image src={mediaUrl} alt="Image attachment" width={480} height={360} unoptimized onError={() => setMediaError(true)} className="message-media-image" />
          </a>
        )}
        {mediaUrl && !mediaError && message.message_type === "audio" && <audio className="message-audio" controls preload="none" src={mediaUrl} onError={() => setMediaError(true)}>Audio message</audio>}
        {mediaUrl && !mediaError && message.message_type === "video" && <video className="message-video" controls preload="none" src={mediaUrl} onError={() => setMediaError(true)}>Video message</video>}
        {mediaUrl && !mediaError && message.message_type === "document" && <button className="message-document" type="button" disabled={downloadingMedia} onClick={() => void downloadDocument()}>{downloadingMedia ? "Downloading…" : `${mediaLabel} · Download file`}</button>}
        {mediaUrl && mediaError && <p className="message-attachment-pending" role="status">{mediaLabel} attachment could not be loaded. Refresh and try again.</p>}
        {!mediaUrl && ["image", "audio", "video", "document"].includes(message.message_type) && (
          <p className="message-attachment-pending">{mediaLabel} attachment is not available yet.</p>
        )}
        {!message.text && !["image", "audio", "video", "document"].includes(message.message_type) && (
          <p className="message-attachment-pending">{message.message_type === "location" ? "Location message" : `${message.message_type} message`}</p>
        )}
        <footer className="message-meta">
          <time dateTime={time} title={fullTime(time)}>{messageTime(time)}</time>
          {outbound && <span className={`message-delivery message-delivery-${message.status}`} title={`Message ${message.status}`}>
            {message.status === "pending" ? "Sending" : message.status === "failed" ? "Failed" : <><InboxIcon name={message.status === "read" || message.status === "delivered" ? "checks" : "tick"} /><span className="sr-only">{message.status === "read" ? "Read" : message.status === "delivered" ? "Delivered" : "Sent"}</span></>}
          </span>}
        </footer>
        {outbound && message.status === "failed" && message.error_message && <p className="message-failure">{message.error_message}</p>}
      </div>
    </article>
  );
}
