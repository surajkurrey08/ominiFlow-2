"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deleteForm, listForms, listSubmissions, type WhatsAppForm, type WhatsAppFormSubmission } from "@/lib/whatsapp-forms/browser";
import { useCreditBalance } from "@/lib/credits/use-credit-balance";

const ZapIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>);
const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>);
const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const RefreshIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>);
const EditIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>);
const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const FileTextIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>);
const DownloadIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);

export function FormsClient() {
  const creditBalance = useCreditBalance();
  const [items, setItems] = useState<WhatsAppForm[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedFormForSubmissions, setSelectedFormForSubmissions] = useState<WhatsAppForm | null>(null);
  const [submissions, setSubmissions] = useState<WhatsAppFormSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  async function refresh() {
    try {
      setBusy(true);
      const result = await listForms();
      setItems(result.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load forms.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => 
    items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())), 
    [items, search]
  );

  async function handleCopyLink(item: WhatsAppForm) {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/form/${item.id}`;
    await navigator.clipboard.writeText(url);
    setToast(`Form link copied: ${url}`);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleDelete(item: WhatsAppForm) {
    if (!window.confirm(`Delete “${item.name}”?`)) return;
    try {
      setBusy(true);
      await deleteForm(item.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete form.");
    } finally {
      setBusy(false);
    }
  }

  async function openSubmissions(form: WhatsAppForm) {
    setSelectedFormForSubmissions(form);
    setSubmissions([]);
    setSubmissionsLoading(true);
    setSubmissionsError("");
    try {
      const list = await listSubmissions(form.id);
      setSubmissions(list);
    } catch (e) {
      setSubmissionsError(e instanceof Error ? e.message : "Could not load responses.");
    } finally {
      setSubmissionsLoading(false);
    }
  }

  function getFieldLabelMap(form: WhatsAppForm): Record<string, string> {
    const map: Record<string, string> = {};
    const config = form.config as { screens?: Array<{ fields?: Array<{ id: string; label: string }> }> } | null;
    config?.screens?.forEach((s) => {
      s.fields?.forEach((f) => {
        if (f.id && f.label) map[f.id] = f.label;
      });
    });
    return map;
  }

  function exportSubmissionsCSV() {
    if (!selectedFormForSubmissions || submissions.length === 0) return;
    const labelMap = getFieldLabelMap(selectedFormForSubmissions);
    const allFieldKeys = Array.from(new Set(submissions.flatMap((s) => Object.keys(s.data || {}))));
    const headers = ["Submission ID", "Date", "Phone", "Name", ...allFieldKeys.map((k) => labelMap[k] || k)];
    const rows = submissions.map((s) => {
      const date = new Date(s.created_at).toLocaleString();
      const fieldVals = allFieldKeys.map((k) => {
        const val = s.data?.[k];
        if (val === undefined || val === null) return "";
        if (typeof val === "object") return val.filename || val.url || JSON.stringify(val);
        return String(val);
      });
      return [s.id, date, s.contact_phone || "", s.contact_name || "", ...fieldVals];
    });
    const csvContent = [headers, ...rows].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedFormForSubmissions.name.toLowerCase().replace(/\s+/g, "_")}_responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">WhatsApp Forms</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#e8f5e9] text-[#2e7d32] px-4 py-2 rounded-full font-semibold text-sm border border-[#c8e6c9]">
            <ZapIcon className="w-4 h-4 fill-current" />
            <span>{creditBalance === null ? "…" : creditBalance.toFixed(2)} AI Credits</span>
          </div>
          <button className="p-2.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 shadow-sm">
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800 mb-4">{error}</p>}
      {toast && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 font-semibold mb-4 border border-emerald-200">{toast}</p>}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
          <div className="relative w-96">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search WhatsApp Forms..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void refresh()}
              disabled={busy}
              title="Refresh forms"
              aria-label="Refresh forms"
              className="p-2.5 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshIcon className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            </button>
            <Link href="/whatsapp-forms/new" className="flex items-center gap-2 bg-[#00b050] hover:bg-[#009040] text-white px-5 py-2.5 rounded-md font-semibold text-sm transition-colors shadow-sm">
              <PlusIcon className="w-4 h-4" />
              <span>Create Form</span>
            </Link>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#fbfcfd]">
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Form ID</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Categories</th>
                  <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500 text-sm">
                      No WhatsApp Forms found. Click 'Create Form' to get started.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 text-sm font-semibold text-slate-700">
                        {item.id.slice(0, 8)}...
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-800">{item.name}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${item.status === 'active' ? 'bg-[#00b050]' : 'bg-slate-400'}`} />
                          <span className={`text-sm font-bold ${item.status === 'active' ? 'text-[#00b050]' : 'text-slate-600 capitalize'}`}>
                            {item.status}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-700">
                        {item.category || "-"}
                      </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openSubmissions(item)}
                                disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 bg-emerald-50 rounded-md text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="View form submissions and responses"
                              >
                                <FileTextIcon className="w-3.5 h-3.5" />
                                Responses
                              </button>
                              <a
                                href={`/form/${item.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                title="Open public mobile form preview"
                              >
                                View
                              </a>
                              <Link href={`/whatsapp-forms/${item.id}`} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                                <EditIcon className="w-3.5 h-3.5" />
                                Edit
                              </Link>
                              <button 
                                onClick={() => handleCopyLink(item)} 
                                disabled={busy} 
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <CopyIcon className="w-3.5 h-3.5" />
                                Copy Link
                              </button>
                              <button 
                                disabled={busy} 
                                onClick={() => handleDelete(item)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-md text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submissions Modal */}
          {selectedFormForSubmissions && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
              <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <FileTextIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          {selectedFormForSubmissions.name}
                        </h2>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          {submissions.length} {submissions.length === 1 ? "Response" : "Responses"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Form ID: {selectedFormForSubmissions.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {submissions.length > 0 && (
                      <button
                        type="button"
                        onClick={exportSubmissionsCSV}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
                        title="Export as CSV spreadsheet"
                      >
                        <DownloadIcon className="h-3.5 w-3.5 text-slate-500" />
                        <span>Export CSV</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openSubmissions(selectedFormForSubmissions)}
                      disabled={submissionsLoading}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                      title="Reload responses"
                    >
                      <RefreshIcon className={`h-4 w-4 ${submissionsLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFormForSubmissions(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                      title="Close modal"
                    >
                      <span className="text-xl leading-none">&times;</span>
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {submissionsLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-3" />
                      <p className="text-sm font-medium">Loading responses…</p>
                    </div>
                  ) : submissionsError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
                      {submissionsError}
                    </div>
                  ) : submissions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3 text-2xl">
                        📝
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">No responses yet</h3>
                      <p className="mt-1 text-xs text-slate-500 max-w-sm">
                        When customers complete this WhatsApp Form, their submitted answers will appear here in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {submissions.map((sub, idx) => {
                        const labelMap = getFieldLabelMap(selectedFormForSubmissions);
                        const dateFormatted = new Date(sub.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });
                        const entries = Object.entries(sub.data || {});

                        return (
                          <div
                            key={sub.id}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                  #{submissions.length - idx}
                                </span>
                                {(sub.contact_name || sub.contact_phone) ? (
                                  <div className="flex items-center gap-2">
                                    {sub.contact_name && (
                                      <span className="font-semibold text-sm text-slate-900">
                                        {sub.contact_name}
                                      </span>
                                    )}
                                    {sub.contact_phone && (
                                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                                        📱 {sub.contact_phone}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-500">
                                    WhatsApp Customer Submission
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400">
                                🕒 {dateFormatted}
                              </span>
                            </div>

                            {/* Fields & Answers */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {entries.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No field data provided.</p>
                              ) : (
                                entries.map(([key, value]) => {
                                  const label = labelMap[key] || key;
                                  const isFile = typeof value === "object" && value !== null && (value.url || value.filename);
                                  const isArray = Array.isArray(value);

                                  return (
                                    <div key={key} className="rounded-lg bg-slate-50/70 p-2.5 border border-slate-100">
                                      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                        {label}
                                      </span>
                                      {isFile ? (
                                        <a
                                          href={value.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline truncate max-w-full"
                                        >
                                          📎 {value.filename || "Uploaded File"}
                                        </a>
                                      ) : isArray ? (
                                        <div className="flex flex-wrap gap-1">
                                          {value.map((v: any, i: number) => (
                                            <span key={i} className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                                              {String(v)}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs font-semibold text-slate-800 break-words">
                                          {String(value ?? "—")}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 bg-slate-50/50">
                  <span className="text-xs text-slate-400">
                    Responses are stored securely in your workspace database.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedFormForSubmissions(null)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

