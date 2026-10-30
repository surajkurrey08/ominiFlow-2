"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import {
  ChannelApiError,
  completeMetaOAuth,
  connectFacebook,
  connectInstagram,
  connectWebChat,
  connectWhatsApp,
  createChannel,
  disconnectChannel,
  deleteChannel,
  getMetaOAuthAssets,
  getWhatsAppEmbeddedSignupConfig,
  listChannels,
  startMetaOAuth,
  syncChannelTemplates,
  testFacebookConnection,
  testInstagramConnection,
  testWhatsAppConnection,
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  type WhatsAppBusinessProfile,
  type ChannelConnection,
  type ChannelStatus,
  type ConnectionCheck,
  type FacebookConnectionCheck,
  type InstagramConnectionCheck,
  type MetaOAuthProvider,
  type OAuthAssetItem,
  type TemplateSyncResult,
} from "@/lib/channels/browser";

type EmbeddedSignupResult = { phone_number_id?: string; waba_id?: string; code: string };
type FacebookLoginResponse = { authResponse?: { code?: string } };

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: {
          config_id: string;
          response_type: "code";
          override_default_response_type: boolean;
          extras: Record<string, unknown>;
        },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function ensureFacebookSdk(appId: string, version: string): Promise<NonNullable<Window["FB"]>> {
  if (window.FB) {
    window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
    return Promise.resolve(window.FB);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    const timeout = window.setTimeout(() => reject(new Error("Meta sign-in did not load. Try again.")), 15000);
    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);
      if (!window.FB) {
        reject(new Error("Meta sign-in could not initialize."));
        return;
      }
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      resolve(window.FB);
    };

    if (!existing) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Meta sign-in could not load. Check your connection and try again."));
      };
      document.head.appendChild(script);
    }
  });
}

interface EmbeddedSignupOptions {
  mode?: "coexistence" | "standard";
  phone?: {
    countryCode?: string;
    nationalNumber?: string;
  };
}

function runEmbeddedSignup(
  configId: string,
  sdk: NonNullable<Window["FB"]>,
  options?: EmbeddedSignupOptions,
): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let assets: { phone_number_id?: string; waba_id?: string } | null = null;
    let settled = false;
    let fallbackTimer: number | null = null;
    const timeout = window.setTimeout(
      () => finish(new Error("WhatsApp setup timed out. Please try again.")),
      180000,
    );

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      window.removeEventListener("message", onMessage);
      if (error) {
        reject(error);
      } else if (code) {
        resolve({
          code,
          phone_number_id: assets?.phone_number_id,
          waba_id: assets?.waba_id,
        });
      } else {
        reject(new Error("Meta sign-in did not return an authorization code."));
      }
    }

    function onMessage(event: MessageEvent) {
      let host = "";
      try {
        host = new URL(event.origin).hostname.toLowerCase();
      } catch {
        return;
      }
      if (
        host !== "facebook.com" &&
        !host.endsWith(".facebook.com") &&
        host !== "messenger.com" &&
        !host.endsWith(".messenger.com")
      ) {
        return;
      }

      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const message = payload as {
        type?: unknown;
        event?: unknown;
        data?: Record<string, unknown>;
        error_code?: unknown;
        error_message?: unknown;
      };
      if (message.type !== "WA_EMBEDDED_SIGNUP") return;

      if (message.event === "CANCEL") {
        const step =
          typeof message.data?.current_step === "string"
            ? ` at step '${message.data.current_step}'`
            : "";
        console.warn("[Meta Embedded Signup] Setup cancelled by user:", message);
        finish(new Error(`WhatsApp setup was cancelled${step}.`));
        return;
      }

      if (message.event === "ERROR") {
        const d =
          message.data && typeof message.data === "object" ? message.data : {};
        const codeVal = d.error_code ?? d.code ?? message.error_code;
        const msgVal =
          d.error_message ??
          d.message ??
          message.error_message ??
          "Meta setup encountered an error.";
        const stepVal =
          typeof d.current_step === "string"
            ? ` (at step '${d.current_step}')`
            : "";
        console.error("[Meta Embedded Signup] Onboarding failure from Meta:", {
          code: codeVal,
          message: msgVal,
          step: d.current_step,
          raw: message,
        });
        const prefix = codeVal ? `Meta Error #${codeVal}: ` : "Meta Error: ";
        finish(new Error(`${prefix}${msgVal}${stepVal}`));
        return;
      }

      if (message.data && typeof message.data === "object") {
        const data = message.data as {
          phone_number_id?: unknown;
          waba_id?: unknown;
          messaging_account_ids?: unknown;
        };
        const phone =
          typeof data.phone_number_id === "string" && /^\d{1,32}$/.test(data.phone_number_id)
            ? data.phone_number_id
            : undefined;
        let waba =
          typeof data.waba_id === "string" && /^\d{1,32}$/.test(data.waba_id)
            ? data.waba_id
            : undefined;
        if (
          !waba &&
          Array.isArray(data.messaging_account_ids) &&
          data.messaging_account_ids.length > 0
        ) {
          const candidate = String(data.messaging_account_ids[0]);
          if (/^\d{1,32}$/.test(candidate)) {
            waba = candidate;
          }
        }
        if (phone || waba) {
          assets = {
            phone_number_id: phone ?? assets?.phone_number_id,
            waba_id: waba ?? assets?.waba_id,
          };
        }
      }

      if (
        message.event === "FINISH" ||
        message.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
      ) {
        console.log("[Meta Embedded Signup] Completion event:", message.event, assets);
        if (code) {
          finish();
        }
      }
    }

    window.addEventListener("message", onMessage);

    const isCoex = options?.mode !== "standard";
    const extras: Record<string, unknown> = {
      sessionInfoVersion: "3",
    };

    if (isCoex) {
      extras.featureType = "whatsapp_business_app_onboarding";
      const cCode = options?.phone?.countryCode?.replace(/[^\d]/g, "");
      const nNum = options?.phone?.nationalNumber?.replace(/[^\d]/g, "");
      if (cCode && nNum) {
        extras.setup = {
          phone: {
            code: cCode,
            country_code: cCode,
            number: nNum,
            phone_number: nNum,
          },
        };
      } else {
        extras.setup = {};
      }
    } else {
      extras.setup = {};
    }

    sdk.login(
      (response) => {
        const authorizationCode = response.authResponse?.code;
        if (typeof authorizationCode !== "string" || !authorizationCode) {
          finish(
            new Error(
              "Meta sign-in was cancelled or did not return an authorization code.",
            ),
          );
          return;
        }
        code = authorizationCode;
        if (assets?.phone_number_id && assets?.waba_id) {
          finish();
        } else {
          fallbackTimer = window.setTimeout(() => {
            finish();
          }, 1200);
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
      },
    );
  });
}

const OAUTH_ERROR_TEXT: Record<string, string> = {
  cancelled: "Meta sign-in was cancelled. No channel was connected.",
  invalid_state: "That connection link was invalid. Please start again.",
  expired: "The connection session expired. Please start again.",
  exchange_failed: "Meta sign-in could not be completed. Please try again.",
  no_pages: "No Facebook Pages were found on that Meta account.",
  no_instagram: "No Instagram Professional account linked to a Facebook Page was found.",
  provider_error: "Could not reach Meta right now. Please try again.",
};

const STATUS_META: Record<ChannelStatus, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "channel-pill-ok" },
  pending: { label: "Pending", tone: "channel-pill-warn" },
  disconnected: { label: "Disconnected", tone: "channel-pill-muted" },
  error: { label: "Error", tone: "channel-pill-bad" },
  revoked: { label: "Revoked", tone: "channel-pill-bad" },
};

const PROVIDER_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  web_chat: "Web Chat",
};

