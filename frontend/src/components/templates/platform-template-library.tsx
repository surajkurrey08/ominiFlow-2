"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { listChannels, type ChannelConnection } from "@/lib/channels/browser";
import {
  createPlatformTemplate,
  getPlatformTemplateAdminStatus,
  listPlatformTemplates,
  setPlatformTemplateActive,
  submitPlatformTemplate,
  TemplateApiError,
  type AiTemplateDraft,
  type PlatformTemplate,
} from "@/lib/templates/browser";
import { AI_TEMPLATE_DRAFT_KEY } from "@/components/templates/ai-template-modal";

const LIBRARY_CATEGORIES = [
  { id: "all", label: "All Templates" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "appointments", label: "Appointments" },
  { id: "welcome", label: "Welcome" },
  { id: "support", label: "Support" },
  { id: "marketing", label: "Marketing" },
] as const;

function variableCount(body: string) {
  const matches = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  return new Set(matches.map((match) => match[1])).size;
}

function categoryBadgeColor(category: string): string {
  switch (category.toLowerCase()) {
    case "orders":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "payments":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "appointments":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "welcome":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "support":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "marketing":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function PlatformTemplateLibrary() {
  const router = useRouter();
  const [templates, setTemplates] = useState<PlatformTemplate[]>([]);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [examples, setExamples] = useState<Record<string, string[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickSubmitId, setQuickSubmitId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    label: "",
    language: "en_US",
    category: "orders",
    body_text: "",
  });

  const fetchLibrary = useCallback(async () => {
    const [library, admin, channelList] = await Promise.all([
      listPlatformTemplates(),
      getPlatformTemplateAdminStatus(),
      listChannels({ page: 1, page_size: 100, channel_type: "whatsapp" }),
    ]);
    return {
      templates: library.items,
      isAdmin: admin.is_platform_super_admin,
      channels: channelList.items.filter((item) => item.status === "connected"),
    };
  }, []);

  const applyLibrary = useCallback((data: Awaited<ReturnType<typeof fetchLibrary>>) => {
    setTemplates(data.templates);
    setIsAdmin(data.isAdmin);
    setChannels(data.channels);
    setChannelId((current) =>
      data.channels.some((item) => item.id === current) ? current : data.channels[0]?.id ?? ""
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyLibrary(await fetchLibrary());
    } catch (cause) {
      setError(
        cause instanceof TemplateApiError ? cause.message : "Could not load the common template library."
      );
    } finally {
      setLoading(false);
    }
  }, [applyLibrary, fetchLibrary]);

  useEffect(() => {
    let active = true;
    void fetchLibrary()
      .then((data) => {
        if (active) applyLibrary(data);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof TemplateApiError ? cause.message : "Could not load the common template library."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyLibrary, fetchLibrary]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((tpl) => {
      const matchCat =
        activeCategory === "all" || tpl.category.toLowerCase() === activeCategory.toLowerCase();
      const matchSearch =
        !q ||
        tpl.label.toLowerCase().includes(q) ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.body_text.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [templates, activeCategory, searchQuery]);

  function handleUseTemplate(template: PlatformTemplate) {
    const body = bodies[template.id] ?? template.body_text;
    const cat = template.category.toLowerCase();
    const metaCat =
      cat === "marketing" || cat === "welcome"
        ? "Marketing"
        : cat === "authentication"
        ? "Authentication"
        : "Utility";

    const draft: AiTemplateDraft = {
      name: `${template.name}_copy`,
      category: metaCat,
      language: template.language,
      header_type: "none",
      header_text: null,
      body_text: body,
      footer_text: null,
      buttons: [],
    };

    try {
      sessionStorage.setItem(AI_TEMPLATE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Fallback if sessionStorage is disabled
    }
    router.push("/templates/new");
  }

  async function createTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await createPlatformTemplate({
        ...form,
        name: form.name.trim(),
        label: form.label.trim(),
        body_text: form.body_text.trim(),
      });
      setForm({ ...form, name: "", label: "", body_text: "" });
      setNotice("Common template added to the library.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this common template.");
    } finally {
      setWorking(false);
    }
  }

  async function toggleTemplate(template: PlatformTemplate) {
    setWorking(true);
    setError("");
    try {
      await setPlatformTemplateActive(template.id, !template.is_active);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this library template.");
    } finally {
      setWorking(false);
    }
  }

  async function submitTemplate(template: PlatformTemplate) {
    const body = bodies[template.id] ?? template.body_text;
    const count = variableCount(body);
    const values = examples[template.id] ?? [];
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await submitPlatformTemplate(template.id, {
        channel_connection_id: channelId,
        body_text: body,
        examples: values.slice(0, count),
      });
      setResults((current) => ({ ...current, [template.id]: result.template.status }));
      setNotice(result.message);
      setQuickSubmitId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit this template to Meta.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      className="mb-8 rounded-2xl border border-indigo-100 bg-white p-6 shadow-xs"
      aria-labelledby="common-template-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm">
              📚
            </span>
            <h2 id="common-template-title" className="text-lg font-bold text-slate-900">
              Common WhatsApp Template Library
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Pre-approved industry templates for Orders, Payments, Appointments, Welcome, Support, and Marketing.
            Click <strong>Use Template</strong> to customize for your business, or submit directly.
          </p>
        </div>

        {channels.length > 0 && (
          <label className="flex items-center text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span>Target Channel:</span>
            <select
              className="ml-2 font-medium bg-transparent text-slate-800 outline-none cursor-pointer"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 border border-rose-200" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-800 border border-emerald-200" role="status">
          {notice}
        </div>
      )}

      {/* Category Tabs & Search Bar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
          {LIBRARY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeCategory === cat.id
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search library templates..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-slate-50/50"
          />
          <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
        </div>
      </div>

      {/* Admin Panel */}
      {isAdmin && (
        <details className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <summary className="cursor-pointer text-xs font-bold text-indigo-700 hover:text-indigo-900">
            ✦ Platform Super-Admin: Add a common reusable template to the library
          </summary>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void createTemplate(event)}>
            <label className="text-xs font-semibold text-slate-700">
              Meta template name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                required
                pattern="[a-z0-9_]{1,512}"
                maxLength={512}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="order_update"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Dashboard label
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                required
                minLength={2}
                maxLength={150}
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Order update"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Language code
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                required
                pattern="[A-Za-z]{2,3}(_[A-Za-z0-9]{2,8})?"
                maxLength={20}
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Category
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                <option value="orders">Orders</option>
                <option value="payments">Payments</option>
                <option value="appointments">Appointments</option>
                <option value="welcome">Welcome</option>
                <option value="support">Support</option>
                <option value="marketing">Marketing</option>
                <option value="utility">Utility</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700 md:col-span-2">
              Body (use numbered placeholders: {"{{1}}"}, {"{{2}}"})
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                rows={3}
                required
                maxLength={1024}
                value={form.body_text}
                onChange={(event) => setForm({ ...form, body_text: event.target.value })}
              />
            </label>
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 md:col-span-2 md:justify-self-end cursor-pointer hover:bg-indigo-700 transition"
              type="submit"
              disabled={working}
            >
              {working ? "Saving…" : "Add to shared library"}
            </button>
          </form>
        </details>
      )}

      {/* Library Grid */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading common templates…</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <span className="text-3xl">📋</span>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {searchQuery || activeCategory !== "all"
              ? "No templates match your search or filter."
              : "No common templates are available yet."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {searchQuery || activeCategory !== "all"
              ? "Try resetting your search or selecting a different category."
              : isAdmin
              ? "Add the first reusable template above to make it available to all tenants."
              : "Check back soon or create your own custom template."}
          </p>
          {(searchQuery || activeCategory !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              className="mt-3 inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {filteredTemplates.map((template) => {
            const body = bodies[template.id] ?? template.body_text;
            const count = variableCount(body);
            const values = examples[template.id] ?? [];
            const isSubmittingOpen = quickSubmitId === template.id;

            return (
              <article
                key={template.id}
                className={`flex flex-col justify-between rounded-xl border p-4.5 transition shadow-2xs ${
                  template.is_active
                    ? "border-slate-200 bg-white hover:border-indigo-300"
                    : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900">{template.label}</h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryBadgeColor(
                            template.category
                          )}`}
                        >
                          {template.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {template.name} · {template.language}
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
                        disabled={working}
                        onClick={() => void toggleTemplate(template)}
                      >
                        {template.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>

                  {/* WhatsApp Message Preview Bubble */}
                  <div className="mt-3 rounded-xl bg-[#efeae2] p-3 text-xs border border-[#e0dad0]">
                    <div className="relative rounded-lg bg-white p-3 shadow-2xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {body}
                      <div className="mt-1.5 flex justify-end">
                        <span className="text-[10px] text-slate-400">Preview</span>
                      </div>
                    </div>
                  </div>

                  {/* Inline quick-submit variable inputs if opened */}
                  {isSubmittingOpen && (
                    <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 space-y-2">
                      <p className="text-xs font-bold text-indigo-900">
                        Sample values for Meta approval ({count} variable{count !== 1 ? "s" : ""}):
                      </p>
                      {Array.from({ length: count }, (_, index) => (
                        <label key={index} className="block text-[11px] text-slate-600">
                          Sample for {"{{"}
                          {index + 1}
                          {"}}"}
                          <input
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white p-1.5 text-xs outline-none focus:border-indigo-500"
                            placeholder={`e.g. John Doe, $49, Order #1234`}
                            maxLength={1024}
                            value={values[index] ?? ""}
                            onChange={(event) =>
                              setExamples((current) => {
                                const next = [...(current[template.id] ?? [])];
                                next[index] = event.target.value;
                                return { ...current, [template.id]: next };
                              })
                            }
                          />
                        </label>
                      ))}
                      <div className="pt-1 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                          onClick={() => setQuickSubmitId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          disabled={
                            !template.is_active ||
                            !channelId ||
                            working ||
                            values.slice(0, count).some((value) => !value?.trim())
                          }
                          onClick={() => void submitTemplate(template)}
                        >
                          {working ? "Submitting…" : "Confirm Submit to Meta"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-500">
                    {results[template.id]
                      ? `Meta status: ${results[template.id]}`
                      : `${count} variable${count !== 1 ? "s" : ""}`}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickSubmitId(isSubmittingOpen ? null : template.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
                    >
                      {isSubmittingOpen ? "Close" : "Direct Submit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(template)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white transition shadow-2xs cursor-pointer"
                    >
                      <span>Use Template</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!channels.length && !loading && (
        <p className="mt-4 text-xs font-medium text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
          ⚠️ Connect a WhatsApp channel from <strong>Channels</strong> first to submit templates directly to Meta.
        </p>
      )}
    </section>
  );
}
