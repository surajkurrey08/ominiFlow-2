"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCreditBalance } from "@/lib/credits/use-credit-balance";
import { createForm, getForm, updateForm, type WhatsAppForm } from "@/lib/whatsapp-forms/browser";

export type FieldType =
  | "heading"
  | "text"
  | "textarea"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "date";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface FormScreen {
  id: string;
  title: string;
  fields: FormField[];
}

const ZapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const ChevronLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EditIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ArrowUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ArrowDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const defaultScreens: FormScreen[] = [
  {
    id: "screen-1",
    title: "Welcome Screen",
    fields: [
      {
        id: "field-init-1",
        type: "heading",
        label: "Welcome to our Service",
        description: "Please fill out this quick form so we can assist you better.",
      },
      {
        id: "field-init-2",
        type: "text",
        label: "Full Name",
        placeholder: "Enter your full name",
        required: true,
      },
    ],
  },
];

export function FormEditor({ id }: { id?: string }) {
  const router = useRouter();
  const creditBalance = useCreditBalance();
  const [form, setForm] = useState<Partial<WhatsAppForm>>({ name: "", category: "Lead Gen", status: "draft" });
  const [screens, setScreens] = useState<FormScreen[]>(defaultScreens);
  const [activeScreenId, setActiveScreenId] = useState<string>("screen-1");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
  const [newScreenTitle, setNewScreenTitle] = useState("");
  const [newOptionText, setNewOptionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (id) {
      setBusy(true);
      getForm(id)
        .then((res) => {
          setForm(res);
          const conf = res.config as { screens?: FormScreen[] } | null;
          if (conf?.screens && Array.isArray(conf.screens) && conf.screens.length > 0) {
            setScreens(conf.screens);
            setActiveScreenId(conf.screens[0].id);
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [id]);

  const activeScreen = screens.find((s) => s.id === activeScreenId) || screens[0] || defaultScreens[0];
  const activeScreenIndex = screens.findIndex((s) => s.id === activeScreen.id);

  function handleAddScreen() {
    const nextNum = screens.length + 1;
    const newId = `screen-${Date.now()}`;
    const newScr: FormScreen = {
      id: newId,
      title: `Screen ${nextNum}`,
      fields: [],
    };
    setScreens([...screens, newScr]);
    setActiveScreenId(newId);
  }

  function handleDeleteScreen(screenId: string) {
    if (screens.length <= 1) {
      setError("A form must have at least one screen.");
      return;
    }
    const filtered = screens.filter((s) => s.id !== screenId);
    setScreens(filtered);
    if (activeScreenId === screenId) {
      setActiveScreenId(filtered[0].id);
    }
  }

  function handleSaveScreenTitle(screenId: string) {
    if (!newScreenTitle.trim()) {
      setRenamingScreenId(null);
      return;
    }
    setScreens(screens.map((s) => (s.id === screenId ? { ...s, title: newScreenTitle.trim() } : s)));
    setRenamingScreenId(null);
  }

  function handleAddComponent(type: FieldType) {
    const fieldId = `field-${Date.now()}`;
    let newField: FormField;
    switch (type) {
      case "heading":
        newField = {
          id: fieldId,
          type: "heading",
          label: "Section Heading",
          description: "Provide short instructions or overview.",
        };
        break;
      case "text":
        newField = {
          id: fieldId,
          type: "text",
          label: "Short Text Input",
          placeholder: "e.g. Your phone or email",
          required: true,
        };
        break;
      case "textarea":
        newField = {
          id: fieldId,
          type: "textarea",
          label: "Detailed Message",
          placeholder: "Type your query or comments...",
          required: false,
        };
        break;
      case "dropdown":
        newField = {
          id: fieldId,
          type: "dropdown",
          label: "Select Option",
          options: ["Option 1", "Option 2", "Option 3"],
          required: true,
        };
        break;
      case "radio":
        newField = {
          id: fieldId,
          type: "radio",
          label: "Choose Preference",
          options: ["Yes", "No", "Maybe"],
          required: true,
        };
        break;
      case "checkbox":
        newField = {
          id: fieldId,
          type: "checkbox",
          label: "Select Interests",
          options: ["Fitness", "Diet Plan", "Personal Training"],
          required: false,
        };
        break;
      case "date":
        newField = {
          id: fieldId,
          type: "date",
          label: "Appointment Date",
          placeholder: "YYYY-MM-DD",
          required: true,
        };
        break;
    }

    setScreens(
      screens.map((s) => (s.id === activeScreen.id ? { ...s, fields: [...s.fields, newField] } : s))
    );
    setEditingFieldId(fieldId);
  }

  function updateField(fieldId: string, updates: Partial<FormField>) {
    setScreens(
      screens.map((s) => {
        if (s.id === activeScreen.id) {
          return {
            ...s,
            fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
          };
        }
        return s;
      })
    );
  }

  function deleteField(fieldId: string) {
    setScreens(
      screens.map((s) => {
        if (s.id === activeScreen.id) {
          return {
            ...s,
            fields: s.fields.filter((f) => f.id !== fieldId),
          };
        }
        return s;
      })
    );
    if (editingFieldId === fieldId) setEditingFieldId(null);
  }

  function moveField(fieldId: string, direction: "up" | "down") {
    const fields = [...activeScreen.fields];
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index < 0) return;
    if (direction === "up" && index > 0) {
      const temp = fields[index - 1];
      fields[index - 1] = fields[index];
      fields[index] = temp;
    } else if (direction === "down" && index < fields.length - 1) {
      const temp = fields[index + 1];
      fields[index + 1] = fields[index];
      fields[index] = temp;
    }
    setScreens(screens.map((s) => (s.id === activeScreen.id ? { ...s, fields } : s)));
  }

  function handleAddOption(field: FormField) {
    if (!newOptionText.trim()) return;
    const current = field.options || [];
    updateField(field.id, { options: [...current, newOptionText.trim()] });
    setNewOptionText("");
  }

  function handleRemoveOption(field: FormField, optIndex: number) {
    const current = [...(field.options || [])];
    current.splice(optIndex, 1);
    updateField(field.id, { options: current });
  }

  async function handleSave(status: "draft" | "active") {
    if (!form.name?.trim()) {
      setError("Please provide a name for your form.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const configPayload = { screens };
      if (id) {
        await updateForm(id, {
          name: form.name.trim(),
          category: form.category || "Other",
          status,
          config: configPayload,
        });
        setSuccess(`Form updated successfully as ${status}!`);
      } else {
        const created = await createForm({
          name: form.name.trim(),
          category: form.category || "Other",
          config: configPayload,
        });
        if (status === "active") {
          await updateForm(created.id, { status: "active", config: configPayload });
        }
        setSuccess(`Form created successfully as ${status}!`);
      }
      setTimeout(() => {
        router.push("/whatsapp-forms");
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save form.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#f8f9fa] min-h-screen pb-16">
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between mx-auto max-w-7xl">
          <div className="flex items-center gap-4">
            <Link
              href="/whatsapp-forms"
              className="p-2 border border-slate-200 rounded-full hover:bg-slate-50 transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5 text-slate-500" />
            </Link>
            <div>
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight">WhatsApp Form Builder</h1>
              <p className="text-sm text-slate-500 mt-0.5">Design WhatsApp interactive forms visually</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#e8f5e9] text-[#2e7d32] px-4 py-2 rounded-full font-semibold text-sm border border-[#c8e6c9]">
              <ZapIcon className="w-4 h-4 fill-current" />
              <span>{creditBalance === null ? "…" : creditBalance.toFixed(2)} AI Credits</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 mx-auto max-w-7xl">
        {error && <p className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-sm font-semibold">{error}</p>}
        {success && <p className="mb-4 p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm font-semibold">{success}</p>}

        {/* Builder Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-[22px] font-bold text-slate-800">
              {id ? "Edit Form" : "Create Form"}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              1. Name your form &rarr; 2. Add screens & components &rarr; 3. Save as draft, or Publish to go live
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/whatsapp-forms"
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-md font-semibold text-slate-700 hover:bg-slate-50 shadow-sm text-sm"
            >
              Cancel
            </Link>
            <button
              onClick={() => handleSave("draft")}
              disabled={busy}
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-md font-semibold text-slate-700 hover:bg-slate-50 shadow-sm text-sm disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save draft"}
            </button>
            <button
              onClick={() => handleSave("active")}
              disabled={busy}
              className="px-5 py-2.5 bg-[#00b050] hover:bg-[#009040] text-white rounded-md font-semibold text-sm shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? "Publishing..." : "Publish →"}
            </button>
          </div>
        </div>

        {/* Form Meta details */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-bold text-slate-700 text-sm">Flow Name:</span>
            <input
              type="text"
              placeholder="e.g. Registration Form..."
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-72 px-4 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400 font-medium"
            />
            <span className="font-bold text-slate-700 text-sm ml-2">Category:</span>
            <select
              value={form.category || "Lead Gen"}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-44 px-4 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            >
              <option value="Lead Gen">Lead Gen</option>
              <option value="Sign Up">Sign Up</option>
              <option value="Customer Feedback">Customer Feedback</option>
              <option value="Support">Support</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="text-sm hidden md:block">
            <span className="font-bold text-slate-800">Save</span>{" "}
            <span className="text-slate-500">keeps it a Draft.</span>{" "}
            <span className="font-bold text-[#00b050]">Publish</span>{" "}
            <span className="text-slate-500">makes it live.</span>
          </div>
        </div>

        {/* 3-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Screens (3 Cols) */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">Screens</h3>
              <button
                onClick={handleAddScreen}
                title="Add new screen"
                className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700 transition-colors shadow-sm"
              >
                <span className="text-xl leading-none font-bold mb-0.5">+</span>
              </button>
            </div>

            <div className="space-y-3">
              {screens.map((scr, idx) => {
                const isActive = scr.id === activeScreen.id;
                return (
                  <div
                    key={scr.id}
                    onClick={() => setActiveScreenId(scr.id)}
                    className={`rounded-xl p-4 cursor-pointer transition-all border ${
                      isActive
                        ? "bg-[#e8f5e9] border-[#00b050] shadow-sm ring-2 ring-emerald-500/20"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {renamingScreenId === scr.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={newScreenTitle}
                          onChange={(e) => setNewScreenTitle(e.target.value)}
                          onBlur={() => handleSaveScreenTitle(scr.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveScreenTitle(scr.id);
                          }}
                          className="px-2 py-1 text-sm font-semibold rounded border border-emerald-500 outline-none w-full mr-2"
                        />
                      ) : (
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          <span className="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <span>{scr.title}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingScreenId(scr.id);
                            setNewScreenTitle(scr.title);
                          }}
                          title="Rename screen"
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                        </button>
                        {screens.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteScreen(scr.id);
                            }}
                            title="Delete screen"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2 font-medium">
                      {scr.fields.length} {scr.fields.length === 1 ? "field" : "fields"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-900 leading-relaxed">
              <span className="font-bold">Multi-screen Tip:</span> Split long registration forms across 2-3 screens to increase completion rates on mobile.
            </div>
          </div>

          {/* Middle: Canvas Preview (5 Cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Mobile Screen Preview
            </div>

            {/* Mobile Device Frame */}
            <div className="w-[340px] bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl border-4 border-slate-800 relative">
              {/* Device Notch & Speaker */}
              <div className="w-28 h-4 bg-slate-800 rounded-b-xl mx-auto mb-2 flex items-center justify-center">
                <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
              </div>

              {/* Inner Screen */}
              <div className="bg-[#f0f2f5] rounded-[2rem] overflow-hidden flex flex-col h-[520px]">
                {/* Screen Header */}
                <div className="bg-[#00b050] text-white px-4 py-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="font-bold text-sm truncate max-w-[200px]">
                      {activeScreen.title}
                    </span>
                  </div>
                  <span className="text-[11px] bg-emerald-700/60 font-semibold px-2 py-0.5 rounded-full">
                    {activeScreenIndex + 1} / {screens.length}
                  </span>
                </div>

                {/* Form Content Scrollable Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                  {activeScreen.fields.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      <p className="text-xs font-medium">No fields added to this screen yet.</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Click on any component on the right to add form inputs.
                      </p>
                    </div>
                  ) : (
                    activeScreen.fields.map((field, idx) => {
                      const isEditing = editingFieldId === field.id;
                      return (
                        <div
                          key={field.id}
                          className={`bg-white rounded-xl p-3 border transition-all ${
                            isEditing
                              ? "border-emerald-500 shadow-md ring-2 ring-emerald-500/10"
                              : "border-slate-200 hover:border-slate-300 shadow-xs"
                          }`}
                        >
                          {/* Field Header / Actions */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              {field.type}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveField(field.id, "up")}
                                disabled={idx === 0}
                                title="Move up"
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                              >
                                <ArrowUpIcon className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => moveField(field.id, "down")}
                                disabled={idx === activeScreen.fields.length - 1}
                                title="Move down"
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                              >
                                <ArrowDownIcon className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditingFieldId(isEditing ? null : field.id)}
                                title="Configure field"
                                className={`p-1 rounded ${
                                  isEditing ? "text-emerald-700 bg-emerald-50" : "text-slate-400 hover:text-slate-700"
                                }`}
                              >
                                <EditIcon className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteField(field.id)}
                                title="Delete field"
                                className="p-1 text-slate-400 hover:text-rose-600"
                              >
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Field Render Preview */}
                          {field.type === "heading" ? (
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{field.label}</h4>
                              {field.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{field.description}</p>
                              )}
                            </div>
                          ) : field.type === "text" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400">
                                {field.placeholder || "Enter text..."}
                              </div>
                            </div>
                          ) : field.type === "textarea" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 h-14">
                                {field.placeholder || "Type paragraph..."}
                              </div>
                            </div>
                          ) : field.type === "dropdown" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 flex justify-between items-center">
                                <span>{(field.options && field.options[0]) || "Select option"}</span>
                                <span className="text-slate-400 text-[10px]">▼</span>
                              </div>
                            </div>
                          ) : field.type === "radio" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="space-y-1.5">
                                {(field.options || []).map((opt, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                                  >
                                    <div className="w-3.5 h-3.5 rounded-full border border-slate-400" />
                                    <span>{opt}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : field.type === "checkbox" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="space-y-1.5">
                                {(field.options || []).map((opt, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                                  >
                                    <div className="w-3.5 h-3.5 rounded-sm border border-slate-400" />
                                    <span>{opt}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : field.type === "date" ? (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {field.label} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 flex justify-between items-center">
                                <span>{field.placeholder || "YYYY-MM-DD"}</span>
                                <span>📅</span>
                              </div>
                            </div>
                          ) : null}

                          {/* Inline Configuration Drawer */}
                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 bg-slate-50/70 -mx-3 -mb-3 p-3 rounded-b-xl">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Label / Title:
                                </label>
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none focus:border-emerald-500 font-medium"
                                />
                              </div>

                              {field.type === "heading" && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Subtitle / Description:
                                  </label>
                                  <input
                                    type="text"
                                    value={field.description || ""}
                                    onChange={(e) => updateField(field.id, { description: e.target.value })}
                                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none focus:border-emerald-500"
                                  />
                                </div>
                              )}

                              {["text", "textarea", "date"].includes(field.type) && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Placeholder Text:
                                  </label>
                                  <input
                                    type="text"
                                    value={field.placeholder || ""}
                                    onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none focus:border-emerald-500"
                                  />
                                </div>
                              )}

                              {["dropdown", "radio", "checkbox"].includes(field.type) && (
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Options:
                                  </label>
                                  <div className="space-y-1 mb-2">
                                    {(field.options || []).map((opt, optIdx) => (
                                      <div key={optIdx} className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const updated = [...(field.options || [])];
                                            updated[optIdx] = e.target.value;
                                            updateField(field.id, { options: updated });
                                          }}
                                          className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveOption(field, optIdx)}
                                          className="text-slate-400 hover:text-rose-600 px-1 text-xs"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      placeholder="New option..."
                                      value={newOptionText}
                                      onChange={(e) => setNewOptionText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleAddOption(field);
                                      }}
                                      className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddOption(field)}
                                      className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700"
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>
                              )}

                              {field.type !== "heading" && (
                                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!field.required}
                                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300"
                                  />
                                  <span className="text-xs font-semibold text-slate-700">Required field</span>
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom Action Button in Phone */}
                <div className="p-3 bg-white border-t border-slate-200">
                  <div className="w-full bg-[#00b050] text-white font-bold py-2.5 px-4 rounded-xl text-center text-xs shadow-sm flex items-center justify-center gap-1">
                    {activeScreenIndex < screens.length - 1 ? "Next Screen →" : "Submit Form ✓"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Add Components (4 Cols) */}
          <div className="lg:col-span-4">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Add Components</h3>
            <div className="space-y-2.5">
              {[
                { type: "heading", label: "Heading / Text", desc: "Title and instructions block" },
                { type: "text", label: "Short Text Input", desc: "Name, email, single line text" },
                { type: "textarea", label: "Paragraph (TextArea)", desc: "Multi-line feedback or message" },
                { type: "dropdown", label: "Dropdown Menu", desc: "Select one option from a list" },
                { type: "radio", label: "Radio Buttons", desc: "Single-choice selection cards" },
                { type: "checkbox", label: "Checkboxes", desc: "Multi-select option tags" },
                { type: "date", label: "Date Picker", desc: "Pick calendar appointment date" },
              ].map((comp) => (
                <button
                  key={comp.type}
                  onClick={() => handleAddComponent(comp.type as FieldType)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-[#00b050] hover:bg-emerald-50/60 transition-all shadow-xs group"
                >
                  <div className="font-semibold text-slate-800 group-hover:text-emerald-800 text-sm flex items-center justify-between">
                    <span>+ {comp.label}</span>
                    <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Add
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{comp.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                How WhatsApp Forms Work
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                When a user in WhatsApp triggers a form flow, they receive an interactive card button. Clicking it opens this form directly on their mobile screen to submit their details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
