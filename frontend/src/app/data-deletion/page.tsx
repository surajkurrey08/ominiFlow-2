import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "User Data Deletion Instructions — Omniflow",
  description: "Instructions on how to request the deletion of your personal data and disconnect Facebook/Instagram integrations with Omniflow.",
};

export default function DataDeletionPage() {
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
            <Link href="/terms" className="text-slate-600 hover:text-slate-900 transition-colors">
              Terms of Service
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
            User Rights & Meta Platform Compliance
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            User Data Deletion Instructions
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base">
            Last updated: {lastUpdated} &bull; Guidelines for requesting account and data removal
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Our Commitment to Your Privacy</h2>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed">
            Omniflow respects user privacy and complies with Meta&rsquo;s Platform Terms regarding data protection and user rights. You have the right to request the permanent deletion of any personal data, connected Meta channels (Facebook Pages, WhatsApp Business Accounts, Instagram accounts), and messaging history stored on Omniflow servers.
          </p>
        </section>

        {/* Instructions */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
          <h2 className="text-xl font-bold text-slate-900">How to Delete Your Data</h2>
          
          <div className="space-y-3 border-b border-slate-100 pb-5">
            <h3 className="font-semibold text-slate-900 text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#176b59] text-white flex items-center justify-center text-xs">1</span>
              Disconnect Omniflow from your Facebook Account
            </h3>
            <p className="text-slate-600 text-sm pl-8">
              To immediately revoke Omniflow&rsquo;s access to your Facebook or Instagram profile and pages:
            </p>
            <ol className="list-decimal pl-13 space-y-2 text-slate-600 text-sm">
              <li>Log in to your Facebook profile.</li>
              <li>Go to <strong>Settings &amp; Privacy &gt; Settings</strong>.</li>
              <li>In the left sidebar, click on <strong>Apps and Websites</strong>.</li>
              <li>Locate <strong>Omniflow</strong> in the list of authorized apps.</li>
              <li>Click the <strong>Remove</strong> button.</li>
              <li>(Optional) Check the box to ask Facebook to notify Omniflow to delete your past activity.</li>
            </ol>
          </div>

          <div className="space-y-3 border-b border-slate-100 pb-5">
            <h3 className="font-semibold text-slate-900 text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#176b59] text-white flex items-center justify-center text-xs">2</span>
              Delete Channels directly from the Omniflow Dashboard
            </h3>
            <p className="text-slate-600 text-sm pl-8">
              If you have an active Omniflow account, you can remove connected channels at any time:
            </p>
            <ol className="list-decimal pl-13 space-y-2 text-slate-600 text-sm">
              <li>Sign in to your Omniflow account at <Link href="/login" className="text-[#176b59] underline">/login</Link>.</li>
              <li>Navigate to <strong>Channels</strong> from the main menu.</li>
              <li>Locate your connected WhatsApp, Facebook, or Instagram channel.</li>
              <li>Click <strong>Disconnect</strong> or <strong>Delete Channel</strong> to instantly revoke the channel tokens and halt message synchronization.</li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#176b59] text-white flex items-center justify-center text-xs">3</span>
              Request Complete Data Purge via Email
            </h3>
            <p className="text-slate-600 text-sm pl-8">
              To request a complete deletion of all user records, contact logs, credentials, and message data from our database:
            </p>
            <div className="pl-8">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-2">
                <p>Send an email to: <a href="mailto:privacy@omniflow.com" className="text-[#176b59] font-medium underline">privacy@omniflow.com</a> or <a href="mailto:support@omniflow.com" className="text-[#176b59] font-medium underline">support@omniflow.com</a></p>
                <p><strong>Subject:</strong> Data Deletion Request</p>
                <p><strong>Required Information:</strong></p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                  <li>Your registered Omniflow account email address.</li>
                  <li>Your connected Facebook Page ID or WhatsApp Business Phone number (if applicable).</li>
                </ul>
              </div>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm pl-8">
              We will confirm your request within 48 hours and permanently purge all associated data within 30 days. You will receive an official confirmation email once data deletion is complete.
            </p>
          </div>
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
