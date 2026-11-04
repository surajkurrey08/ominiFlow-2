"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon, XIcon, FilesIcon } from "@phosphor-icons/react";

import { listChannels, type ChannelConnection } from "@/lib/channels/browser";
import {
  createPlatformTemplate,
  getPlatformTemplateAdminStatus,
  listPlatformTemplates,
  setPlatformTemplateActive,
  submitPlatformTemplate,
  TemplateApiError,
  TEMPLATE_PAGE_SIZE,
  type AiTemplateDraft,
  type PlatformTemplate,
} from "@/lib/templates/browser";
import { AI_TEMPLATE_DRAFT_KEY } from "@/components/templates/ai-template-modal";

const LIBRARY_CATEGORIES = [
  { id: "all", label: "All" },
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

export function PlatformTemplateLibrary({ searchQuery, onSearchChange, filtersOpen, refreshKey }: { searchQuery: string; onSearchChange: (value: string) => void; filtersOpen: boolean; refreshKey: number }) {
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
  const [examples, setExamples] = useState<Record<string, string[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [quickSubmitId, setQuickSubmitId] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, search: searchQuery, category: "all" });
  const resultsRef = useRef<HTMLDivElement>(null);

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
  }, [applyLibrary, fetchLibrary, refreshKey]);

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

  const filtersChanged = pagination.search !== searchQuery || pagination.category !== activeCategory;
  const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / TEMPLATE_PAGE_SIZE));
  const page = filtersChanged ? 1 : Math.min(pagination.page, pageCount);
  const pageTemplates = filteredTemplates.slice((page - 1) * TEMPLATE_PAGE_SIZE, page * TEMPLATE_PAGE_SIZE);
  if (filtersChanged) setPagination({ page: 1, search: searchQuery, category: activeCategory });

  function changePage(nextPage: number) {
    setPagination({ page: nextPage, search: searchQuery, category: activeCategory });
    setQuickSubmitId(null);
    requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: "start" });
    });
  }

  function handleUseTemplate(template: PlatformTemplate) {
    const body = template.body_text;
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
    if (!event.currentTarget.checkValidity()) {
      setError("Complete the required template fields.");
      event.currentTarget.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
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
    const body = template.body_text;
    const count = variableCount(body);
    const values = examples[template.id] ?? [];
    if (working || !channelId || !template.is_active || Array.from({ length: count }, (_, index) => values[index]).some((value) => !value?.trim())) return;
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
    <section className="template-library" aria-label="Template library">
      <div id="library-filters" hidden={!filtersOpen}>
      <div className="template-library-heading">
        <p className="template-library-count" aria-live="polite">{loading ? "Loading templates..." : `${filteredTemplates.length} templates`}</p>
        {channels.length > 0 && <label className="template-library-channel"><span>Channel</span><select value={channelId} onChange={(event) => setChannelId(event.target.value)}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}
      </div>
      <div className="template-library-toolbar">
        <div className="template-library-categories" role="group" aria-label="Library category">{LIBRARY_CATEGORIES.map((category) => <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>{category.label}</button>)}</div>

      </div>
      </div>
      {error && <div className="templates-notice templates-notice-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
      {notice && <div className="templates-notice templates-notice-success" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss library notification" onClick={() => setNotice("")}><XIcon size={16} aria-hidden="true" /></button></div>}
      {/* Admin Panel */}
      {isAdmin && (
        <details className="template-library-admin">
          <summary className="cursor-pointer text-xs font-bold text-indigo-700 hover:text-indigo-900">
            Add library template
          </summary>
          <form className="mt-4 grid gap-3 md:grid-cols-2" noValidate onSubmit={(event) => void createTemplate(event)}>
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
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-2 text-xs"
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


      {loading ? <div className="templates-empty" role="status">Loading templates...</div> : filteredTemplates.length === 0 && !error ? <div className="templates-empty"><FilesIcon size={28} aria-hidden="true" /><strong>{searchQuery || activeCategory !== "all" ? "No matching templates" : "No library templates yet"}</strong>{(searchQuery || activeCategory !== "all") && <button type="button" className="templates-btn" onClick={() => { onSearchChange(""); setActiveCategory("all"); }}>Clear filters</button>}</div> : <div className="template-library-grid" ref={resultsRef} tabIndex={-1} role="region" aria-label="Library templates">
        {pageTemplates.map((template) => {
          const body = template.body_text;
          const count = variableCount(body);
          const values = examples[template.id] ?? [];
          const isSubmittingOpen = quickSubmitId === template.id;
          const missingSamples = Array.from({ length: count }, (_, index) => values[index]).some((value) => !value?.trim());
          return <article key={template.id} className={`template-library-card ${template.is_active ? "" : "template-library-card-inactive"}`}>
            <header><h2>{template.label}</h2><span className={`template-library-badge ${categoryBadgeColor(template.category)}`}>{template.category}</span></header>
            <p className="template-library-message" tabIndex={0} aria-label={`${template.label} message`}>{body}</p>
            <details className="template-library-metadata"><summary>Details</summary><dl><div><dt>Name</dt><dd>{template.name}</dd></div><div><dt>Language</dt><dd>{template.language}</dd></div><div><dt>Variables</dt><dd>{count}</dd></div></dl>{isAdmin && <button type="button" className="templates-btn" disabled={working} onClick={() => void toggleTemplate(template)}>{template.is_active ? "Deactivate" : "Activate"}</button>}</details>
            {isSubmittingOpen && <div className="template-library-submit" id={`submit-${template.id}`}>
              <strong>{count ? "Sample values" : "Ready to submit"}</strong>
              {Array.from({ length: count }, (_, index) => <label key={index}>Sample for {`{{${index + 1}}}`}<input maxLength={1024} value={values[index] ?? ""} onChange={(event) => setExamples((current) => { const next = [...(current[template.id] ?? [])]; next[index] = event.target.value; return { ...current, [template.id]: next }; })} /></label>)}
              <div className="template-library-submit-actions"><button type="button" className="templates-btn" disabled={working} onClick={() => setQuickSubmitId(null)}>Cancel</button><button type="button" className="templates-btn templates-btn-primary" disabled={!template.is_active || !channelId || working || missingSamples} onClick={() => void submitTemplate(template)}>{working ? "Submitting..." : "Confirm submission"}</button></div>
            </div>}
            <footer><span className="template-library-result" role="status">{results[template.id] ? `Meta: ${results[template.id]}` : template.language}</span><div><button type="button" className="templates-btn" disabled={!template.is_active || !channelId || working} aria-expanded={isSubmittingOpen} aria-controls={`submit-${template.id}`} onClick={() => setQuickSubmitId(isSubmittingOpen ? null : template.id)}>Submit to Meta</button><button type="button" className="templates-btn templates-btn-primary" disabled={!template.is_active} onClick={() => handleUseTemplate(template)}>Use template<ArrowRightIcon size={15} aria-hidden="true" /></button></div></footer>
          </article>;
        })}
      </div>}
      {!loading && filteredTemplates.length > 0 && <nav className="template-library-pagination" aria-label="Library pagination">
        <span className="template-library-range" aria-live="polite">{(page - 1) * TEMPLATE_PAGE_SIZE + 1}–{Math.min(page * TEMPLATE_PAGE_SIZE, filteredTemplates.length)} of {filteredTemplates.length}</span>
        <div><button type="button" className="templates-btn" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="templates-btn" disabled={page >= pageCount} onClick={() => changePage(page + 1)}>Next</button></div>
      </nav>}
      {!channels.length && !loading && !error && <p className="template-library-channel-notice"><Link href="/channels">Connect a WhatsApp channel</Link> to submit to Meta.</p>}
    </section>
  );
}
