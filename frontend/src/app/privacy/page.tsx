import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Omniflow",
  description: "Learn how Omniflow collects, uses, protects, and handles your data, including WhatsApp, Facebook, and Instagram integrations.",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "October 27, 2026";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#176b59] to-[#258672] flex items-center justify-center text-white font-black text-sm shadow-sm">
              O
            </div>
            <span>Omniflow</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/terms" className="text-slate-600 hover:text-slate-900 transition-colors">
              Terms of Service
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

      {/* Hero Section */}
      <div className="bg-white border-b border-slate-200 py-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-[#176b59] border border-emerald-200 mb-4">
            Official Policy
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base">
            Last updated: {lastUpdated} &bull; Effective immediately for all Omniflow users and services
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Section 1 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">1.</span> Overview and Commitment
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            Omniflow (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) provides an omnichannel customer communication platform enabling businesses to manage, automate, and orchestrate customer conversations across channels, including WhatsApp Cloud API, Meta (Facebook and Instagram), and related services.
          </p>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            We value your trust and are committed to safeguarding your personal data in accordance with applicable data privacy regulations, including GDPR, CCPA, and Meta Platform Terms and Policies.
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">2.</span> Information We Collect
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            To deliver our omnichannel features, we collect and process the following categories of information:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm sm:text-[15px]">
            <li>
              <strong>Account Information:</strong> Name, work email address, company name, and authentication credentials when you register for Omniflow.
            </li>
            <li>
              <strong>Channel Integration Data:</strong> When you connect Facebook, Instagram, or WhatsApp through Meta OAuth, we receive authorized account identifiers, page names, WhatsApp Business Account (WABA) IDs, phone number IDs, and temporary authentication tokens.
            </li>
            <li>
              <strong>Communication Content & Metadata:</strong> Message text, media URLs, timestamps, sender/recipient phone numbers or user IDs, delivery receipts, and interaction statuses necessary to display chats in your Omniflow Inbox.
            </li>
            <li>
              <strong>Technical & Usage Data:</strong> IP addresses, browser user-agent, operating system, and system event logs for security auditing, fraud prevention, and session maintenance.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">3.</span> How We Use Your Information
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            We utilize collected data strictly for the following purposes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm sm:text-[15px]">
            <li>Facilitating bidirectional messaging between your business and customers via Meta APIs and WhatsApp.</li>
            <li>Executing automated conversation flows, keyword triggers, and message campaigns configured by you.</li>
            <li>Syncing and updating template statuses and message delivery confirmations.</li>
            <li>Securing platform access, detecting unauthorized activities, and managing tenant authorization.</li>
            <li>Providing technical support, service notifications, and billing administration.</li>
          </ul>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px] font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <strong>Important:</strong> We do NOT sell, rent, or trade your personal data or your customers&rsquo; conversation logs to any third-party advertisers or data brokers.
          </p>
        </section>

        {/* Section 4 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">4.</span> Meta Platform Policies & Third-Party Data Handling
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            Omniflow adheres strictly to the <strong>Meta Platform Terms</strong> and <strong>Developer Policies</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm sm:text-[15px]">
            <li>We request only the minimum required permissions necessary to provide messaging functionality (e.g., <code>whatsapp_business_management</code>, <code>whatsapp_business_messaging</code>, <code>pages_messaging</code>).</li>
            <li>Meta user data and page access tokens are stored in an encrypted vault and are never exposed to browser clients or unauthorized tenants.</li>
            <li>We do not transfer Meta user data to external data brokers or advertising networks.</li>
          </ul>
        </section>

        {/* Section 5 - Data Deletion Instructions (Required by Meta) */}
        <section id="data-deletion" className="bg-white p-7 sm:p-8 rounded-2xl border-2 border-emerald-600/30 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="text-[#176b59]">5.</span> User Data Deletion Instructions
            </h2>
            <span className="text-xs px-2.5 py-1 font-semibold rounded-md bg-emerald-100 text-emerald-800">
              Meta Compliant
            </span>
          </div>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            In compliance with Meta Platform Rules, users have the right to request deletion of their personal data and revoke Omniflow&rsquo;s access to their Facebook or Instagram accounts at any time:
          </p>
          
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Option A: Revoke Access via Facebook Settings</h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-600 text-sm">
              <li>Log in to your Facebook account and navigate to <strong>Settings &amp; Privacy &gt; Settings</strong>.</li>
              <li>Under <strong>Permissions</strong>, select <strong>Apps and Websites</strong>.</li>
              <li>Locate <strong>Omniflow</strong> in the list of connected applications.</li>
              <li>Click <strong>Remove</strong> to disconnect the app and revoke all granted permissions.</li>
              <li>You may also check the option to request that Facebook notify Omniflow to delete your app activity.</li>
            </ol>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-slate-800 text-sm">Option B: Request Direct Account & Data Deletion</h3>
            <p className="text-slate-600 text-sm">
              You can submit a direct data deletion request by emailing us at <a href="mailto:support@omniflow.com" className="text-[#176b59] font-medium underline">support@omniflow.com</a> or <a href="mailto:privacy@omniflow.com" className="text-[#176b59] font-medium underline">privacy@omniflow.com</a> with the subject line <em>&ldquo;Data Deletion Request&rdquo;</em>.
            </p>
            <p className="text-slate-600 text-sm">
              Upon receipt of your verified request, we will permanently purge all stored channel tokens, conversation history, and account credentials from our production databases within 30 days.
            </p>
          </div>
        </section>

        {/* Section 6 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">6.</span> Data Security & Retention
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            We implement industry-standard administrative, physical, and technical safeguards:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm sm:text-[15px]">
            <li>All passwords are encrypted with high-work-factor Argon2id hashing algorithms.</li>
            <li>All sensitive channel credentials and Meta API access tokens are encrypted using Fernet symmetric encryption before being written to disk.</li>
            <li>All communication between browsers, our servers, and third-party APIs is enforced over HTTPS/TLS 1.3 encryption.</li>
          </ul>
        </section>

        {/* Section 7 */}
        <section className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-[#176b59]">7.</span> Contact Us
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm sm:text-[15px]">
            If you have any questions, concerns, or inquiries regarding this Privacy Policy or our data handling practices, please contact our Data Protection team:
          </p>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-1">
            <p><strong>Omniflow Technologies</strong></p>
            <p>Email: <a href="mailto:privacy@omniflow.com" className="text-[#176b59] hover:underline font-medium">privacy@omniflow.com</a></p>
            <p>Support: <a href="mailto:support@omniflow.com" className="text-[#176b59] hover:underline font-medium">support@omniflow.com</a></p>
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
