"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function CallRedirectContent() {
  const searchParams = useSearchParams();
  const rawPhone = searchParams.get("phone") || "";
  const [dialed, setDialed] = useState(false);

  // Normalize phone number to international / dialable format
  const cleanPhone = (() => {
    const raw = rawPhone.trim();
    if (!raw) return "";
    const digits = raw.replace(/[^\d+]/g, "");
    if (!digits.startsWith("+")) {
      if (digits.length === 10 && !digits.startsWith("91")) {
        return `+91${digits}`;
      }
      return `+${digits}`;
    }
    return digits;
  })();

  const telUri = cleanPhone ? `tel:${cleanPhone}` : "";

  useEffect(() => {
    if (telUri) {
      setDialed(true);
      // Immediately trigger phone dialer
      const timer = setTimeout(() => {
        window.location.href = telUri;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [telUri]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xl text-center space-y-6">
        {/* Animated Phone Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm animate-pulse">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Opening Phone Dialer...
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Connecting you directly with support & sales
          </p>
        </div>

        {cleanPhone ? (
          <div className="space-y-4">
            <div className="bg-slate-50 py-3 px-4 rounded-xl border border-slate-200 font-mono text-lg font-bold text-slate-900 tracking-wider">
              {cleanPhone}
            </div>

            <a
              href={telUri}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>Tap to Call {cleanPhone}</span>
            </a>
            <p className="text-xs text-slate-400">
              If your phone dialer didn&apos;t open automatically, tap the green button above.
            </p>
          </div>
        ) : (
          <div className="text-sm text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200">
            No valid phone number was provided in this link.
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex justify-center">
          <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">
            &larr; Return to Omniflow
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CallRedirectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">Loading dialer...</div>}>
      <CallRedirectContent />
    </Suspense>
  );
}
