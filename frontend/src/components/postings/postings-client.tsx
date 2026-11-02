"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SocialPost,
  SocialPostOverview,
  SocialChannel,
  fetchPostingsOverview,
  fetchSocialPosts,
  createSocialPost,
  deleteSocialPost,
  publishSocialPostNow,
  generateSocialCaption,
  fetchSocialChannels,
} from "@/lib/postings/browser";

const NavigationIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
);
const CalendarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const UsersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const FileTextIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
);
const SparklesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 3v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zm7 5v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zM4 15v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2zm16-4v1m0 4v1m0-1a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2z" /></svg>
);
const RefreshCwIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
);
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);

export function PostingsClient() {
  const [activeTab, setActiveTab] = useState("Overview");

  // Form State
  const [caption, setCaption] = useState("");
  const [captionInstruction, setCaptionInstruction] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<"post" | "reel" | "story">("post");
  const [mediaUrl, setMediaUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [publishTiming, setPublishTiming] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["facebook", "instagram"]);

  // Async data states
  const [overview, setOverview] = useState<SocialPostOverview | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters for Posts tab
  const [postFilter, setPostFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = ["Overview", "Posts", "Create post", "Social accounts", "Calendar"];

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewData, channelsData, postsData] = await Promise.all([
        fetchPostingsOverview().catch(() => null),
        fetchSocialChannels().catch(() => []),
        fetchSocialPosts(postFilter, searchQuery).catch(() => ({ items: [], total: 0, page: 1, size: 20 })),
      ]);

      if (overviewData) setOverview(overviewData);
      setChannels(channelsData);
      if (channelsData.length > 0 && !selectedChannelId) {
        setSelectedChannelId(channelsData[0].id);
      }
      setPosts(postsData.items);
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to load postings data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [postFilter, searchQuery]);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagsInput.trim()) {
      e.preventDefault();
      const newTag = tagsInput.trim().replace(/^#/, "");
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagsInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleGenerateAi = async (tone = "balanced") => {
    setGeneratingAi(true);
    try {
      const result = await generateSocialCaption(captionInstruction, tone);
      if (result) setCaption(result);
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Could not generate caption" });
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSavePost = async (action: "draft" | "publish" | "schedule") => {
    if (!caption.trim() && !mediaUrl) {
      setMessage({ type: "error", text: "Please provide a caption or visual media." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        caption,
        media_urls: mediaUrl ? [mediaUrl] : [],
        platforms: selectedPlatforms,
        format: selectedFormat,
        tags,
        channel_connection_id: selectedChannelId || null,
        scheduled_at: action === "schedule" && scheduledDate ? new Date(scheduledDate).toISOString() : null,
        publish_now: action === "publish",
      };

      await createSocialPost(payload);
      setMessage({
        type: "success",
        text: action === "publish" ? "Post published successfully!" : action === "schedule" ? "Post scheduled successfully!" : "Draft saved successfully!",
      });

      // Reset form
      setCaption("");
      setMediaUrl("");
      setTags([]);
      setScheduledDate("");
      setPublishTiming("now");
      
      await loadData();
      setActiveTab("Posts");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to save post." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteSocialPost(id);
      setPosts(posts.filter(p => p.id !== id));
      setMessage({ type: "success", text: "Post deleted successfully." });
      void loadData();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to delete post." });
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      await publishSocialPostNow(id);
      setMessage({ type: "success", text: "Post published successfully!" });
      void loadData();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to publish post." });
    }
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="bg-white min-h-screen text-slate-800 flex flex-col font-sans">
      <div className="p-8 mx-auto max-w-6xl w-full flex-1">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">Manage</div>
            <h1 className="text-[28px] font-bold text-slate-800 leading-tight mb-1">Postings</h1>
            <p className="text-[15px] text-slate-500">Plan, publish and measure your social media content.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              title="Refresh postings"
              aria-label="Refresh postings"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Refreshing…" : "Refresh"}</span>
            </button>
            <button 
              onClick={() => setActiveTab("Create post")}
              className="bg-[#00b050] hover:bg-[#009040] text-white px-5 py-2.5 rounded-md font-bold text-sm shadow-sm transition-colors"
            >
              + Create post
            </button>
          </div>
        </div>

        {/* Global Alert Notification */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex justify-between items-center ${
            message.type === "success" 
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs font-bold uppercase underline ml-4">Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200 mb-8 flex gap-8">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => { setActiveTab(tab); setMessage(null); }}
              className={`pb-3 text-[15px] font-bold border-b-2 transition-colors ${
                activeTab === tab 
                  ? "border-[#00b050] text-[#00b050]" 
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "Overview" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Connected account card */}
              <div className="bg-[#e0f2df] rounded-2xl p-6 border border-[#c8e6c9] flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">Connected Account</div>
                    <Link href="/channels" className="flex items-center gap-1 text-xs font-bold text-slate-700 bg-white/70 hover:bg-white px-2.5 py-1 rounded-md transition-colors">
                      <RefreshCwIcon className="w-3 h-3" /> Channels
                    </Link>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold mb-3 shadow-sm">
                      {channels[0]?.name ? channels[0].name.slice(0, 1).toUpperCase() : "O"}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-1">
                      {channels.length > 0 ? `${channels.length} Social Account${channels.length > 1 ? "s" : ""} Active` : "No Social Account"}
                    </h2>
                    <p className="text-xs text-slate-600 mb-4">
                      {channels.length > 0 
                        ? channels.map(c => c.name).join(", ") 
                        : "Connect Facebook or Instagram in Channels to publish."}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex w-full gap-3">
                    <Link href="/channels" className="flex-1 py-2 text-center bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-200 shadow-sm">
                      Manage Accounts
                    </Link>
                    <button 
                      onClick={() => setActiveTab("Create post")}
                      className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm"
                    >
                      Create Post
                    </button>
                  </div>
                  <div className="mt-4 flex justify-between items-center pt-3 border-t border-[#c8e6c9]/60 text-xs font-semibold text-slate-600">
                    <span>Platforms supported</span>
                    <span>FB & IG</span>
                  </div>
                </div>
              </div>

              {/* Publishing analytics */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">Publishing Analytics</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Performance overview for your posts</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-[#f1f8e9] rounded-xl p-3 flex flex-col">
                      <NavigationIcon className="w-4 h-4 text-emerald-700 mb-2" />
                      <div className="text-2xl font-black text-slate-900 mb-0.5">
                        {overview?.published_this_month ?? 0}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-600 font-medium">Published this month</div>
                    </div>
                    <div className="bg-[#fff3e0] rounded-xl p-3 flex flex-col">
                      <CalendarIcon className="w-4 h-4 text-amber-700 mb-2" />
                      <div className="text-2xl font-black text-slate-900 mb-0.5">
                        {overview?.scheduled_count ?? 0}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-600 font-medium">Scheduled</div>
                    </div>
                    <div className="bg-[#e0f2f1] rounded-xl p-3 flex flex-col">
                      <UsersIcon className="w-4 h-4 text-teal-700 mb-2" />
                      <div className="text-2xl font-black text-slate-900 mb-0.5">
                        {channels.length}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-600 font-medium">Connected Accounts</div>
                    </div>
                    <div className="bg-[#f5f5f5] rounded-xl p-3 flex flex-col">
                      <FileTextIcon className="w-4 h-4 text-slate-700 mb-2" />
                      <div className="text-2xl font-black text-slate-900 mb-0.5">
                        {overview?.draft_count ?? 0}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-600 font-medium">Draft Posts</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold text-slate-600">
                  <span>Total lifetime published:</span>
                  <span className="font-bold text-slate-900">{overview?.total_successful_posts ?? 0} posts</span>
                </div>
              </div>

              {/* Recent Posts preview */}
              <div className="bg-[#f5f7f5] rounded-2xl p-6 border border-slate-200 flex flex-col shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">Recent Posts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Latest scheduler activity</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab("Posts")} 
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    View all &gt;
                  </button>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {overview && overview.recent_posts.length > 0 ? (
                    <div className="space-y-3">
                      {overview.recent_posts.slice(0, 3).map(p => (
                        <div key={p.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              p.status === "published" ? "bg-emerald-100 text-emerald-800" :
                              p.status === "scheduled" ? "bg-amber-100 text-amber-800" :
                              p.status === "failed" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
                            }`}>
                              {p.status}
                            </span>
                            <span className="text-[11px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-700 line-clamp-2">{p.caption || "Visual content"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm font-semibold text-slate-500 mb-4">No published posts yet.</p>
                      <button 
                        onClick={() => setActiveTab("Create post")}
                        className="px-4 py-2 bg-white text-slate-800 font-bold text-xs rounded-lg border border-slate-200 shadow-sm"
                      >
                        Create your first post
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Create post */}
        {activeTab === "Create post" && (
          <div className="space-y-6">
            
            {/* Account Selector Bar */}
            <div className="bg-[#a8e6cf]/30 border border-[#a8e6cf] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#a8e6cf] text-emerald-800 font-bold flex items-center justify-center text-lg shadow-sm">
                  {selectedChannel?.name ? selectedChannel.name[0].toUpperCase() : "A"}
                </div>
                <div>
                  <div className="font-bold text-slate-900">
                    {selectedChannel ? selectedChannel.name : "Select Publishing Account"}
                  </div>
                  <div className="text-xs text-slate-600">
                    {channels.length > 0 ? "Select which connected account to publish to" : "No social accounts connected yet."}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {channels.length > 0 ? (
                  <select 
                    value={selectedChannelId} 
                    onChange={e => setSelectedChannelId(e.target.value)}
                    className="text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm"
                  >
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.channel_type})</option>
                    ))}
                  </select>
                ) : (
                  <Link href="/channels" className="text-xs font-bold bg-[#0f766e] text-white px-3.5 py-2 rounded-lg hover:bg-[#0d645d]">
                    + Connect Account in Channels
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Left Column (Create Post Form) */}
              <div className="flex-1 space-y-6">
                
                {/* Text Editor Box */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Create Content</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Compose text, attach media, and schedule publishing.</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                    <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-700">Caption & Message</span>
                      <span className="text-xs font-semibold text-slate-400">{caption.length}/2,200</span>
                    </div>
                    <textarea 
                      className="w-full min-h-[140px] p-4 text-[15px] resize-none outline-none text-slate-800 placeholder:text-slate-400"
                      placeholder="What would you like to share with your audience?"
                      value={caption}
                      onChange={e => setCaption(e.target.value)}
                    />
                  </div>

                  {/* AI Section */}
                  <div className="mt-5 border border-purple-200 rounded-xl p-4 bg-purple-50/40">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 mb-2">
                      <SparklesIcon className="w-4 h-4 text-purple-600" />
                      <span>AI Caption Assistant</span>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input 
                        type="text" 
                        placeholder="Optional instruction: e.g. Diwali festive offer with 20% discount" 
                        className="flex-1 px-3.5 py-2 bg-white border border-purple-200 rounded-lg text-xs outline-none focus:border-purple-400"
                        value={captionInstruction}
                        onChange={e => setCaptionInstruction(e.target.value)}
                      />
                      <button 
                        onClick={() => handleGenerateAi("balanced")}
                        disabled={generatingAi}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                      >
                        {generatingAi ? "Generating…" : "Generate"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["Concise", "Warm", "Add CTA", "Hashtags"].map(pill => (
                        <button 
                          key={pill} 
                          onClick={() => handleGenerateAi(pill.toLowerCase())}
                          className="px-2.5 py-1 bg-white border border-purple-200 text-purple-700 text-[11px] font-bold rounded-full hover:bg-purple-100 transition-colors"
                        >
                          {pill}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Format & Tags */}
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-2">Post Format</div>
                      <div className="flex bg-slate-100 rounded-lg p-1">
                        {(["post", "reel", "story"] as const).map(f => (
                          <button 
                            key={f}
                            type="button"
                            onClick={() => setSelectedFormat(f)}
                            className={`flex-1 py-1.5 rounded-md text-xs font-bold capitalize transition-all ${
                              selectedFormat === f ? "bg-white shadow-xs text-emerald-800" : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-2">Tags / Topics</div>
                      <input 
                        type="text" 
                        placeholder="Type tag and press Enter" 
                        value={tagsInput}
                        onChange={e => setTagsInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-emerald-500"
                      />
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {tags.map(t => (
                            <span key={t} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium">
                              #{t}
                              <button type="button" onClick={() => handleRemoveTag(t)} className="text-slate-400 hover:text-slate-700">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visual Content URL */}
                  <div className="mt-5 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Visual Media Image / Video URL (Optional)</label>
                    <input 
                      type="url" 
                      placeholder="https://example.com/image.jpg"
                      value={mediaUrl}
                      onChange={e => setMediaUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Paste a public image/video URL to attach with the post.</p>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Ready to schedule
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button 
                        type="button"
                        onClick={() => handleSavePost("draft")}
                        disabled={submitting}
                        className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs text-slate-700 shadow-sm"
                      >
                        Save Draft
                      </button>

                      {publishTiming === "schedule" ? (
                        <button 
                          type="button"
                          onClick={() => handleSavePost("schedule")}
                          disabled={submitting || !scheduledDate}
                          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CalendarIcon className="w-3.5 h-3.5" /> Schedule
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => handleSavePost("publish")}
                          disabled={submitting}
                          className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-sm disabled:opacity-50"
                        >
                          Publish Now
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* Right Column (Publish Timing & Phone Preview) */}
              <div className="w-full lg:w-[360px] space-y-6">
                
                {/* Publish Timing Selector */}
                <div className="bg-[#f0f9f5] border border-[#a8e6cf] rounded-2xl p-5 shadow-xs">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                      <div className="w-2 h-2 rounded-full bg-[#00b050]" />
                      Publish Timing
                    </div>
                  </div>
                  
                  <div className="flex bg-[#d1f2e6] rounded-lg p-1 mb-3">
                    <button 
                      type="button"
                      onClick={() => setPublishTiming("now")}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                        publishTiming === "now" ? "bg-[#0f766e] text-white shadow-xs" : "text-[#0f766e]"
                      }`}
                    >
                      Now
                    </button>
                    <button 
                      type="button"
                      onClick={() => setPublishTiming("schedule")}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                        publishTiming === "schedule" ? "bg-[#0f766e] text-white shadow-xs" : "text-[#0f766e]"
                      }`}
                    >
                      Schedule
                    </button>
                  </div>

                  {publishTiming === "schedule" && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-700">Select Date & Time</label>
                      <input 
                        type="datetime-local" 
                        value={scheduledDate}
                        onChange={e => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Mobile Preview */}
                <div className="border-[6px] border-slate-900 rounded-[2rem] overflow-hidden bg-white shadow-xl flex flex-col">
                  <div className="bg-[#0f2e27] text-white px-4 py-2 flex justify-between items-center text-[11px] font-bold">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live Preview
                    </div>
                    <span className="text-[10px] text-emerald-200 capitalize">{selectedFormat}</span>
                  </div>
                  
                  <div className="p-4 flex flex-col space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                        {selectedChannel?.name ? selectedChannel.name[0].toUpperCase() : "O"}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900">
                          {selectedChannel?.name || "Omniflow Brand"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {publishTiming === "schedule" && scheduledDate ? `Scheduled: ${new Date(scheduledDate).toLocaleString()}` : "Just now"}
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[60px]">
                      {caption || "Your post caption will appear here in real-time as you type..."}
                    </p>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-[11px] text-sky-600 font-semibold">
                        {tags.map(t => <span key={t}>#{t}</span>)}
                      </div>
                    )}

                    {mediaUrl ? (
                      <div className="rounded-xl overflow-hidden border border-slate-100 max-h-[160px] bg-slate-100">
                        <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400 font-medium">
                        No image attached
                      </div>
                    )}
                  </div>
                </div>

                {/* Always-visible Quick Actions Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Quick Actions</span>
                    <span className="text-[11px] text-slate-400 font-semibold">{caption.length} / 2,200</span>
                  </div>

                  {publishTiming === "schedule" ? (
                    <button
                      type="button"
                      onClick={() => handleSavePost("schedule")}
                      disabled={submitting || !scheduledDate}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {submitting ? "Scheduling..." : "Schedule Post"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSavePost("publish")}
                      disabled={submitting}
                      className="w-full py-2.5 bg-[#00b050] hover:bg-[#009040] text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      <NavigationIcon className="w-3.5 h-3.5" />
                      {submitting ? "Publishing..." : "Publish Post Now"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSavePost("draft")}
                    disabled={submitting}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
                  >
                    Save as Draft
                  </button>
                </div>

              </div>
            </div>


          </div>
        )}

        {/* Tab 3: Posts List */}
        {activeTab === "Posts" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex gap-2">
                {(["all", "published", "scheduled", "draft", "failed"] as const).map(st => (
                  <button 
                    key={st}
                    onClick={() => setPostFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                      postFilter === st 
                        ? "bg-slate-900 text-white" 
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <input 
                type="text" 
                placeholder="Search posts..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="px-3.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none w-full md:w-64"
              />
            </div>

            {loading ? (
              <div className="py-16 text-center text-slate-500 font-medium">Loading posts…</div>
            ) : posts.length === 0 ? (
              <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-xs">
                <FileTextIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">No posts found</h3>
                <p className="text-xs text-slate-500 mb-4">Create your first social media post or adjust the filter.</p>
                <button 
                  onClick={() => setActiveTab("Create post")}
                  className="px-4 py-2 bg-[#00b050] text-white rounded-lg text-xs font-bold"
                >
                  + Create Post
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                          post.status === "published" ? "bg-emerald-100 text-emerald-800" :
                          post.status === "scheduled" ? "bg-amber-100 text-amber-800" :
                          post.status === "failed" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {post.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {post.channel_name ? `via ${post.channel_name}` : "Social Account"} · {new Date(post.created_at).toLocaleDateString()}
                        </span>
                        {post.scheduled_at && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Scheduled for {new Date(post.scheduled_at).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                        {post.caption || "(No caption text)"}
                      </p>

                      {post.tags && post.tags.length > 0 && (
                        <div className="flex gap-1.5 text-[11px] text-sky-600 font-medium">
                          {post.tags.map(t => <span key={t}>#{t}</span>)}
                        </div>
                      )}

                      {post.error_message && (
                        <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                          Error: {post.error_message}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      {["draft", "scheduled", "failed"].includes(post.status) && (
                        <button 
                          onClick={() => handlePublishNow(post.id)}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold"
                        >
                          Publish Now
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(post.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Post"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Social accounts */}
        {activeTab === "Social accounts" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Connected Social Accounts</h2>
                <p className="text-xs text-slate-500">Facebook Pages and Instagram Professional accounts available for posting.</p>
              </div>
              <Link href="/channels" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg">
                + Add or Reconnect Channels
              </Link>
            </div>

            {channels.length === 0 ? (
              <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl p-8">
                <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">No Social Channels Connected</h3>
                <p className="text-xs text-slate-500 mb-4">Connect a Facebook Page or Instagram Business account under Channels to publish social posts.</p>
                <Link href="/channels" className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-xs font-bold">
                  Go to Channels
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {channels.map(c => (
                  <div key={c.id} className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500 capitalize">{c.channel_type} · Status: {c.status}</div>
                      </div>
                    </div>
                    <Link href="/channels" className="text-xs font-bold text-emerald-700 hover:underline">
                      Manage
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Calendar */}
        {activeTab === "Calendar" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Publishing Calendar</h2>
                <p className="text-xs text-slate-500">Scheduled and planned social posts timeline.</p>
              </div>
              <button onClick={() => setActiveTab("Create post")} className="px-3.5 py-1.5 bg-[#00b050] text-white text-xs font-bold rounded-lg">
                + Schedule Post
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              {posts.filter(p => p.scheduled_at).length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No posts scheduled yet. When you schedule a post, it will appear here on your calendar.
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.filter(p => p.scheduled_at).map(p => (
                    <div key={p.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-bold text-xs text-slate-900">
                          {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : ""}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">{p.caption}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        p.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
