"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface FormField {
  id: string;
  type: "heading" | "text" | "textarea" | "dropdown" | "radio" | "checkbox" | "date" | "file";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  description?: string;
  fileType?: "all" | "image" | "video" | "document";
  allowUrl?: boolean;
}

interface FormScreen {
  id: string;
  title: string;
  fields: FormField[];
}

interface PublicForm {
  id: string;
  name: string;
  category: string | null;
  status: string;
  config: {
    screens?: FormScreen[];
  } | null;
}

export default function PublicFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = (params?.id as string) || "";
  const contactPhone = searchParams.get("contact") || "";
  const contactName = searchParams.get("name") || "";

  const [form, setForm] = useState<PublicForm | null>(null);
  const [currentScreenIdx, setCurrentScreenIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!formId) return;
    setLoading(true);
    fetch(`/api/whatsapp-forms/public/${formId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || body?.error || "This form is unavailable or has not been published.");
        }
        return res.json();
      })
      .then((data: PublicForm) => {
        setForm(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load form.");
      })
      .finally(() => setLoading(false));
  }, [formId]);

  const screens = form?.config?.screens || [];
  const currentScreen = screens[currentScreenIdx];

  function handleInputChange(fieldId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    if (validationError) setValidationError("");
  }

  function handleCheckboxToggle(fieldId: string, option: string) {
    const prevList = (answers[fieldId] as string[]) || [];
    let nextList: string[];
    if (prevList.includes(option)) {
      nextList = prevList.filter((item) => item !== option);
    } else {
      nextList = [...prevList, option];
    }
    setAnswers((prev) => ({ ...prev, [fieldId]: nextList }));
    if (validationError) setValidationError("");
  }

  function validateCurrentScreen(): boolean {
    if (!currentScreen) return true;
    for (const field of currentScreen.fields) {
      if (field.required && field.type !== "heading") {
        const val = answers[field.id];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          setValidationError(`Please fill out: "${field.label}"`);
          return false;
        }
        if (field.type === "file") {
          const fileVal = typeof val === "object" ? val?.url : val;
          if (!fileVal || !String(fileVal).trim()) {
            setValidationError(`Please upload a file or enter a link for: "${field.label}"`);
            return false;
          }
        }
      }
    }
    setValidationError("");
    return true;
  }

  function handleNext() {
    if (!validateCurrentScreen()) return;
    if (currentScreenIdx < screens.length - 1) {
      setCurrentScreenIdx((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handlePrev() {
    if (currentScreenIdx > 0) {
      setCurrentScreenIdx((i) => i - 1);
      setValidationError("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateCurrentScreen()) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/whatsapp-forms/public/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_phone: contactPhone || undefined,
          contact_name: contactName || undefined,
          data: answers,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || payload?.error || "Could not submit form.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full">
          <div className="w-10 h-10 border-4 border-[#00b050] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-700">Loading WhatsApp Form...</p>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            !
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Form Not Available</h2>
          <p className="text-sm text-slate-500 mb-6">{error || "This form could not be loaded."}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-md text-center max-w-md w-full border border-slate-200">
          <div className="w-16 h-16 bg-[#e8f5e9] text-[#00b050] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Response Submitted!</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Thank you for completing <span className="font-semibold text-slate-800">{form.name}</span>. Your details have been received successfully.
          </p>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500">
            You may now safely close this window and return to WhatsApp.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-start py-6 px-3">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* WhatsApp Brand Header */}
        <div className="bg-[#00b050] text-white px-6 py-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-700/60 px-2 py-0.5 rounded-full inline-block mb-1">
              {form.category || "WhatsApp Form"}
            </span>
            <h1 className="text-lg font-bold leading-tight truncate max-w-xs">{form.name}</h1>
          </div>
          {screens.length > 1 && (
            <div className="text-xs bg-emerald-700/60 font-semibold px-2.5 py-1 rounded-full">
              Screen {currentScreenIdx + 1} of {screens.length}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {screens.length > 1 && (
          <div className="w-full bg-slate-100 h-1.5">
            <div
              className="bg-[#00b050] h-1.5 transition-all duration-300"
              style={{ width: `${((currentScreenIdx + 1) / screens.length) * 100}%` }}
            />
          </div>
        )}

        {/* Screen Title */}
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-base font-bold text-slate-800">
            {currentScreen?.title || "Form Screen"}
          </h2>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {validationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
              {validationError}
            </div>
          )}

          {(!currentScreen?.fields || currentScreen.fields.length === 0) ? (
            <div className="text-center py-10 text-sm text-slate-400">
              No fields configured for this screen.
            </div>
          ) : (
            currentScreen.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                {field.type === "heading" ? (
                  <div className="pt-2 pb-1 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-base">{field.label}</h3>
                    {field.description && (
                      <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-slate-700">
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-1 font-bold">*</span>}
                    </label>

                    {field.type === "text" && (
                      <input
                        type="text"
                        placeholder={field.placeholder || "Enter your answer"}
                        value={answers[field.id] || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#00b050] focus:bg-white transition-all"
                      />
                    )}

                    {field.type === "textarea" && (
                      <textarea
                        rows={3}
                        placeholder={field.placeholder || "Type here..."}
                        value={answers[field.id] || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#00b050] focus:bg-white transition-all resize-y"
                      />
                    )}

                    {field.type === "dropdown" && (
                      <select
                        value={answers[field.id] || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#00b050] focus:bg-white transition-all"
                      >
                        <option value="">Select an option...</option>
                        {(field.options || []).map((opt, i) => (
                          <option key={i} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === "radio" && (
                      <div className="space-y-2 pt-1">
                        {(field.options || []).map((opt, i) => (
                          <label
                            key={i}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                              answers[field.id] === opt
                                ? "bg-emerald-50/70 border-[#00b050] font-semibold text-emerald-900"
                                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="radio"
                              name={field.id}
                              value={opt}
                              checked={answers[field.id] === opt}
                              onChange={() => handleInputChange(field.id, opt)}
                              className="w-4 h-4 text-[#00b050] focus:ring-[#00b050]"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {field.type === "checkbox" && (
                      <div className="space-y-2 pt-1">
                        {(field.options || []).map((opt, i) => {
                          const checked = Array.isArray(answers[field.id]) && answers[field.id].includes(opt);
                          return (
                            <label
                              key={i}
                              className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer transition-all ${
                                checked
                                  ? "bg-emerald-50/70 border-[#00b050] font-semibold text-emerald-900"
                                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleCheckboxToggle(field.id, opt)}
                                className="w-4 h-4 text-[#00b050] rounded focus:ring-[#00b050]"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {field.type === "date" && (
                      <input
                        type="date"
                        value={answers[field.id] || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#00b050] focus:bg-white transition-all"
                      />
                    )}

                    {field.type === "file" && (
                      <FileUploadField
                        field={field}
                        formId={formId}
                        value={answers[field.id]}
                        onChange={(val) => handleInputChange(field.id, val)}
                      />
                    )}
                  </>
                )}
              </div>
            ))
          )}

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
            {currentScreenIdx > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ← Back
              </button>
            ) : <div />}

            {currentScreenIdx < screens.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 bg-[#00b050] hover:bg-[#009040] text-white font-semibold text-sm rounded-xl shadow-sm transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-[#00b050] hover:bg-[#009040] text-white font-semibold text-sm rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Form ✓"}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-slate-400">
        Powered by Omniflow WhatsApp Forms
      </div>
    </div>
  );
}

function FileUploadField({
  field,
  formId,
  value,
  onChange,
}: {
  field: FormField;
  formId: string;
  value: any;
  onChange: (val: any) => void;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>(value?.url || "");
  const [fileMeta, setFileMeta] = useState<{ name: string; size?: number; type?: string } | null>(
    value ? { name: value.filename || value.name || value.url, size: value.size, type: value.content_type || value.type } : null
  );

  const accept =
    field.fileType === "image"
      ? "image/*"
      : field.fileType === "video"
      ? "video/*"
      : field.fileType === "document"
      ? ".pdf,.doc,.docx,.txt"
      : "image/*,video/*,.pdf,.doc,.docx,.txt";

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setUploadError("File is too large. Maximum size is 25 MB.");
      return;
    }

    setUploadError("");
    setUploading(true);

    if (file.type.startsWith("image/")) {
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);
    }
    setFileMeta({ name: file.name, size: file.size, type: file.type });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/whatsapp-forms/public/${formId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewUrl(data.url);
        onChange({
          url: data.url,
          filename: data.filename || file.name,
          size: data.size || file.size,
          content_type: data.content_type || file.type,
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          onChange({
            url: dataUrl,
            filename: file.name,
            size: file.size,
            content_type: file.type,
          });
        };
        reader.readAsDataURL(file);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onChange({
          url: dataUrl,
          filename: file.name,
          size: file.size,
          content_type: file.type,
        });
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  }

  function handleUrlChange(url: string) {
    setPreviewUrl(url);
    if (!url.trim()) {
      onChange(null);
      setFileMeta(null);
    } else {
      onChange({ url: url.trim(), filename: "Media URL", type: "url" });
      setFileMeta({ name: url.trim(), type: "url" });
    }
  }

  function handleRemove() {
    onChange(null);
    setPreviewUrl("");
    setFileMeta(null);
    setUploadError("");
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      {field.description && (
        <p className="text-xs text-slate-500">{field.description}</p>
      )}

      {field.allowUrl !== false && (
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-fit text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`px-3 py-1 rounded-md transition-all ${
              mode === "file" ? "bg-white text-emerald-800 shadow-xs font-bold" : "hover:text-slate-900"
            }`}
          >
            📁 Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`px-3 py-1 rounded-md transition-all ${
              mode === "url" ? "bg-white text-emerald-800 shadow-xs font-bold" : "hover:text-slate-900"
            }`}
          >
            🔗 Paste URL
          </button>
        </div>
      )}

      {mode === "file" ? (
        <div>
          {value?.url || fileMeta ? (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {fileMeta?.type?.startsWith("image/") && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Upload preview"
                    className="w-12 h-12 object-cover rounded-lg border border-emerald-300 shadow-2xs"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shrink-0">
                    {fileMeta?.type?.startsWith("video/") ? "🎥" : "📄"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">
                    {fileMeta?.name || "Uploaded File"}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    {uploading ? "Uploading file..." : `Ready ✓ ${formatSize(fileMeta?.size)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors text-sm"
                title="Remove file"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="border-2 border-dashed border-emerald-300 hover:border-[#00b050] bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all text-center group">
              <input
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#00b050] group-hover:bg-[#00b050] group-hover:text-white flex items-center justify-center text-lg mb-2 transition-colors">
                ⬆
              </div>
              <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-900">
                Tap to choose Photo, Video or File
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {field.fileType === "image"
                  ? "PNG, JPG, WebP (Max 25MB)"
                  : field.fileType === "video"
                  ? "MP4, MOV (Max 25MB)"
                  : field.fileType === "document"
                  ? "PDF, DOCX, TXT (Max 25MB)"
                  : "Images, Videos, PDFs or Docs up to 25MB"}
              </p>
              {uploading && (
                <div className="mt-3 text-xs font-semibold text-[#00b050] flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-[#00b050] border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </div>
              )}
            </label>
          )}
          {uploadError && (
            <p className="text-xs text-rose-600 font-medium mt-1">{uploadError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            type="url"
            placeholder={field.placeholder || "Paste Google Drive, Image, or Video link..."}
            value={value?.url || ""}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#00b050] focus:bg-white transition-all font-mono text-xs"
          />
          {value?.url && (
            <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              ✓ Link saved
            </p>
          )}
        </div>
      )}
    </div>
  );
}
