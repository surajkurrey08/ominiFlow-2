"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTemplate,
  getTemplate,
  submitTemplate,
  updateTemplate,
  type AiTemplateDraft,
  type TemplateButton,
} from "@/lib/templates/browser";
import { listChannels, type ChannelConnection } from "@/lib/channels/browser";
import { AiTemplateModal, AI_TEMPLATE_DRAFT_KEY } from "@/components/templates/ai-template-modal";

const LANGUAGES = [
  { value: "en_US", label: "English (US) - en_US" },
  { value: "en_GB", label: "English (UK) - en_GB" },
  { value: "hi", label: "Hindi - hi" },
  { value: "es", label: "Spanish - es" },
  { value: "pt_BR", label: "Portuguese (BR) - pt_BR" },
  { value: "fr", label: "French - fr" },
  { value: "de", label: "German - de" },
  { value: "ar", label: "Arabic - ar" },
  { value: "id", label: "Indonesian - id" },
  { value: "it", label: "Italian - it" },
  { value: "mr", label: "Marathi - mr" },
  { value: "gu", label: "Gujarati - gu" },
  { value: "bn", label: "Bengali - bn" },
  { value: "ta", label: "Tamil - ta" },
  { value: "te", label: "Telugu - te" },
];

const CATEGORY_MAP: Record<string, "MARKETING" | "UTILITY" | "AUTHENTICATION"> = {
  Marketing: "MARKETING",
  Utility: "UTILITY",
  Authentication: "AUTHENTICATION",
};

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
};

const HEADER_LABEL: Record<string, string> = {
  none: "None",
  text: "Text",
  image: "Image",
  video: "Video",
  document: "Document",
};