function widgetSnippet(publicKey: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app";
  return `<script src="${origin}/omniflow-webchat.js"\n        data-omniflow-key="${publicKey}"\n        data-omniflow-api="YOUR_OMNIFLOW_API_URL"></script>`;
}

const META_ID = /^[0-9]{1,32}$/;

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

type Notice = { kind: "success" | "error"; text: string } | null;

interface WhatsAppSignupModalState {
  channel: ChannelConnection | null;
  mode: "coexistence" | "standard";
  countryCode: string;
  nationalNumber: string;
}

interface ConnectForm {
  mode: "new" | "reconnect";
  channel: ChannelConnection | null;
  name: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
}

const EMPTY_FORM: ConnectForm = {
  mode: "new",
  channel: null,
  name: "",
  phone_number_id: "",
  waba_id: "",
  access_token: "",
};

interface FacebookForm {
  mode: "new" | "reconnect";
  channel: ChannelConnection | null;
  name: string;
  page_id: string;
  access_token: string;
}

const EMPTY_FB_FORM: FacebookForm = {
  mode: "new",
  channel: null,
  name: "",
  page_id: "",
  access_token: "",
};

interface InstagramForm {
  mode: "new" | "reconnect";
  channel: ChannelConnection | null;
  name: string;
  instagram_id: string;
  page_id: string;
  access_token: string;
}

const EMPTY_IG_FORM: InstagramForm = {
  mode: "new",
  channel: null,
  name: "",
  instagram_id: "",
  page_id: "",
  access_token: "",
};

