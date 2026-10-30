"use client";

import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "../../../lib/api/admin-client";
import { AdminPasswordResetItem } from "../../../lib/types/admin";
import { KeyRound, RefreshCw, CheckCircle2, Copy, Check, ExternalLink, Clock, Building2, Mail, ShieldAlert } from "lucide-react";

export default function PasswordResetsPage() {
  const [requests, setRequests] = useState<AdminPasswordResetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Approval result modal state
  const [approvalResult, setApprovalResult] = useState<{
    email: string;
    reset_url: string;
    email_sent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getPasswordResets();
      setRequests(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load password reset requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (item: AdminPasswordResetItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await adminApi.approvePasswordReset(item.id);
      setApprovalResult({
        email: res.email,
        reset_url: res.reset_url,
        email_sent: res.email_sent,
      });
      await fetchRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not approve password reset request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Password Reset Requests</h1>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Review and approve tenant account recovery requests submitted from the login screen.
          </p>
        </div>

        <button
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1527] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Approval Success Modal / Card */}
      {approvalResult && (
        <div className="p-5 rounded-2xl bg-[#0d1b2a] border border-emerald-500/40 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold text-sm">Password Reset Approved!</span>
            </div>
            <button
              onClick={() => setApprovalResult(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
            >
              ✕ Close
            </button>
          </div>

          <p className="text-xs text-slate-300">
            A secure one-time password reset link was generated for <strong>{approvalResult.email}</strong>.
            {approvalResult.email_sent ? (
              <span className="text-emerald-300 block mt-0.5">✓ Reset instructions have been sent via email.</span>
            ) : (
              <span className="text-amber-300 block mt-0.5">
                ℹ SMTP email delivery is not configured on this server, but you can copy and provide the direct reset link below:
              </span>
            )}
          </p>

          <div className="flex items-center gap-2 bg-[#070c18] p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-sky-300 overflow-x-auto">
            <span className="truncate flex-1 select-all">{approvalResult.reset_url}</span>
            <button
              onClick={() => handleCopyLink(approvalResult.reset_url)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy Link
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mb-3" />
            <p>Loading password reset requests…</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No reset requests found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              When a user submits "Forgot Password" on the login screen, their recovery request will appear here for administrator review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-semibold">
                  <th className="py-3 px-4">User & Email</th>
                  <th className="py-3 px-4">Tenant Workspace</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Requested At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {requests.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/25 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-sky-400 shrink-0">
                          {item.user_name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <span className="font-semibold text-white block">
                            {item.user_name}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono mt-0.5">
                            <Mail className="w-3 h-3 text-slate-500" />
                            {item.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.tenants && item.tenants.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {item.tenants.map((tName, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-[11px] bg-slate-800/90 text-sky-300 px-2 py-0.5 rounded border border-slate-700"
                            >
                              <Building2 className="w-2.5 h-2.5 text-sky-400" />
                              {tName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">No workspace</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {item.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Clock className="w-2.5 h-2.5" />
                          Pending Review
                        </span>
                      ) : item.status === "approved" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <Check className="w-2.5 h-2.5" />
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          {item.status}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {item.requested_at ? (
                        <>
                          <div>{new Date(item.requested_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</div>
                          <div className="text-[10px] text-slate-500">{new Date(item.requested_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {item.status === "pending" ? (
                        <button
                          onClick={() => handleApprove(item)}
                          disabled={busyId === item.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          {busyId === item.id ? "Approving…" : "Approve & Send Link"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