function toMetaName(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

interface ButtonItem {
  id: string;
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

const ChevronLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const SparklesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 3v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zm7 5v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zM4 15v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zm16-4v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2z" />
  </svg>
);
const SaveIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const LockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export function TemplateEditor() {
  const router = useRouter();

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<"Standard" | "OTP">("Standard");
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [category, setCategory] = useState<"Marketing" | "Utility" | "Authentication">("Marketing");
  const [language, setLanguage] = useState("en_US");
  const [headerType, setHeaderType] = useState("None");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [actionButtons, setActionButtons] = useState<ButtonItem[]>([]);
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState("11:27 AM");

  // OTP specific state
  const [otpButtonText, setOtpButtonText] = useState("Copy code");
  const [otpExpiration, setOtpExpiration] = useState(5);
  const [otpSecurityRecommendation, setOtpSecurityRecommendation] = useState(true);

  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submittingMeta, setSubmittingMeta] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep live time for phone mockup
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    };
    updateTime();
  }, []);

  // Generate preview object URL when header media file is selected
  useEffect(() => {
    if (headerFile) {
      const url = URL.createObjectURL(headerFile);
      setHeaderPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setHeaderPreviewUrl(null);
    }
  }, [headerFile]);

  // Load channels
  useEffect(() => {
    listChannels({ page: 1, page_size: 100, channel_type: "whatsapp" })
      .then((r) => {
        setChannels(r.items);
        if (r.items.length > 0) {
          setChannelId((prev) => prev || r.items[0].id);
        }
      })
      .catch(() => setChannels([]));
  }, []);

  // Sync category with OTP type
  useEffect(() => {
    if (templateType === "OTP") {
      setCategory("Authentication");
    } else if (category === "Authentication") {
      setCategory("Marketing");
    }
  }, [templateType]);

  // Handle display name change and auto-compute Meta name
  function handleDisplayNameChange(val: string) {
    setDisplayName(val);
    if (!nameManuallyEdited) {
      setName(toMetaName(val));
    }
  }

  // Pre-fill from AI draft or URL params (?id=... or ?duplicate=...)
  useEffect(() => {
    let active = true;
    void (async () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const editId = params.get("id");
      const duplicateId = params.get("duplicate");

      if (editId) {
        try {
          const existing = await getTemplate(editId);
          if (active && existing) {
            setEditingTemplateId(existing.status === "draft" ? existing.id : null);
            setName(existing.name);
            setDisplayName(existing.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
            setNameManuallyEdited(true);
            setChannelId(existing.channel_connection_id);
            setLanguage(existing.language || "en_US");
            if (existing.category) {
              const catUpper = existing.category.toUpperCase();
              setCategory((CATEGORY_LABEL[catUpper] as "Marketing" | "Utility" | "Authentication") || "Marketing");
            }

            // Extract components
            for (const c of existing.components) {
              const ctype = String(c.type || "").toUpperCase();
              if (ctype === "HEADER") {
                const format = String(c.format || "TEXT").toUpperCase();
                setHeaderType(format === "TEXT" ? "Text" : format === "IMAGE" ? "Image" : format === "VIDEO" ? "Video" : format === "DOCUMENT" ? "Document" : "None");
                if (typeof c.text === "string") setHeaderText(c.text);
              } else if (ctype === "BODY") {
                if (typeof c.text === "string") setBodyText(c.text);
              } else if (ctype === "FOOTER") {
                if (typeof c.text === "string") setFooterText(c.text);
              } else if (ctype === "BUTTONS" && Array.isArray(c.buttons)) {
                setActionButtons(
                  c.buttons.map((b: Record<string, unknown>, idx: number) => ({
                    id: String(idx),
                    type: (String(b.type || "QUICK_REPLY").toUpperCase() as "QUICK_REPLY" | "URL" | "PHONE_NUMBER") || "QUICK_REPLY",
                    text: String(b.text || ""),
                    url: typeof b.url === "string" ? b.url : undefined,
                    phone_number: typeof b.phone_number === "string" ? b.phone_number : undefined,
                  }))
                );
              }
            }
            return;
          }
        } catch {
          // ignore
        }
      }

      if (duplicateId) {
        try {
          const existing = await getTemplate(duplicateId);
          if (active && existing) {
            const copyName = `${existing.name}_copy`.slice(0, 512);
            setName(copyName);
            setDisplayName(`${existing.name.replace(/_/g, " ")} Copy`.replace(/\b\w/g, (c) => c.toUpperCase()));
            setNameManuallyEdited(true);
            setChannelId(existing.channel_connection_id);
            setLanguage(existing.language || "en_US");
            if (existing.category) {
              const catUpper = existing.category.toUpperCase();
              setCategory((CATEGORY_LABEL[catUpper] as "Marketing" | "Utility" | "Authentication") || "Marketing");
            }
            for (const c of existing.components) {
              const ctype = String(c.type || "").toUpperCase();
              if (ctype === "HEADER") {
                const format = String(c.format || "TEXT").toUpperCase();
                setHeaderType(format === "TEXT" ? "Text" : format === "IMAGE" ? "Image" : format === "VIDEO" ? "Video" : format === "DOCUMENT" ? "Document" : "None");
                if (typeof c.text === "string") setHeaderText(c.text);
              } else if (ctype === "BODY") {
                if (typeof c.text === "string") setBodyText(c.text);
              } else if (ctype === "FOOTER") {
                if (typeof c.text === "string") setFooterText(c.text);
              } else if (ctype === "BUTTONS" && Array.isArray(c.buttons)) {
                setActionButtons(
                  c.buttons.map((b: Record<string, unknown>, idx: number) => ({
                    id: String(idx),
                    type: (String(b.type || "QUICK_REPLY").toUpperCase() as "QUICK_REPLY" | "URL" | "PHONE_NUMBER") || "QUICK_REPLY",
                    text: String(b.text || ""),
                    url: typeof b.url === "string" ? b.url : undefined,
                    phone_number: typeof b.phone_number === "string" ? b.phone_number : undefined,
                  }))
                );
              }
            }
            return;
          }
        } catch {
          // ignore
        }
      }

      // Check session storage for AI / Common Library draft
      try {
        const raw = sessionStorage.getItem(AI_TEMPLATE_DRAFT_KEY);
        if (raw && active) {
          const d = JSON.parse(raw) as AiTemplateDraft;
          applyDraft(d);
          sessionStorage.removeItem(AI_TEMPLATE_DRAFT_KEY);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function applyDraft(d: AiTemplateDraft) {
    setName(d.name || "");
    const pretty = (d.name || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    setDisplayName(pretty || "Custom Template");
    setNameManuallyEdited(Boolean(d.name));
    setCategory((CATEGORY_LABEL[d.category] as "Marketing" | "Utility" | "Authentication") || "Marketing");
    setLanguage(d.language || "en_US");
    setHeaderType(HEADER_LABEL[d.header_type?.toLowerCase()] || "None");
    setHeaderText(d.header_text || "");
    setBodyText(d.body_text || "");
    setFooterText(d.footer_text || "");
    if (d.buttons && d.buttons.length) {
      setActionButtons(
        d.buttons.map((txt, idx) => ({
          id: String(idx),
          type: "QUICK_REPLY",
          text: txt,
        }))
      );
    }
  }

  // Compute detected body variables {{1}}, {{2}}
  const bodyVariables = [
    ...new Set(Array.from(bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (match) => `{{${match[1]}}}`)),
  ];

  // Helper to add variable to body
  const addVariableToBody = () => {
    const existingNums = Array.from(bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => parseInt(m[1], 10));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const token = `{{${nextNum}}}`;

    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextText = bodyText.substring(0, start) + token + bodyText.substring(end);
      setBodyText(nextText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setBodyText((prev) => `${prev} ${token}`);
    }

    setBodyExamples((prev) => ({
      ...prev,
      [token]: prev[token] || `Sample value`,
    }));
  };

  // Rich text formatting wrap
  const wrapFormat = (wrapper: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = bodyText.substring(start, end);
    if (selected) {
      const replaced = `${wrapper}${selected}${wrapper}`;
      setBodyText(bodyText.substring(0, start) + replaced + bodyText.substring(end));
    } else {
      setBodyText(bodyText + wrapper + wrapper);
    }
    textarea.focus();
  };

  const insertEmoji = (emoji: string) => {
    setBodyText((prev) => `${prev} ${emoji}`);
  };

  function sanitizeUrlInput(raw: string): string {
    let val = raw.trim();
    if (!val) return "";
    if ((val.match(/https?:\/\//g) || []).length > 1) {
      const lastIdx = Math.max(val.lastIndexOf("http://"), val.lastIndexOf("https://"));
      val = val.substring(lastIdx).replace(/ample\.com.*$/i, "").trim();
    }
    return val;
  }

  function sanitizePhoneInput(raw: string): string {
    let val = raw.trim().replace(/[\s\-()]/g, "");
    if (!val) return "";
    if (!val.startsWith("+")) {
      if (val.length === 10) {
        val = `+91${val}`;
      } else {
        val = `+${val}`;
      }
    }
    // If the 9-digit typo was entered (missing 6 in 8237996380), auto-correct to the channel's actual number
    if (val === "+91823799380" || val === "+823799380") {
      val = "+918237996380";
    }
    return val;
  }

  // Button actions
  function addActionButton(type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER") {
    const newBtn: ButtonItem = {
      id: Math.random().toString(),
      type,
      text: type === "QUICK_REPLY" ? "Quick Reply" : type === "URL" ? "Visit Website" : "Call Support",
      url: type === "URL" ? "" : undefined,
      phone_number: type === "PHONE_NUMBER" ? "" : undefined,
    };
    setActionButtons([...actionButtons, newBtn]);
  }

  function updateActionButton(id: string, patch: Partial<ButtonItem>) {
    setActionButtons(actionButtons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeActionButton(id: string) {
    setActionButtons(actionButtons.filter((b) => b.id !== id));
  }

  function serializeButtons(): TemplateButton[] {
    if (templateType === "OTP") {
      return [{ type: "QUICK_REPLY", text: otpButtonText || "Copy code" }];
    }
    return actionButtons
      .filter((b) => b.text.trim().length > 0)
      .map((b) => {
        let cleanUrl = b.url ? sanitizeUrlInput(b.url) : undefined;
        if (cleanUrl && !cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          cleanUrl = `https://${cleanUrl}`;
        }
        let cleanPhone = b.phone_number ? sanitizePhoneInput(b.phone_number) : undefined;
        return {
          type: b.type,
          text: b.text.trim().slice(0, 25),
          url: b.type === "URL" ? cleanUrl : undefined,
          phone_number: b.type === "PHONE_NUMBER" ? cleanPhone : undefined,
        };
      });
  }

  async function saveDraft() {
    setError("");
    setNotice("");
    if (!channelId) return setError("Select a connected WhatsApp channel first.");
    const finalName = name.trim() || toMetaName(displayName);
    if (!/^[a-z0-9_]{1,512}$/.test(finalName)) {
      return setError("Template identifier must contain lowercase letters, numbers, and underscores only.");
    }
    if (!bodyText.trim() && templateType !== "OTP") {
      return setError("Body text is required.");
    }

    setSaving(true);
    try {
      const payloadBody =
        templateType === "OTP"
          ? "{{1}} is your verification code. For your security, do not share this code."
          : bodyText.trim();

      const payloadButtons = serializeButtons();

      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, {
          name: finalName,
          language,
          category: CATEGORY_MAP[category] ?? "MARKETING",
          header_format: headerType.toUpperCase() as "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT",
          header_text: headerType === "Text" ? headerText.trim().slice(0, 60) || null : null,
          body_text: payloadBody,
          footer_text: footerText.trim() || null,
          buttons: payloadButtons,
        });
        setNotice("Draft updated successfully.");
      } else {
        await createTemplate({
          channel_connection_id: channelId,
          name: finalName,
          language,
          category: CATEGORY_MAP[category] ?? "MARKETING",
          header_format: headerType.toUpperCase() as "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT",
          header_text: headerType === "Text" ? headerText.trim().slice(0, 60) || null : null,
          body_text: payloadBody,
          footer_text: footerText.trim() || null,
          buttons: payloadButtons,
        });
        setNotice("Draft template saved locally.");
      }
      router.push("/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template draft.");
    } finally {
      setSaving(false);
    }
  }

  async function submitToMeta() {
    setError("");
    setNotice("");
    if (!channelId) return setError("Select a connected WhatsApp channel first.");
    const finalName = name.trim() || toMetaName(displayName);
    if (!/^[a-z0-9_]{1,512}$/.test(finalName)) {
      return setError("Template identifier must contain lowercase letters, numbers, and underscores only.");
    }
    if (!bodyText.trim() && templateType !== "OTP") {
      return setError("Body text is required.");
    }

    if (templateType !== "OTP" && bodyVariables.some((v) => !bodyExamples[v]?.trim())) {
      return setError("Provide one sample value for every variable in the body before submitting for Meta approval.");
    }
    if (["Image", "Video", "Document"].includes(headerType) && !headerFile && templateType === "Standard") {
      return setError(`Choose a sample ${headerType.toLowerCase()} file for Meta approval review.`);
    }

    if (templateType !== "OTP") {
      for (const btn of actionButtons) {
        if (btn.type === "URL") {
          let cleanUrl = sanitizeUrlInput(btn.url || "");
          if (!cleanUrl) {
            return setError(`Please enter a website URL for the button "${btn.text || "Visit Website"}".`);
          }
          if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
            cleanUrl = `https://${cleanUrl}`;
          }
          try {
            const u = new URL(cleanUrl);
            if (!u.hostname || u.hostname.includes(" ") || !u.hostname.includes(".")) {
              throw new Error();
            }
          } catch {
            return setError(
              `The website URL "${btn.url}" is not a valid address. Meta requires a complete website address starting with https:// (e.g. https://fmfilms.in).`
            );
          }
        }
        if (btn.type === "PHONE_NUMBER") {
          const cleanPhone = sanitizePhoneInput(btn.phone_number || "");
          if (!cleanPhone) {
            return setError(
              `Please enter a valid phone number with country code for "${btn.text || "Call Support"}" (e.g. +91 8237996380).`
            );
          }
          if (cleanPhone.startsWith("+91")) {
            const digits = cleanPhone.replace("+91", "").replace(/\D/g, "");
            if (digits.length !== 10) {
              return setError(
                `Indian mobile numbers must be exactly 10 digits after +91. You entered ${digits.length} digits (${cleanPhone}). Please enter a valid 10-digit number like +91 8237996380.`
              );
            }
          } else if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
            return setError(
              `Please enter a valid phone number with country code for "${btn.text || "Call Support"}" (e.g. +91 8237996380).`
            );
          }
        }
      }
    }

    setSubmittingMeta(true);
    try {
      const payloadBody =
        templateType === "OTP"
          ? "{{1}} is your verification code. For your security, do not share this code."
          : bodyText.trim();

      const payloadButtons = serializeButtons();

      const payloadExamples =
        templateType === "OTP"
          ? ["123456"]
          : bodyVariables.map((v) => bodyExamples[v]?.trim() || "Sample");

      await submitTemplate({
        channel_connection_id: channelId,
        name: finalName,
        language,
        category: CATEGORY_MAP[category] ?? "MARKETING",
        header_format: headerType.toUpperCase() as "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT",
        header_text: headerType === "Text" ? headerText.trim().slice(0, 60) : null,
        body_text: payloadBody,
        footer_text: footerText.trim() || null,
        buttons: payloadButtons,
        body_examples: payloadExamples,
        ...(headerFile ? { header_file: headerFile } : {}),
      });

      router.push("/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Meta rejected the template submission.");
    } finally {
      setSubmittingMeta(false);
    }
  }

  // Live WhatsApp formatted body renderer
  const renderFormattedBody = () => {
    if (!bodyText.trim()) {
      return <span className="text-slate-400 italic">Your message preview will appear here</span>;
    }

    let text = bodyText;
    bodyVariables.forEach((v) => {
      const sample = bodyExamples[v];
      if (sample && sample.trim()) {
        text = text.replaceAll(v, `__SAMPLE_${v}_${sample.trim()}__`);
      } else {
        text = text.replaceAll(v, `__VAR_${v}__`);
      }
    });

    const lines = text.split("\n");
    return lines.map((line, lidx) => {
      const parts = line.split(/(__SAMPLE_[^{}]+__|__VAR_[^{}]+__)/g);
      return (
        <span key={lidx} className="block min-h-[1.2em]">
          {parts.map((p, pidx) => {
            if (p.startsWith("__SAMPLE_")) {
              const val = p.replace(/^__SAMPLE_\{\{\d+\}\}_/, "").replace(/__$/, "");
              return (
                <span
                  key={pidx}
                  className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md inline-block shadow-2xs"
                >
                  {val}
                </span>
              );
            }
            if (p.startsWith("__VAR_")) {
              const token = p.replace("__VAR_", "").replace("__", "");
              return (
                <span
                  key={pidx}
                  className="bg-purple-100 text-purple-700 font-mono font-bold px-1.5 py-0.5 rounded-md inline-block"
                >
                  {token}
                </span>
              );
            }
            return <span key={pidx}>{p}</span>;
          })}
        </span>
      );
    });
  };

  const selectedChannel = channels.find((c) => c.id === channelId);

  return (
    <div className="bg-[#f8f9fa] min-h-screen text-slate-800 font-sans pb-16">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="px-6 py-3.5 flex items-center justify-between mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <Link
              href="/templates"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              title="Back to Templates"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                {editingTemplateId ? "Edit Draft Template" : "Create WhatsApp Template"}
              </h1>
              <p className="text-xs text-slate-500">
                Design custom messages with headers, variables, and action buttons for Meta approval.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl font-bold text-xs border border-purple-200 transition cursor-pointer"
            >
              <SparklesIcon className="w-4 h-4 text-purple-600" />
              <span>Create with AI</span>
            </button>

            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || submittingMeta}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs border border-slate-200 transition shadow-2xs disabled:opacity-60 cursor-pointer"
            >
              <SaveIcon className="w-4 h-4 text-slate-500" />
              <span>{saving ? "Saving…" : "Save Draft"}</span>
            </button>

            <button
              type="button"
              onClick={() => void submitToMeta()}
              disabled={saving || submittingMeta}
              className="flex items-center gap-2 px-4 py-2 bg-[#00b050] hover:bg-[#009040] text-white rounded-xl font-bold text-xs transition shadow-sm disabled:opacity-60 cursor-pointer"
            >
              <span>{submittingMeta ? "Submitting to Meta…" : "Submit for Meta Approval"}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 mx-auto max-w-7xl flex flex-col lg:flex-row gap-8 items-start">
        {/* Left Column: Form Sections */}
        <div className="flex-1 w-full space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-between" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} className="text-rose-500 hover:text-rose-800">✕</button>
            </div>
          )}
          {notice && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} className="text-emerald-500 hover:text-emerald-800">✕</button>
            </div>
          )}

          {/* Section 1: Template Info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Template Details</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateType("Standard")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    templateType === "Standard"
                      ? "bg-emerald-50 text-[#00b050] border border-emerald-200"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateType("OTP")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    templateType === "OTP"
                      ? "bg-emerald-50 text-[#00b050] border border-emerald-200"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  OTP / Auth
                </button>
              </div>
            </div>

            {/* Target Channel */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target WhatsApp Channel <span className="text-rose-500">*</span>
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050] focus:ring-1 focus:ring-[#00b050]"
              >
                <option value="">{channels.length ? "Select a WhatsApp channel" : "No connected channels found"}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.external_account_id ? `(${c.external_account_id})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Templates are submitted directly to the Meta WABA linked to this channel.
              </p>
            </div>

            {/* Names: Display Name + Meta Identifier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Template Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="e.g. Order Confirmation"
                  maxLength={100}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050] focus:ring-1 focus:ring-[#00b050]"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Friendly name displayed on your dashboard.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Meta Template Name (Identifier) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setNameManuallyEdited(true);
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                  }}
                  placeholder="e.g. order_confirmation"
                  maxLength={512}
                  className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-mono font-medium text-slate-800 outline-none focus:border-[#00b050] focus:ring-1 focus:ring-[#00b050]"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Lowercase letters, numbers, and underscores only (Meta rule).
                </span>
              </div>
            </div>

            {/* Category and Language */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  disabled={templateType === "OTP"}
                  onChange={(e) => setCategory(e.target.value as "Marketing" | "Utility" | "Authentication")}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050] focus:ring-1 focus:ring-[#00b050] disabled:bg-slate-50"
                >
                  <option value="Marketing">Marketing (Promotions, offers, product drops)</option>
                  <option value="Utility">Utility (Order updates, receipts, account alerts)</option>
                  <option value="Authentication">Authentication (One-time passcodes, verification)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Language <span className="text-rose-500">*</span>
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050] focus:ring-1 focus:ring-[#00b050]"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Header Configuration */}
          {templateType === "Standard" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Header (Optional)</h2>
                <span className="text-xs text-slate-400">Add a title or rich media header</span>
              </div>

              <div className="flex flex-wrap gap-4">
                {["None", "Text", "Image", "Video", "Document"].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="radio"
                      name="headerType"
                      value={opt}
                      checked={headerType === opt}
                      onChange={() => setHeaderType(opt)}
                      className="text-[#00b050] focus:ring-[#00b050]"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

              {headerType === "Text" && (
                <div className="relative mt-2">
                  <input
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Order Confirmed! (Max 60 chars)"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050]"
                  />
                  <span className="absolute right-3.5 top-3 text-[10px] font-semibold text-slate-400">
                    {headerText.length}/60
                  </span>
                </div>
              )}

              {["Image", "Video", "Document"].includes(headerType) && (
                <div className="mt-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Sample {headerType.toLowerCase()} file (Required by Meta for approval review)
                  </label>
                  <input
                    type="file"
                    accept={
                      headerType === "Image"
                        ? "image/jpeg,image/png,.jpg,.jpeg,.png"
                        : headerType === "Video"
                        ? "video/mp4,.mp4"
                        : "application/pdf,.pdf"
                    }
                    onChange={(event) => setHeaderFile(event.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#00b050] file:text-white hover:file:bg-[#009040] cursor-pointer"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {headerFile
                      ? `Selected: ${headerFile.name} (${(headerFile.size / 1024 / 1024).toFixed(1)} MB)`
                      : "Max sizes: Image 5 MB, Video 16 MB, PDF 100 MB."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Body & Variables */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Message Body</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Use dynamic variables like <code className="bg-emerald-50 text-emerald-800 px-1 py-0.5 rounded font-bold font-mono">{"{{1}}"}</code> for personalized names, order numbers, dates, etc.
                </p>
              </div>
              {templateType !== "OTP" && (
                <button
                  type="button"
                  onClick={addVariableToBody}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-[#00b050] rounded-xl font-bold text-xs border border-emerald-200 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                >
                  + Add Variable
                </button>
              )}
            </div>

            {templateType === "OTP" ? (
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 text-xs text-slate-700 leading-relaxed font-mono">
                {"{{1}} is your verification code. For your security, do not share this code."}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden focus-within:border-[#00b050] transition-all">
                {/* Rich formatting bar */}
                <div className="flex justify-between items-center px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => insertEmoji("😊")} title="Add Emoji" className="hover:text-slate-900">
                      😊
                    </button>
                    <button type="button" onClick={() => wrapFormat("*")} title="Bold (*)" className="font-bold hover:text-slate-900">
                      B
                    </button>
                    <button type="button" onClick={() => wrapFormat("_")} title="Italic (_)" className="italic hover:text-slate-900">
                      I
                    </button>
                    <button type="button" onClick={() => wrapFormat("~")} title="Strikethrough (~)" className="line-through hover:text-slate-900">
                      S
                    </button>
                  </div>
                  <span className="font-semibold text-slate-400">{bodyText.length}/1024</span>
                </div>

                <textarea
                  ref={textareaRef}
                  className="w-full min-h-[140px] p-4 text-sm resize-none outline-none text-slate-800 placeholder:text-slate-400 leading-relaxed font-sans"
                  placeholder="e.g. Hello {{1}}, your order #{{2}} of {{3}} is confirmed! Track your delivery anytime by replying to this chat."
                  value={bodyText}
                  maxLength={1024}
                  onChange={(e) => setBodyText(e.target.value)}
                />
              </div>
            )}

            {/* Variable Samples for Meta review */}
            {bodyVariables.length > 0 && templateType !== "OTP" && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    Variable Sample Values ({bodyVariables.length})
                  </h3>
                  <span className="text-[11px] text-indigo-600">Required by Meta reviewers</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {bodyVariables.map((variable) => (
                    <div key={variable}>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Sample for <span className="text-emerald-600 font-mono">{variable}</span>
                      </label>
                      <input
                        type="text"
                        value={bodyExamples[variable] || ""}
                        onChange={(e) =>
                          setBodyExamples((prev) => ({ ...prev, [variable]: e.target.value }))
                        }
                        placeholder={`e.g. John Doe, $49.99, #1042`}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Footer */}
          {templateType === "Standard" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Footer (Optional)</h2>
                <span className="text-xs text-slate-400">Max 60 characters</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Reply STOP to unsubscribe or HELP for support."
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-[#00b050]"
                />
                <span className="absolute right-3.5 top-3 text-[10px] font-semibold text-slate-400">
                  {footerText.length}/60
                </span>
              </div>
            </div>
          )}

          {/* Section 5: Buttons */}
          {templateType === "Standard" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Interactive Buttons (Optional)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add Quick Reply pills, Visit Website links, or Call Support phone numbers.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addActionButton("QUICK_REPLY")}
                    disabled={actionButtons.length >= 10}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    + Quick Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => addActionButton("URL")}
                    disabled={actionButtons.length >= 10}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    + Website URL
                  </button>
                  <button
                    type="button"
                    onClick={() => addActionButton("PHONE_NUMBER")}
                    disabled={actionButtons.length >= 10}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    + Call Phone
                  </button>
                </div>
              </div>

              {actionButtons.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 italic">
                  No buttons added. Click a button type above to add interactive actions.
                </p>
              ) : (
                <div className="space-y-3">
                  {actionButtons.map((btn, index) => (
                    <div
                      key={btn.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-700">
                          {index + 1}
                        </span>
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                          {btn.type === "QUICK_REPLY" ? "Quick Reply" : btn.type === "URL" ? "URL" : "Call"}
                        </span>
                      </div>

                      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={btn.text}
                          onChange={(e) => updateActionButton(btn.id, { text: e.target.value })}
                          placeholder="Button label (max 25)"
                          maxLength={25}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#00b050]"
                        />

                        {btn.type === "URL" && (
                          <input
                            type="url"
                            value={btn.url || ""}
                            onChange={(e) => updateActionButton(btn.id, { url: e.target.value })}
                            onBlur={(e) => {
                              const cleaned = sanitizeUrlInput(e.target.value);
                              updateActionButton(btn.id, { url: cleaned });
                            }}
                            placeholder="https://yourwebsite.com"
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#00b050]"
                          />
                        )}

                        {btn.type === "PHONE_NUMBER" && (
                          <input
                            type="tel"
                            value={btn.phone_number || ""}
                            onChange={(e) => updateActionButton(btn.id, { phone_number: e.target.value })}
                            onBlur={(e) => {
                              const formatted = sanitizePhoneInput(e.target.value);
                              updateActionButton(btn.id, { phone_number: formatted });
                            }}
                            placeholder="+91 8237996380"
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#00b050]"
                          />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeActionButton(btn.id)}
                        className="text-slate-400 hover:text-rose-600 transition p-1"
                        title="Remove Button"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OTP Section (When OTP is active) */}
          {templateType === "OTP" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900">OTP Button & Expiration</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Button Label
                  </label>
                  <input
                    value={otpButtonText}
                    onChange={(e) => setOtpButtonText(e.target.value)}
                    maxLength={25}
                    placeholder="Copy code"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Code Expiration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={otpExpiration}
                    onChange={(e) => setOtpExpiration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Realistic WhatsApp Phone Preview Mockup */}
        <div className="w-full lg:w-[380px] lg:sticky lg:top-20 self-start">
          <div className="border-[8px] border-slate-900 rounded-[3rem] overflow-hidden bg-[#efeae2] h-[720px] flex flex-col relative shadow-2xl">
            {/* Phone Top Notch */}
            <div className="bg-white text-slate-900 px-6 pt-3 pb-2 flex justify-between items-center text-xs font-bold border-b border-slate-100 z-10">
              <span>{currentTime}</span>
              <div className="w-20 h-4 bg-black rounded-full" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]">5G</span>
                <div className="w-4 h-2.5 bg-slate-900 rounded-xs" />
              </div>
            </div>

            {/* WhatsApp Chat Bar Header */}
            <div className="bg-[#075e54] text-white px-4 py-3 flex items-center gap-3 z-10 shadow-sm">
              <ChevronLeftIcon className="w-4 h-4 text-white/80" />
              <div className="w-8 h-8 rounded-full bg-emerald-700 border border-white/30 flex items-center justify-center font-bold text-xs uppercase">
                {selectedChannel?.name ? selectedChannel.name.charAt(0) : "O"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate flex items-center gap-1">
                  <span>{selectedChannel?.name || "Omniflow Business"}</span>
                  <span className="text-[#25d366] text-[11px]" title="Verified">✓</span>
                </div>
                <div className="text-[10px] text-white/70">Official Business Account</div>
              </div>
            </div>

            {/* Message Bubble Area */}
            <div className="flex-1 p-3.5 flex flex-col gap-3 relative z-10 overflow-y-auto">
              {/* Encryption Banner */}
              <div className="bg-[#fcedb3] text-slate-700 text-[10px] p-2 rounded-xl mx-auto max-w-[94%] text-center shadow-2xs flex items-center gap-1.5 leading-tight">
                <LockIcon className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                <span>
                  Messages are end-to-end encrypted with Meta Cloud API.
                </span>
              </div>

              {/* Message Bubble */}
              <div className="bg-white p-3.5 rounded-2xl rounded-tl-none shadow-xs self-start max-w-[92%] relative mt-1 text-xs leading-relaxed text-slate-800">
                {/* Header Preview */}
                {headerType === "Text" && headerText ? (
                  <div className="mb-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-1.5 leading-snug">
                    {headerText}
                  </div>
                ) : headerType === "Image" ? (
                  headerPreviewUrl ? (
                    <div className="mb-2.5 w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
                      <img src={headerPreviewUrl} alt="Header Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="mb-2.5 w-full h-24 bg-emerald-50/60 rounded-xl flex flex-col items-center justify-center text-slate-500 text-xs font-medium border border-dashed border-emerald-200/80 gap-1">
                      <span className="text-xl">📷</span>
                      <span className="text-[11px] font-bold text-slate-700">Image Header</span>
                    </div>
                  )
                ) : headerType === "Video" ? (
                  headerPreviewUrl ? (
                    <div className="mb-2.5 w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-black shadow-2xs">
                      <video src={headerPreviewUrl} controls className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="mb-2.5 w-full h-24 bg-emerald-50/60 rounded-xl flex flex-col items-center justify-center text-slate-500 text-xs font-medium border border-dashed border-emerald-200/80 gap-1">
                      <span className="text-xl">🎥</span>
                      <span className="text-[11px] font-bold text-slate-700">Video Header</span>
                    </div>
                  )
                ) : headerType === "Document" ? (
                  <div className="mb-2.5 w-full p-2.5 bg-slate-50 rounded-xl flex items-center gap-2.5 border border-slate-200 shadow-2xs">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-xs shrink-0">
                      PDF
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {headerFile ? headerFile.name : "sample_document.pdf"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {headerFile ? `${(headerFile.size / 1024).toFixed(0)} KB` : "Document header"}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Body Text */}
                <div className="leading-relaxed text-[13px] text-slate-800">
                  {renderFormattedBody()}
                </div>

                {/* Footer Text */}
                {footerText && (
                  <div className="text-[11px] text-slate-500 mt-2 italic border-t border-slate-50 pt-1">
                    {footerText}
                  </div>
                )}

                {/* Timestamp & Double Blue Checkmarks */}
                <div className="text-[10px] text-slate-400 text-right mt-1.5 flex items-center justify-end gap-1">
                  <span>{currentTime}</span>
                  <span className="text-[#34b7f1] font-bold">✓✓</span>
                </div>

                {/* Buttons rendered as WhatsApp action buttons */}
                {actionButtons.filter((b) => b.text.trim().length > 0).length > 0 && (
                  <div className="mt-2.5 -mx-3.5 -mb-3.5 border-t border-slate-100 divide-y divide-slate-100">
                    {actionButtons
                      .filter((b) => b.text.trim().length > 0)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="py-2.5 px-3 text-center text-xs font-bold text-[#00a5f4] hover:bg-slate-50 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {b.type === "URL" && <span>🔗</span>}
                          {b.type === "PHONE_NUMBER" && <span>📞</span>}
                          {b.type === "QUICK_REPLY" && <span>↩</span>}
                          <span>{b.text}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Phone Home Bar */}
            <div className="h-7 bg-[#f0f0f0] w-full mt-auto relative z-10 flex justify-center pb-1">
              <div className="w-28 h-1 bg-slate-400 rounded-full mt-auto" />
            </div>
          </div>
        </div>
      </div>

      <AiTemplateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onUse={(d) => {
          applyDraft(d);
          setAiOpen(false);
        }}
      />
    </div>
  );
}