export function ChannelsClient() {
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState<Record<string, ConnectionCheck>>({});
  const [syncResults, setSyncResults] = useState<Record<string, TemplateSyncResult>>({});

  const [connectForm, setConnectForm] = useState<ConnectForm | null>(null);
  const [connectError, setConnectError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [fbForm, setFbForm] = useState<FacebookForm | null>(null);
  const [fbError, setFbError] = useState("");
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbChecks, setFbChecks] = useState<Record<string, FacebookConnectionCheck>>({});

  const [igForm, setIgForm] = useState<InstagramForm | null>(null);
  const [igError, setIgError] = useState("");
  const [igConnecting, setIgConnecting] = useState(false);
  const [igChecks, setIgChecks] = useState<Record<string, InstagramConnectionCheck>>({});

  const [oauthStarting, setOauthStarting] = useState<MetaOAuthProvider | null>(null);
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<MetaOAuthProvider | null>(null);
  const [oauthAssets, setOauthAssets] = useState<OAuthAssetItem[] | null>(null);
  const [oauthChoice, setOauthChoice] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<ChannelConnection | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChannelConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [creatingWebChat, setCreatingWebChat] = useState(false);
  const [embeddedSignupBusy, setEmbeddedSignupBusy] = useState(false);
  const [whatsAppModal, setWhatsAppModal] = useState<WhatsAppSignupModalState | null>(null);

  // WhatsApp Business Profile state
  const [profileTarget, setProfileTarget] = useState<ChannelConnection | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileForm, setProfileForm] = useState({
    about: "",
    address: "",
    description: "",
    email: "",
    vertical: "OTHER",
    website1: "",
    website2: "",
    profile_picture_url: "",
    preview_image: "",
    profile_picture_base64: "",
  });

  async function openWhatsAppProfile(channel: ChannelConnection) {
    setProfileTarget(channel);
    setProfileLoading(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await getWhatsAppBusinessProfile(channel.id);
      setProfileForm({
        about: data.about ?? "",
        address: data.address ?? "",
        description: data.description ?? "",
        email: data.email ?? "",
        vertical: data.vertical ?? "OTHER",
        website1: data.websites?.[0] ?? "",
        website2: data.websites?.[1] ?? "",
        profile_picture_url: data.profile_picture_url ?? "",
        preview_image: data.profile_picture_url ?? "",
        profile_picture_base64: "",
      });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not load WhatsApp profile from Meta.");
    } finally {
      setProfileLoading(false);
    }
  }

  function handleProfilePhotoChange(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Image size must be less than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setProfileForm((prev) => ({
        ...prev,
        preview_image: result,
        profile_picture_base64: result,
      }));
    };
    reader.readAsDataURL(file);
  }

  async function submitWhatsAppProfile(e: FormEvent) {
    e.preventDefault();
    if (!profileTarget) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const websites = [profileForm.website1.trim(), profileForm.website2.trim()].filter(Boolean);
      const res = await updateWhatsAppBusinessProfile(profileTarget.id, {
        about: profileForm.about.trim() || undefined,
        address: profileForm.address.trim() || undefined,
        description: profileForm.description.trim() || undefined,
        email: profileForm.email.trim() || undefined,
        vertical: profileForm.vertical || undefined,
        websites: websites.length > 0 ? websites : undefined,
        profile_picture_base64: profileForm.profile_picture_base64 || undefined,
      });
      setProfileNotice("Profile updated successfully on WhatsApp!");
      if (res.profile_picture_url) {
        setProfileForm((prev) => ({
          ...prev,
          profile_picture_url: res.profile_picture_url || "",
          preview_image: res.profile_picture_url || "",
          profile_picture_base64: "",
        }));
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile on WhatsApp.");
    } finally {
      setProfileSaving(false);
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await listChannels({ page: 1, page_size: 100 });
      setChannels(result.items);
    } catch (error) {
      if (!(error instanceof ChannelApiError && error.status === 401)) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const setChannelBusy = (id: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: value }));

  const handleError = (error: unknown, fallback: string) => {
    const text = error instanceof ChannelApiError ? error.message : fallback;
    setNotice({ kind: "error", text });
  };

  async function runTest(channel: ChannelConnection) {
    setChannelBusy(channel.id, true);
    setNotice(null);
    try {
      const result = await testWhatsAppConnection(channel.id);
      setChecks((prev) => ({ ...prev, [channel.id]: result }));
      setNotice({
        kind: result.healthy ? "success" : "error",
        text: result.healthy ? "WhatsApp connection is healthy." : result.detail,
      });
    } catch (error) {
      handleError(error, "Could not test this connection.");
    } finally {
      setChannelBusy(channel.id, false);
    }
  }

  async function runSync(channel: ChannelConnection) {
    setChannelBusy(channel.id, true);
    setNotice(null);
    try {
      const result = await syncChannelTemplates(channel.id);
      setSyncResults((prev) => ({ ...prev, [channel.id]: result }));
      const total = result.created + result.updated;
      setNotice({
        kind: "success",
        text: `Templates synchronized — ${result.received} received, ${total} added or updated, ${result.deactivated} deactivated.`,
      });
    } catch (error) {
      handleError(error, "Could not synchronize templates.");
    } finally {
      setChannelBusy(channel.id, false);
    }
  }

  function openConnect(channel: ChannelConnection | null) {
    setConnectError("");
    if (channel) {
      setConnectForm({
        mode: "reconnect",
        channel,
        name: channel.name,
        phone_number_id: channel.external_account_id ?? "",
        waba_id: channel.external_business_id ?? "",
        access_token: "",
      });
    } else {
      setConnectForm({ ...EMPTY_FORM });
    }
  }

  function openWhatsAppSignup(channel: ChannelConnection | null = null) {
    let defaultCode = "+91";
    let defaultNumber = "";
    const rawChannel = channel as unknown as { metadata?: Record<string, unknown> } | null;
    if (rawChannel?.metadata && typeof rawChannel.metadata === "object") {
      const meta = rawChannel.metadata;
      const display = String(meta.display_phone_number || "").trim();
      if (display.startsWith("+")) {
        const parts = display.split(" ");
        defaultCode = parts[0] || "+91";
        defaultNumber = parts.slice(1).join("").replace(/[^\d]/g, "");
      } else if (display) {
        defaultNumber = display.replace(/[^\d]/g, "");
      }
    }
    setWhatsAppModal({
      channel,
      mode: "coexistence",
      countryCode: defaultCode,
      nationalNumber: defaultNumber,
    });
  }

  async function beginWhatsAppEmbeddedSignup(
    options?: EmbeddedSignupOptions,
    existingChannel?: ChannelConnection | null,
  ) {
    setEmbeddedSignupBusy(true);
    setNotice(null);
    try {
      const config = await getWhatsAppEmbeddedSignupConfig();
      const sdk = await ensureFacebookSdk(config.app_id, config.graph_api_version);
      const result = await runEmbeddedSignup(config.config_id, sdk, options);
      let channelId = existingChannel?.id;
      if (!channelId) {
        const channelTitle =
          options?.mode === "standard" ? "WhatsApp Cloud API" : "WhatsApp Business";
        const created = await createChannel({
          channel_type: "whatsapp",
          name: channelTitle,
        });
        channelId = created.id;
      }
      await connectWhatsApp(channelId, {
        ...(result.phone_number_id ? { phone_number_id: result.phone_number_id } : {}),
        ...(result.waba_id ? { waba_id: result.waba_id } : {}),
        code: result.code,
      });
      setNotice({ kind: "success", text: "WhatsApp Business account connected successfully." });
      setWhatsAppModal(null);
      await refresh();
    } catch (error) {
      handleError(error, error instanceof Error ? error.message : "Could not connect WhatsApp with Meta.");
      void refresh();
    } finally {
      setEmbeddedSignupBusy(false);
    }
  }

  async function submitConnect(event: FormEvent) {
    event.preventDefault();
    if (!connectForm) return;
    const name = connectForm.name.trim();
    const phone = connectForm.phone_number_id.trim();
    const waba = connectForm.waba_id.trim();
    const token = connectForm.access_token.trim();

    if (connectForm.mode === "new" && (name.length < 2 || name.length > 150)) {
      setConnectError("Enter a channel name between 2 and 150 characters.");
      return;
    }
    if (!META_ID.test(phone)) {
      setConnectError("Phone Number ID must be numeric (up to 32 digits).");
      return;
    }
    if (!META_ID.test(waba)) {
      setConnectError("WhatsApp Business Account ID must be numeric (up to 32 digits).");
      return;
    }
    if (!token) {
      setConnectError("Paste the access token issued for your Meta app.");
      return;
    }

    setConnecting(true);
    setConnectError("");
    try {
      let channelId = connectForm.channel?.id;
      if (connectForm.mode === "new") {
        const created = await createChannel({ channel_type: "whatsapp", name });
        channelId = created.id;
      }
      await connectWhatsApp(channelId as string, {
        phone_number_id: phone,
        waba_id: waba,
        access_token: token,
      });
      setConnectForm(null);
      setNotice({ kind: "success", text: "WhatsApp channel connected." });
      await refresh();
    } catch (error) {
      setConnectError(error instanceof ChannelApiError ? error.message : "Could not connect this channel.");
      // A new channel may have been created in a pending/error state; reflect it.
      if (connectForm.mode === "new") void refresh();
    } finally {
      setConnecting(false);
    }
  }

  async function runFacebookTest(channel: ChannelConnection) {
    setChannelBusy(channel.id, true);
    setNotice(null);
    try {
      const result = await testFacebookConnection(channel.id);
      setFbChecks((prev) => ({ ...prev, [channel.id]: result }));
      setNotice({
        kind: result.healthy ? "success" : "error",
        text: result.healthy ? "Facebook connection is healthy." : result.detail,
      });
    } catch (error) {
      handleError(error, "Could not test this connection.");
    } finally {
      setChannelBusy(channel.id, false);
    }
  }

  function openFacebookConnect(channel: ChannelConnection | null) {
    setFbError("");
    if (channel) {
      setFbForm({
        mode: "reconnect",
        channel,
        name: channel.name,
        page_id: channel.external_account_id ?? "",
        access_token: "",
      });
    } else {
      setFbForm({ ...EMPTY_FB_FORM });
    }
  }

  async function submitFacebookConnect(event: FormEvent) {
    event.preventDefault();
    if (!fbForm) return;
    const name = fbForm.name.trim();
    const page = fbForm.page_id.trim();
    const token = fbForm.access_token.trim();

    if (fbForm.mode === "new" && (name.length < 2 || name.length > 150)) {
      setFbError("Enter a channel name between 2 and 150 characters.");
      return;
    }
    if (!META_ID.test(page)) {
      setFbError("Facebook Page ID must be numeric (up to 32 digits).");
      return;
    }
    if (!token) {
      setFbError("Paste the Page access token issued for your Meta app.");
      return;
    }

    setFbConnecting(true);
    setFbError("");
    try {
      let channelId = fbForm.channel?.id;
      if (fbForm.mode === "new") {
        const created = await createChannel({ channel_type: "facebook", name });
        channelId = created.id;
      }
      await connectFacebook(channelId as string, { page_id: page, access_token: token });
      setFbForm(null);
      setNotice({ kind: "success", text: "Facebook Messenger channel connected." });
      await refresh();
    } catch (error) {
      setFbError(error instanceof ChannelApiError ? error.message : "Could not connect this channel.");
      if (fbForm.mode === "new") void refresh();
    } finally {
      setFbConnecting(false);
    }
  }

  async function runInstagramTest(channel: ChannelConnection) {
    setChannelBusy(channel.id, true);
    setNotice(null);
    try {
      const result = await testInstagramConnection(channel.id);
      setIgChecks((prev) => ({ ...prev, [channel.id]: result }));
      setNotice({
        kind: result.healthy ? "success" : "error",
        text: result.healthy ? "Instagram connection is healthy." : result.detail,
      });
    } catch (error) {
      handleError(error, "Could not test this connection.");
    } finally {
      setChannelBusy(channel.id, false);
    }
  }

  function openInstagramConnect(channel: ChannelConnection | null) {
    setIgError("");
    if (channel) {
      setIgForm({
        mode: "reconnect",
        channel,
        name: channel.name,
        instagram_id: channel.external_account_id ?? "",
        page_id: channel.external_business_id ?? "",
        access_token: "",
      });
    } else {
      setIgForm({ ...EMPTY_IG_FORM });
    }
  }

  async function submitInstagramConnect(event: FormEvent) {
    event.preventDefault();
    if (!igForm) return;
    const name = igForm.name.trim();
    const instagram = igForm.instagram_id.trim();
    const page = igForm.page_id.trim();
    const token = igForm.access_token.trim();

    if (igForm.mode === "new" && (name.length < 2 || name.length > 150)) {
      setIgError("Enter a channel name between 2 and 150 characters.");
      return;
    }
    if (!META_ID.test(instagram)) {
      setIgError("Instagram account ID must be numeric (up to 32 digits).");
      return;
    }
    if (!META_ID.test(page)) {
      setIgError("Linked Facebook Page ID must be numeric (up to 32 digits).");
      return;
    }
    if (!token) {
      setIgError("Paste the Page access token issued for your Meta app.");
      return;
    }

    setIgConnecting(true);
    setIgError("");
    try {
      let channelId = igForm.channel?.id;
      if (igForm.mode === "new") {
        const created = await createChannel({ channel_type: "instagram", name });
        channelId = created.id;
      }
      await connectInstagram(channelId as string, { instagram_id: instagram, page_id: page, access_token: token });
      setIgForm(null);
      setNotice({ kind: "success", text: "Instagram channel connected." });
      await refresh();
    } catch (error) {
      setIgError(error instanceof ChannelApiError ? error.message : "Could not connect this channel.");
      if (igForm.mode === "new") void refresh();
    } finally {
      setIgConnecting(false);
    }
  }

  async function beginMetaOAuth(provider: MetaOAuthProvider) {
    setOauthStarting(provider);
    setNotice(null);
    try {
      const { authorization_url } = await startMetaOAuth(provider);
      window.location.href = authorization_url;
    } catch (error) {
      setOauthStarting(null);
      handleError(error, "Could not start the Meta connection.");
    }
  }

  const loadOAuthAssets = useCallback(async (token: string, provider: MetaOAuthProvider) => {
    setOauthToken(token);
    setOauthProvider(provider);
    setOauthError("");
    setOauthChoice("");
    try {
      const result = await getMetaOAuthAssets(token);
      setOauthAssets(result.assets);
      if (result.assets.length === 1) setOauthChoice(result.assets[0].external_account_id);
    } catch (error) {
      setOauthAssets([]);
      setOauthError(error instanceof ChannelApiError ? error.message : "Could not load your Meta accounts.");
    }
  }, []);

  // Handle the return from the Meta OAuth callback (?connect=… / ?connect_error=…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    const connectError = params.get("connect_error");
    const provider = params.get("provider");
    if (!connect && !connectError) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("connect");
    url.searchParams.delete("connect_error");
    url.searchParams.delete("provider");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    if (connectError) {
      setNotice({ kind: "error", text: OAUTH_ERROR_TEXT[connectError] ?? "The Meta connection could not be completed." });
      return;
    }
    if (connect && (provider === "facebook" || provider === "instagram")) {
      void loadOAuthAssets(connect, provider);
    }
  }, [loadOAuthAssets]);

  function closeOAuth() {
    setOauthToken(null);
    setOauthProvider(null);
    setOauthAssets(null);
    setOauthChoice("");
    setOauthError("");
  }

  async function finishMetaOAuth() {
    if (!oauthToken || !oauthChoice) return;
    setOauthBusy(true);
    setOauthError("");
    try {
      await completeMetaOAuth(oauthToken, oauthChoice);
      closeOAuth();
      setNotice({ kind: "success", text: `${oauthProvider === "instagram" ? "Instagram" : "Facebook"} channel connected.` });
      await refresh();
    } catch (error) {
      setOauthError(error instanceof ChannelApiError ? error.message : "Could not connect the selected account.");
    } finally {
      setOauthBusy(false);
    }
  }

  async function createWebChat() {
    setCreatingWebChat(true);
    setNotice(null);
    try {
      const created = await createChannel({ channel_type: "web_chat", name: "Web Chat" });
      await connectWebChat(created.id);
      setNotice({ kind: "success", text: "Web Chat channel created. Copy the widget snippet below to embed it." });
      await refresh();
    } catch (error) {
      handleError(error, "Could not create the Web Chat channel.");
      void refresh();
    } finally {
      setCreatingWebChat(false);
    }
  }

  async function activateWebChat(channel: ChannelConnection) {
    setChannelBusy(channel.id, true);
    setNotice(null);
    try {
      await connectWebChat(channel.id);
      setNotice({ kind: "success", text: "Web Chat channel activated." });
      await refresh();
    } catch (error) {
      handleError(error, "Could not activate this Web Chat channel.");
    } finally {
      setChannelBusy(channel.id, false);
    }
  }

  async function confirmDisconnect() {
    if (!confirmTarget) return;
    setConfirming(true);
    setNotice(null);
    try {
      await disconnectChannel(confirmTarget.id);
      setChecks((prev) => {
        const next = { ...prev };
        delete next[confirmTarget.id];
        return next;
      });
      setConfirmTarget(null);
      setNotice({ kind: "success", text: "Channel disconnected. Its history is kept." });
      await refresh();
    } catch (error) {
      handleError(error, "Could not disconnect this channel.");
    } finally {
      setConfirming(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setNotice(null);
    try {
      await deleteChannel(deleteTarget.id);
      setChecks((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setFbChecks((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setIgChecks((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setSyncResults((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
      setNotice({ kind: "success", text: "Channel deleted. Its conversations and message history are kept." });
      await refresh();
    } catch (error) {
      handleError(error, "Could not delete this channel.");
    } finally {
      setDeleting(false);
    }
  }

  const connectedCount = useMemo(
    () => channels.filter((c) => c.status === "connected").length,
    [channels],
  );

  return (
    <section className="page-enter max-w-5xl">
      <header className="channel-header">
        <div>
          <p className="eyebrow">OMNIFLOW WORKSPACE</p>
          <h1 className="page-title mt-2">Channels</h1>
          <p className="page-subtitle mt-2">
            Connect and monitor the messaging channels for your workspace.
            {channels.length > 0 && ` ${connectedCount} of ${channels.length} connected.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="channel-secondary-btn inline-flex items-center gap-1.5"
            disabled={loading}
            onClick={() => void refresh()}
            title="Refresh channels"
          >
            <span aria-hidden="true" className={loading ? "animate-spin" : ""}>↻</span>
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>
          <button type="button" className="channel-primary-btn" disabled={embeddedSignupBusy} onClick={() => openWhatsAppSignup(null)}>
            <span aria-hidden="true">+</span> {embeddedSignupBusy ? "Connecting…" : "Connect WhatsApp"}
          </button>
          <button type="button" className="channel-secondary-btn" onClick={() => openConnect(null)}>
            Manual setup
          </button>
          <button type="button" className="channel-secondary-btn" disabled={oauthStarting === "facebook"} onClick={() => void beginMetaOAuth("facebook")}>
            <span aria-hidden="true">+</span> {oauthStarting === "facebook" ? "Redirecting…" : "Connect Facebook"}
          </button>
          <button type="button" className="channel-secondary-btn" disabled={oauthStarting === "instagram"} onClick={() => void beginMetaOAuth("instagram")}>
            <span aria-hidden="true">+</span> {oauthStarting === "instagram" ? "Redirecting…" : "Connect Instagram"}
          </button>
          <button type="button" className="channel-secondary-btn" disabled={creatingWebChat} onClick={() => void createWebChat()}>
            <span aria-hidden="true">+</span> {creatingWebChat ? "Creating…" : "Create Web Chat"}
          </button>
        </div>
      </header>

      {notice && (
        <div className={`channel-notice channel-notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {loading ? (
        <div className="channel-state" role="status">Loading your channels…</div>
      ) : loadError ? (
        <div className="channel-state channel-state-error" role="alert">
          <strong>Channels could not be loaded.</strong>
          <p>The channel service did not respond. Please try again.</p>
          <button type="button" className="channel-secondary-btn" onClick={() => void refresh()}>Try again</button>
        </div>
      ) : channels.length === 0 ? (
        <div className="channel-state channel-empty">
          <span className="channel-empty-mark" aria-hidden="true">↗</span>
          <strong>No channels yet</strong>
          <p>Connect your WhatsApp Business number, or add a Web Chat widget to your website, to start messaging.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="channel-primary-btn"
              disabled={embeddedSignupBusy}
              onClick={() => openWhatsAppSignup(null)}
            >
              <span aria-hidden="true">+</span> {embeddedSignupBusy ? "Connecting…" : "Connect WhatsApp"}
            </button>
            <button type="button" className="channel-secondary-btn" onClick={() => openConnect(null)}>
              Manual setup
            </button>
            <button type="button" className="channel-secondary-btn" disabled={creatingWebChat} onClick={() => void createWebChat()}>
              {creatingWebChat ? "Creating…" : "Create Web Chat"}
            </button>
          </div>
        </div>
      ) : (
        <ul className="channel-grid">
          {channels.map((channel) => {
            const meta = STATUS_META[channel.status];
            const isWhatsApp = channel.channel_type === "whatsapp";
            const isWebChat = channel.channel_type === "web_chat";
            const isFacebook = channel.channel_type === "facebook";
            const isInstagram = channel.channel_type === "instagram";
            const isConnected = channel.status === "connected";
            const isBusy = busy[channel.id] ?? false;
            const check = checks[channel.id];
            const fbCheck = fbChecks[channel.id];
            const igCheck = igChecks[channel.id];
            const sync = syncResults[channel.id];
            return (
              <li key={channel.id} className="channel-card">
                <div className="channel-card-top">
                  <span className="channel-logo" aria-hidden="true">{PROVIDER_LABEL[channel.channel_type]?.[0] ?? "?"}</span>
                  <div className="channel-card-title">
                    <strong>{channel.name}</strong>
                    <span>{PROVIDER_LABEL[channel.channel_type] ?? channel.channel_type}</span>
                  </div>
                  <span className={`channel-pill ${meta.tone}`}>{meta.label}</span>
                </div>

                <dl className="channel-facts">
                  <div>
                    <dt>Phone / account</dt>
                    <dd>
                      {channel.display_phone_number || (channel.provider_metadata as Record<string, string> | undefined)?.display_phone_number || channel.external_account_id || "—"}
                      {channel.display_phone_number && channel.external_account_id && (
                        <span className="block text-[10px] text-slate-400 font-mono">ID: {channel.external_account_id}</span>
                      )}
                    </dd>
                  </div>
                  <div><dt>Business ID</dt><dd>{channel.external_business_id ?? "—"}</dd></div>
                  <div><dt>Credentials</dt><dd>{channel.has_credentials ? "Stored (encrypted)" : "None"}</dd></div>
                  <div><dt>Last connected</dt><dd>{formatTime(channel.last_connected_at)}</dd></div>
                  <div>
                    <dt>Webhook</dt>
                    <dd>
                      {check
                        ? check.webhook_subscribed === null
                          ? "Unknown"
                          : check.webhook_subscribed
                            ? "Active"
                            : "Not subscribed"
                        : isConnected
                          ? "Subscribed at connect — run a test"
                          : "—"}
                    </dd>
                  </div>
                </dl>

                {channel.status === "error" && channel.last_error && (
                  <p className="channel-error-line">{channel.last_error}</p>
                )}

                {check && (
                  <div className={`channel-check ${check.healthy ? "channel-check-ok" : "channel-check-bad"}`} role="status">
                    <strong>{check.healthy ? "Connection healthy" : "Connection problem"}</strong>
                    <span>{check.detail}</span>
                    {check.display_phone_number && <span>Number: {check.display_phone_number}</span>}
                    {check.quality_rating && <span>Quality: {check.quality_rating}</span>}
                    {check.last_event_at && <span>Last webhook event: {formatTime(check.last_event_at)}</span>}
                  </div>
                )}

                {fbCheck && (
                  <div className={`channel-check ${fbCheck.healthy ? "channel-check-ok" : "channel-check-bad"}`} role="status">
                    <strong>{fbCheck.healthy ? "Connection healthy" : "Connection problem"}</strong>
                    <span>{fbCheck.detail}</span>
                    {fbCheck.page_name && <span>Page: {fbCheck.page_name}</span>}
                    {fbCheck.last_event_at && <span>Last message: {formatTime(fbCheck.last_event_at)}</span>}
                  </div>
                )}

                {igCheck && (
                  <div className={`channel-check ${igCheck.healthy ? "channel-check-ok" : "channel-check-bad"}`} role="status">
                    <strong>{igCheck.healthy ? "Connection healthy" : "Connection problem"}</strong>
                    <span>{igCheck.detail}</span>
                    {igCheck.username && <span>Account: @{igCheck.username}</span>}
                    {igCheck.last_event_at && <span>Last message: {formatTime(igCheck.last_event_at)}</span>}
                  </div>
                )}

                {sync && (
                  <p className="channel-sync-line">
                    {sync.received} received · {sync.created} new · {sync.updated} updated · {sync.deactivated} deactivated
                  </p>
                )}

                {isWebChat && isConnected && channel.external_account_id && (
                  <div className="channel-check channel-check-ok" role="group" aria-label="Web Chat installation">
                    <strong>Widget install</strong>
                    <span>Public key: <code>{channel.external_account_id}</code></span>
                    <span>Paste this snippet before <code>&lt;/body&gt;</code> on your website:</span>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: "11px", margin: "4px 0 0", userSelect: "all" }}>{widgetSnippet(channel.external_account_id)}</pre>
                  </div>
                )}

                <div className="channel-actions">
                  {isConnected ? (
                    isWebChat ? (
                      <button type="button" className="channel-action channel-action-danger" disabled={isBusy} onClick={() => setConfirmTarget(channel)}>
                        Disconnect
                      </button>
                    ) : isFacebook ? (
                      <>
                        <button type="button" className="channel-action" disabled={isBusy} onClick={() => void runFacebookTest(channel)}>
                          {isBusy ? "Working…" : "Test connection"}
                        </button>
                        <button type="button" className="channel-action" disabled={!!oauthStarting} onClick={() => void beginMetaOAuth("facebook")}>
                          Reconnect
                        </button>
                        <button type="button" className="channel-action channel-action-danger" disabled={isBusy} onClick={() => setConfirmTarget(channel)}>
                          Disconnect
                        </button>
                      </>
                    ) : isInstagram ? (
                      <>
                        <button type="button" className="channel-action" disabled={isBusy} onClick={() => void runInstagramTest(channel)}>
                          {isBusy ? "Working…" : "Test connection"}
                        </button>
                        <button type="button" className="channel-action" disabled={!!oauthStarting} onClick={() => void beginMetaOAuth("instagram")}>
                          Reconnect
                        </button>
                        <button type="button" className="channel-action channel-action-danger" disabled={isBusy} onClick={() => setConfirmTarget(channel)}>
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="channel-action" disabled={isBusy || !isWhatsApp} onClick={() => void runTest(channel)}>
                          {isBusy ? "Working…" : "Test connection"}
                        </button>
                        {isWhatsApp && (
                          <Link
                            href="/ai-configuration?tab=business-profile"
                            className="channel-action channel-action-primary inline-flex items-center justify-center text-center"
                          >
                            Business Profile
                          </Link>
                        )}
                        <button type="button" className="channel-action" disabled={isBusy || !isWhatsApp} onClick={() => void runSync(channel)}>
                          Sync templates
                        </button>
                        <button
                          type="button"
                          className="channel-action"
                          disabled={isBusy || embeddedSignupBusy || !isWhatsApp}
                          onClick={() => openWhatsAppSignup(channel)}
                        >
                          Reconnect with Meta
                        </button>
                        <button type="button" className="channel-action" disabled={isBusy || !isWhatsApp} onClick={() => openConnect(channel)}>
                          Use a token
                        </button>
                        <button type="button" className="channel-action channel-action-danger" disabled={isBusy} onClick={() => setConfirmTarget(channel)}>
                          Disconnect
                        </button>
                      </>
                    )
                  ) : isWhatsApp ? (
                    <>
                      <button
                        type="button"
                        className="channel-action channel-action-primary"
                        disabled={isBusy || embeddedSignupBusy}
                        onClick={() => openWhatsAppSignup(channel)}
                      >
                        {embeddedSignupBusy ? "Connecting…" : channel.status === "disconnected" || channel.status === "error" ? "Reconnect with Meta" : "Connect with Meta"}
                      </button>
                      <button type="button" className="channel-action" disabled={isBusy || embeddedSignupBusy} onClick={() => openConnect(channel)}>
                        Use a token
                      </button>
                    </>
                  ) : isFacebook ? (
                    <>
                      <button type="button" className="channel-action channel-action-primary" disabled={!!oauthStarting} onClick={() => void beginMetaOAuth("facebook")}>
                        {oauthStarting === "facebook" ? "Redirecting…" : "Connect with Meta"}
                      </button>
                      <button type="button" className="channel-action" disabled={isBusy} onClick={() => openFacebookConnect(channel)}>
                        Use a token
                      </button>
                    </>
                  ) : isInstagram ? (
                    <>
                      <button type="button" className="channel-action channel-action-primary" disabled={!!oauthStarting} onClick={() => void beginMetaOAuth("instagram")}>
                        {oauthStarting === "instagram" ? "Redirecting…" : "Connect with Meta"}
                      </button>
                      <button type="button" className="channel-action" disabled={isBusy} onClick={() => openInstagramConnect(channel)}>
                        Use a token
                      </button>
                    </>
                  ) : isWebChat ? (
                    <button type="button" className="channel-action channel-action-primary" disabled={isBusy} onClick={() => void activateWebChat(channel)}>
                      {isBusy ? "Working…" : "Activate"}
                    </button>
                  ) : (
                    <span className="channel-soon">Setup for {PROVIDER_LABEL[channel.channel_type]} is coming soon.</span>
                  )}
                  <button type="button" className="channel-action channel-action-danger" disabled={isBusy || deleting} onClick={() => setDeleteTarget(channel)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {whatsAppModal && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="wa-modal-title">
          <div className="channel-modal channel-modal-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 id="wa-modal-title">
                {whatsAppModal.channel ? `Reconnect ${whatsAppModal.channel.name}` : "Connect WhatsApp via Meta"}
              </h2>
              <button
                type="button"
                onClick={() => setWhatsAppModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none cursor-pointer"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="channel-modal-sub">
              Choose your preferred onboarding method. Meta allows connecting an existing WhatsApp Business mobile app number (coexistence) or onboarding a dedicated Cloud API number.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
              <button
                type="button"
                onClick={() => setWhatsAppModal({ ...whatsAppModal, mode: "coexistence" })}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  whatsAppModal.mode === "coexistence"
                    ? "border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-sm">Existing WhatsApp App</strong>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Coexistence
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Keep using your mobile WhatsApp Business app. Omniflow connects via Cloud API coexistence.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setWhatsAppModal({ ...whatsAppModal, mode: "standard" })}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  whatsAppModal.mode === "standard"
                    ? "border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-sm">New / Dedicated Number</strong>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Direct Cloud API
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Register a fresh number or migrate a dedicated number directly (not linked to the mobile app).
                </p>
              </button>
            </div>

            {whatsAppModal.mode === "coexistence" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 space-y-3 mb-4">
                <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Existing WhatsApp Business App Number
                </div>
                <p className="text-xs text-gray-600">
                  Enter your active WhatsApp Business mobile number. Meta will prefill this number and prompt you in the WhatsApp app to authorize the connection.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="channel-field">
                    <span>Country Code</span>
                    <input
                      value={whatsAppModal.countryCode}
                      onChange={(e) => setWhatsAppModal({ ...whatsAppModal, countryCode: e.target.value })}
                      placeholder="+91"
                      maxLength={6}
                    />
                  </label>
                  <label className="channel-field sm:col-span-2">
                    <span>Mobile Phone Number</span>
                    <input
                      value={whatsAppModal.nationalNumber}
                      onChange={(e) => setWhatsAppModal({ ...whatsAppModal, nationalNumber: e.target.value })}
                      placeholder="e.g. 9876543210"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-gray-500">
                  Note: The device must have the official WhatsApp Business app installed (v2.24.17 or later).
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 space-y-2 mb-4">
                <div className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  Direct Meta Cloud API Onboarding
                </div>
                <p className="text-xs text-gray-600">
                  Meta Embedded Signup will guide you through registering a new number or migrating an existing phone number directly to Cloud API.
                </p>
              </div>
            )}

            <div className="channel-modal-actions flex items-center justify-between pt-1">
              <button
                type="button"
                className="channel-secondary-btn text-xs"
                onClick={() => {
                  const ch = whatsAppModal.channel;
                  setWhatsAppModal(null);
                  openConnect(ch);
                }}
              >
                Manual token setup
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="channel-secondary-btn"
                  onClick={() => setWhatsAppModal(null)}
                  disabled={embeddedSignupBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="channel-primary-btn"
                  disabled={embeddedSignupBusy}
                  onClick={() => {
                    const modal = whatsAppModal;
                    void beginWhatsAppEmbeddedSignup(
                      {
                        mode: modal.mode,
                        phone: modal.mode === "coexistence" && modal.nationalNumber.trim()
                          ? {
                              countryCode: modal.countryCode,
                              nationalNumber: modal.nationalNumber,
                            }
                          : undefined,
                      },
                      modal.channel,
                    );
                  }}
                >
                  {embeddedSignupBusy ? "Launching Meta…" : "Continue with Meta →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {connectForm && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <div className="channel-modal">
            <h2 id="connect-title">{connectForm.mode === "new" ? "Connect a WhatsApp channel" : `Reconnect ${connectForm.channel?.name ?? "channel"}`}</h2>
            <p className="channel-modal-sub">
              Enter your WhatsApp Cloud API details. The access token is sent securely to your workspace, encrypted at rest, and never displayed again.
            </p>
            <form onSubmit={submitConnect} className="channel-form">
              {connectForm.mode === "new" && (
                <label className="channel-field">
                  <span>Channel name</span>
                  <input
                    value={connectForm.name}
                    onChange={(e) => setConnectForm({ ...connectForm, name: e.target.value })}
                    maxLength={150}
                    placeholder="Support WhatsApp"
                    autoFocus
                    required
                  />
                </label>
              )}
              <label className="channel-field">
                <span>Phone Number ID</span>
                <input
                  value={connectForm.phone_number_id}
                  onChange={(e) => setConnectForm({ ...connectForm, phone_number_id: e.target.value })}
                  inputMode="numeric"
                  placeholder="1000000000000001"
                  required
                />
              </label>
              <label className="channel-field">
                <span>WhatsApp Business Account ID</span>
                <input
                  value={connectForm.waba_id}
                  onChange={(e) => setConnectForm({ ...connectForm, waba_id: e.target.value })}
                  inputMode="numeric"
                  placeholder="2000000000000001"
                  required
                />
              </label>
              <label className="channel-field">
                <span>Access token</span>
                <input
                  type="password"
                  value={connectForm.access_token}
                  onChange={(e) => setConnectForm({ ...connectForm, access_token: e.target.value })}
                  placeholder="System user / business integration token"
                  autoComplete="off"
                  required
                />
              </label>

              {connectError && <p className="channel-form-error" role="alert">{connectError}</p>}

              <div className="channel-modal-actions">
                <button type="button" className="channel-secondary-btn" onClick={() => setConnectForm(null)} disabled={connecting}>
                  Cancel
                </button>
                <button type="submit" className="channel-primary-btn" disabled={connecting}>
                  {connecting ? "Connecting…" : connectForm.mode === "new" ? "Connect" : "Reconnect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fbForm && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="fb-connect-title">
          <div className="channel-modal">
            <h2 id="fb-connect-title">{fbForm.mode === "new" ? "Connect a Facebook channel" : `Reconnect ${fbForm.channel?.name ?? "channel"}`}</h2>
            <p className="channel-modal-sub">
              Enter your Facebook Page ID and a Page access token. The token is sent securely to your workspace, encrypted at rest, and never displayed again.
            </p>
            <form onSubmit={submitFacebookConnect} className="channel-form">
              {fbForm.mode === "new" && (
                <label className="channel-field">
                  <span>Channel name</span>
                  <input
                    value={fbForm.name}
                    onChange={(e) => setFbForm({ ...fbForm, name: e.target.value })}
                    maxLength={150}
                    placeholder="Support Facebook"
                    autoFocus
                    required
                  />
                </label>
              )}
              <label className="channel-field">
                <span>Facebook Page ID</span>
                <input
                  value={fbForm.page_id}
                  onChange={(e) => setFbForm({ ...fbForm, page_id: e.target.value })}
                  inputMode="numeric"
                  placeholder="310000000000001"
                  required
                />
              </label>
              <label className="channel-field">
                <span>Page access token</span>
                <input
                  type="password"
                  value={fbForm.access_token}
                  onChange={(e) => setFbForm({ ...fbForm, access_token: e.target.value })}
                  placeholder="Page access token with pages_messaging"
                  autoComplete="off"
                  required
                />
              </label>

              {fbError && <p className="channel-form-error" role="alert">{fbError}</p>}

              <div className="channel-modal-actions">
                <button type="button" className="channel-secondary-btn" onClick={() => setFbForm(null)} disabled={fbConnecting}>
                  Cancel
                </button>
                <button type="submit" className="channel-primary-btn" disabled={fbConnecting}>
                  {fbConnecting ? "Connecting…" : fbForm.mode === "new" ? "Connect" : "Reconnect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {oauthToken && oauthAssets !== null && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="oauth-select-title">
          <div className="channel-modal">
            <h2 id="oauth-select-title">
              {oauthProvider === "instagram" ? "Select an Instagram account" : "Select a Facebook Page"}
            </h2>
            <p className="channel-modal-sub">
              {oauthProvider === "instagram"
                ? "Choose the Instagram Professional account to connect. Only accounts linked to a Facebook Page you manage are shown."
                : "Choose the Facebook Page to connect for messaging."}
            </p>

            {oauthAssets.length === 0 ? (
              <p className="channel-form-error" role="alert">
                {oauthError || "No eligible accounts were found on your Meta profile."}
              </p>
            ) : (
              <div className="channel-form" role="radiogroup" aria-label="Available accounts">
                {oauthAssets.map((asset) => (
                  <label key={asset.external_account_id} className="oauth-asset">
                    <input
                      type="radio"
                      name="oauth-asset"
                      value={asset.external_account_id}
                      checked={oauthChoice === asset.external_account_id}
                      onChange={() => setOauthChoice(asset.external_account_id)}
                    />
                    <span className="oauth-asset-body">
                      <strong>{oauthProvider === "instagram" ? `@${asset.name}` : asset.name}</strong>
                      {asset.page_name && <span>Linked Page: {asset.page_name}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {oauthError && oauthAssets.length > 0 && <p className="channel-form-error" role="alert">{oauthError}</p>}

            <div className="channel-modal-actions">
              <button type="button" className="channel-secondary-btn" onClick={closeOAuth} disabled={oauthBusy}>
                Cancel
              </button>
              <button type="button" className="channel-primary-btn" onClick={() => void finishMetaOAuth()} disabled={!oauthChoice || oauthBusy}>
                {oauthBusy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {igForm && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="ig-connect-title">
          <div className="channel-modal">
            <h2 id="ig-connect-title">{igForm.mode === "new" ? "Connect an Instagram channel" : `Reconnect ${igForm.channel?.name ?? "channel"}`}</h2>
            <p className="channel-modal-sub">
              Enter your Instagram Professional account ID, its linked Facebook Page ID, and a Page access token. The token is sent securely to your workspace, encrypted at rest, and never displayed again.
            </p>
            <form onSubmit={submitInstagramConnect} className="channel-form">
              {igForm.mode === "new" && (
                <label className="channel-field">
                  <span>Channel name</span>
                  <input
                    value={igForm.name}
                    onChange={(e) => setIgForm({ ...igForm, name: e.target.value })}
                    maxLength={150}
                    placeholder="Support Instagram"
                    autoFocus
                    required
                  />
                </label>
              )}
              <label className="channel-field">
                <span>Instagram account ID</span>
                <input
                  value={igForm.instagram_id}
                  onChange={(e) => setIgForm({ ...igForm, instagram_id: e.target.value })}
                  inputMode="numeric"
                  placeholder="17800000000000001"
                  required
                />
              </label>
              <label className="channel-field">
                <span>Linked Facebook Page ID</span>
                <input
                  value={igForm.page_id}
                  onChange={(e) => setIgForm({ ...igForm, page_id: e.target.value })}
                  inputMode="numeric"
                  placeholder="320000000000001"
                  required
                />
              </label>
              <label className="channel-field">
                <span>Page access token</span>
                <input
                  type="password"
                  value={igForm.access_token}
                  onChange={(e) => setIgForm({ ...igForm, access_token: e.target.value })}
                  placeholder="Page access token with instagram_manage_messages"
                  autoComplete="off"
                  required
                />
              </label>

              {igError && <p className="channel-form-error" role="alert">{igError}</p>}

              <div className="channel-modal-actions">
                <button type="button" className="channel-secondary-btn" onClick={() => setIgForm(null)} disabled={igConnecting}>
                  Cancel
                </button>
                <button type="submit" className="channel-primary-btn" disabled={igConnecting}>
                  {igConnecting ? "Connecting…" : igForm.mode === "new" ? "Connect" : "Reconnect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
          <div className="channel-modal channel-modal-sm">
            <h2 id="disconnect-title">Disconnect {confirmTarget.name}?</h2>
            <p className="channel-modal-sub">
              Stored credentials will be removed and this channel will stop sending and receiving messages.
              Conversations, contacts and message history are kept. You can reconnect later.
            </p>
            <div className="channel-modal-actions">
              <button type="button" className="channel-secondary-btn" onClick={() => setConfirmTarget(null)} disabled={confirming}>
                Cancel
              </button>
              <button type="button" className="channel-primary-btn channel-btn-danger" onClick={() => void confirmDisconnect()} disabled={confirming}>
                {confirming ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="delete-channel-title">
          <div className="channel-modal channel-modal-sm">
            <h2 id="delete-channel-title">Delete {deleteTarget.name}?</h2>
            <p className="channel-modal-sub">
              This channel will be removed from the workspace and its stored credentials will be erased. It will stop sending and receiving messages. Existing conversations, contacts and message history will be kept. This action cannot be undone.
            </p>
            <div className="channel-modal-actions">
              <button type="button" className="channel-secondary-btn" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="channel-primary-btn channel-btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete channel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <div className="channel-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
          <div className="channel-modal" style={{ maxWidth: "980px", width: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 id="profile-modal-title" className="text-xl font-bold text-slate-900">
                  WhatsApp Business Profile
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage public details, profile photo, and operating hours for <strong>{profileTarget.name}</strong>. These details are visible when customers tap your profile on mobile WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {profileLoading ? (
              <div className="py-16 text-center text-slate-500">
                <div className="inline-block animate-spin w-8 h-8 border-4 border-[#25D366] border-t-transparent rounded-full mb-3" />
                <p>Loading profile from WhatsApp Cloud API...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-4">
                {/* Form Column */}
                <form onSubmit={submitWhatsAppProfile} className="md:col-span-7 flex flex-col gap-4">
                  {profileNotice && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
                      ✓ {profileNotice}
                    </div>
                  )}
                  {profileError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
                      ⚠ {profileError}
                    </div>
                  )}

                  {/* Profile Picture Upload */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-200 border-2 border-emerald-500 flex-shrink-0 flex items-center justify-center text-slate-400 font-bold text-xl">
                      {profileForm.preview_image ? (
                        <img
                          src={profileForm.preview_image}
                          alt="Profile Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>WA</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Profile Photo (DP)
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(e) => handleProfilePhotoChange(e.target.files?.[0] || null)}
                        className="text-xs text-slate-600 file:mr-2.5 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                      />
                      <span className="block text-[10px] text-slate-400 mt-1">
                        Square JPG or PNG, max 5 MB. Updates live on WhatsApp.
                      </span>
                    </div>
                  </div>

                  {/* Tagline / About */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-700">About / Tagline</label>
                      <span className="text-[11px] text-slate-400">{profileForm.about.length}/139</span>
                    </div>
                    <input
                      type="text"
                      maxLength={139}
                      value={profileForm.about}
                      onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })}
                      placeholder="e.g. Always here to help | Fast Delivery • 24/7 Support"
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  {/* Business Description & Hours */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Business Description & Timing
                      </label>
                      <span className="text-[11px] text-slate-400">{profileForm.description.length}/512</span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={512}
                      value={profileForm.description}
                      onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                      placeholder="e.g. We are an authorized omnichannel service provider. Working Hours: Mon-Sat 09:00 AM - 08:00 PM."
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                    />
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const timingText = "🕒 Business Hours: Mon-Fri: 9:00 AM - 7:00 PM | Sat: 10:00 AM - 5:00 PM";
                          setProfileForm((prev) => ({
                            ...prev,
                            description: prev.description ? `${prev.description}\n${timingText}`.slice(0, 512) : timingText,
                          }));
                        }}
                        className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200"
                      >
                        + Insert Hours Template
                      </button>
                    </div>
                  </div>

                  {/* Category / Vertical */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Category / Industry</label>
                    <select
                      value={profileForm.vertical}
                      onChange={(e) => setProfileForm({ ...profileForm, vertical: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                    >
                      <option value="OTHER">Other / General Business</option>
                      <option value="RETAIL">Shopping & Retail</option>
                      <option value="AUTO">Automotive</option>
                      <option value="BEAUTY">Beauty, Spa & Salon</option>
                      <option value="APPAREL">Clothing & Apparel</option>
                      <option value="EDU">Education & Academy</option>
                      <option value="ENTERTAIN">Entertainment & Media</option>
                      <option value="EVENT_PLAN">Event Planning & Services</option>
                      <option value="FINANCE">Finance & Banking</option>
                      <option value="GROCERY">Grocery Store</option>
                      <option value="GOVT">Public & Government Services</option>
                      <option value="HOTEL">Hotel & Lodging</option>
                      <option value="HEALTH">Medical & Health</option>
                      <option value="NONPROFIT">Non-Profit Organization</option>
                      <option value="PROF_SERVICES">Professional Services</option>
                      <option value="RESTAURANT">Restaurant & Cafe</option>
                      <option value="TRAVEL">Travel & Transportation</option>
                    </select>
                  </div>

                  {/* Address & Email in a 2-col row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
                      <input
                        type="text"
                        maxLength={256}
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        placeholder="e.g. 102 Business Hub, Mumbai"
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
                      <input
                        type="email"
                        maxLength={128}
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        placeholder="support@example.com"
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Websites */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Website 1</label>
                      <input
                        type="url"
                        value={profileForm.website1}
                        onChange={(e) => setProfileForm({ ...profileForm, website1: e.target.value })}
                        placeholder="https://mywebsite.com"
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Website 2 / Social</label>
                      <input
                        type="url"
                        value={profileForm.website2}
                        onChange={(e) => setProfileForm({ ...profileForm, website2: e.target.value })}
                        placeholder="https://instagram.com/mybrand"
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 mt-2">
                    <button
                      type="button"
                      onClick={() => setProfileTarget(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#20ba59] rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {profileSaving ? "Saving to WhatsApp..." : "Save to WhatsApp"}
                    </button>
                  </div>
                </form>

                {/* Right Preview Column: Live Mobile WhatsApp Screen Mockup */}
                <div className="md:col-span-5 flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                    📱 Live Customer Mobile Preview
                  </span>

                  {/* Phone frame */}
                  <div className="w-[280px] bg-slate-900 rounded-[36px] p-2.5 shadow-xl border-4 border-slate-800">
                    {/* Screen */}
                    <div className="bg-[#121b22] text-white rounded-[26px] overflow-hidden min-h-[460px] flex flex-col text-xs font-sans">
                      {/* Status Bar */}
                      <div className="bg-[#0b141a] px-4 py-1 text-[10px] text-slate-400 flex justify-between items-center">
                        <span>9:41</span>
                        <div className="flex items-center gap-1">
                          <span>5G</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Header */}
                      <div className="bg-[#1f2c34] px-3 py-2.5 flex items-center gap-2 border-b border-slate-800">
                        <span className="text-sm">←</span>
                        <span className="font-semibold text-[13px]">Business Info</span>
                      </div>

                      {/* Content scroll area */}
                      <div className="p-3 flex-1 flex flex-col items-center text-center overflow-y-auto">
                        {/* Profile DP */}
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-700 border-2 border-emerald-400 mt-2 mb-2 flex items-center justify-center text-slate-400 font-bold text-lg">
                          {profileForm.preview_image ? (
                            <img
                              src={profileForm.preview_image}
                              alt="DP Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>WA</span>
                          )}
                        </div>

                        {/* Business Name */}
                        <div className="flex items-center gap-1 font-bold text-sm text-slate-100">
                          <span>{profileTarget.name || "Business Name"}</span>
                          <span className="text-emerald-400 text-xs" title="Official WhatsApp Business">✓</span>
                        </div>

                        {/* Phone Number */}
                        <span className="text-[11px] text-slate-400 mb-2">
                          {profileTarget.display_phone_number ||
                           (profileTarget.provider_metadata as Record<string, string> | undefined)?.display_phone_number ||
                           "+91 82379 96380"}
                        </span>

                        {/* Category badge */}
                        <span className="inline-block bg-[#1f2c34] text-emerald-300 text-[10px] px-2.5 py-0.5 rounded-full mb-3">
                          {profileForm.vertical || "Business"}
                        </span>

                        {/* About card */}
                        <div className="w-full bg-[#1f2c34] rounded-xl p-2.5 mb-2 text-left">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide block mb-0.5">About</span>
                          <p className="text-[11px] text-slate-200">
                            {profileForm.about || "Available on WhatsApp"}
                          </p>
                        </div>

                        {/* Details card (Description, Timing, Address, Contact) */}
                        <div className="w-full bg-[#1f2c34] rounded-xl p-2.5 text-left flex flex-col gap-2">
                          {profileForm.description && (
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wide block mb-0.5">Description & Hours</span>
                              <p className="text-[11px] text-slate-300 whitespace-pre-line leading-relaxed">
                                {profileForm.description}
                              </p>
                            </div>
                          )}

                          {profileForm.address && (
                            <div className="flex items-start gap-1.5 pt-1 border-t border-slate-700/60">
                              <span className="text-xs">📍</span>
                              <span className="text-[11px] text-slate-300">{profileForm.address}</span>
                            </div>
                          )}

                          {profileForm.email && (
                            <div className="flex items-start gap-1.5 pt-1 border-t border-slate-700/60">
                              <span className="text-xs">✉</span>
                              <span className="text-[11px] text-emerald-400 truncate">{profileForm.email}</span>
                            </div>
                          )}

                          {(profileForm.website1 || profileForm.website2) && (
                            <div className="flex items-start gap-1.5 pt-1 border-t border-slate-700/60">
                              <span className="text-xs">🌐</span>
                              <div className="flex flex-col text-[11px] text-emerald-400 truncate">
                                {profileForm.website1 && <span className="truncate">{profileForm.website1}</span>}
                                {profileForm.website2 && <span className="truncate">{profileForm.website2}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
