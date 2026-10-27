import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Omniflow",
  description: "Terms and conditions governing the use of Omniflow's omnichannel communication platform.",
};

export default function TermsOfServicePage() {
  const lastUpdated = "October 27, 2026";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#176b59] to-[#258672] flex items-center justify-center text-white font-black text-sm shadow-sm">
              O
            </div>
            <span>Omniflow</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/privacy" className="text-slate-600 hover:text-slate-900 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/data-deletion" className="text-slate-600 hover:text-slate-900 transition-colors">
              Data Deletion
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-[#176b59] px-3.5 py-1.5 text-white hover:bg-[#125546] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-white border-b border-slate-200 py-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-[#176b59] border border-emerald-200 mb-4">
            Legal Terms
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base">
            Last updated: {lastUpdated} &bull; Please review these terms carefully
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            By accessing or using the Omniflow platform (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you are entering into this agreement on behalf of a company, organization, or other legal entity, you represent that you have the authority to bind such entity to these terms.
          </p>
        </section>

        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">2. Service Description</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            Omniflow is an omnichannel communication and workflow automation software designed for enterprise and small-to-medium businesses. It facilitates messaging through integrated channels, including WhatsApp Cloud API, Meta (Facebook and Instagram), email, and related services.
          </p>
        </section>

        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">3. Third-Party Platforms & Meta Compliance</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            Your use of WhatsApp, Facebook, or Instagram channels via Omniflow is subject to Meta&rsquo;s Commercial Terms, WhatsApp Business Terms of Service, and Developer Policies. You agree not to use Omniflow to transmit spam, unsolicited commercial broadcasts, hate speech, or content violating Meta&rsquo;s Community Standards.
          </p>
        </section>

        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">4. Account Responsibilities</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use or security breach.
          </p>
        </section>

        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">5. Termination</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these terms, engage in abusive practices, or jeopardize platform security. You may terminate your account at any time by contacting support.
          </p>
        </section>

        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">6. Contact Information</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            Questions regarding these Terms should be sent to: <a href="mailto:legal@omniflow.com" className="text-[#176b59] underline font-medium">legal@omniflow.com</a> or <a href="mailto:support@omniflow.com" className="text-[#176b59] underline font-medium">support@omniflow.com</a>.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Omniflow. All rights reserved.</p>
        <div className="mt-2 flex justify-center gap-4">
          <Link href="/privacy" className="hover:text-slate-700 underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-700 underline">Terms of Service</Link>
          <Link href="/data-deletion" className="hover:text-slate-700 underline">Data Deletion</Link>
        </div>
      </footer>
    </div>
  );
}
