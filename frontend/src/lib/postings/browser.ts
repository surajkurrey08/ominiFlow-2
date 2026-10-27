export type SocialPost = {
  id: string;
  tenant_id: string;
  channel_connection_id?: string | null;
  channel_name?: string | null;
  caption: string;
  media_urls: string[];
  platforms: string[];
  format: "post" | "reel" | "story";
  tags: string[];
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at?: string | null;
  published_at?: string | null;
  external_post_id?: string | null;
  error_message?: string | null;
  analytics?: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type SocialPostOverview = {
  published_this_month: number;
  scheduled_count: number;
  connected_accounts_count: number;
  draft_count: number;
  total_successful_posts: number;
  recent_posts: SocialPost[];
};

export type SocialPostList = {
  items: SocialPost[];
  total: number;
  page: number;
  size: number;
};

export type SocialChannel = {
  id: string;
  name: string;
  channel_type: string;
  status: string;
  external_account_id?: string | null;
};

export async function fetchPostingsOverview(): Promise<SocialPostOverview> {
  const res = await fetch("/api/social-posts/overview", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load postings overview.");
  return data;
}

export async function fetchSocialPosts(
  status?: string,
  search?: string,
  page = 1,
  size = 20,
): Promise<SocialPostList> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  params.set("page", String(page));
  params.set("size", String(size));

  const res = await fetch(`/api/social-posts?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load social posts.");
  return data;
}

export async function createSocialPost(payload: {
  caption: string;
  media_urls?: string[];
  platforms?: string[];
  format?: string;
  tags?: string[];
  channel_connection_id?: string | null;
  scheduled_at?: string | null;
  publish_now?: boolean;
}): Promise<SocialPost> {
  const res = await fetch("/api/social-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create social post.");
  return data;
}

export async function deleteSocialPost(id: string): Promise<void> {
  const res = await fetch(`/api/social-posts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete post.");
  }
}

export async function publishSocialPostNow(id: string): Promise<SocialPost> {
  const res = await fetch(`/api/social-posts/${id}/publish`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to publish post.");
  return data;
}

export async function generateSocialCaption(instruction?: string, tone = "balanced"): Promise<string> {
  const res = await fetch("/api/social-posts/generate-caption", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ instruction, tone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to generate caption.");
  return data.caption || "";
}

export async function fetchSocialChannels(): Promise<SocialChannel[]> {
  const res = await fetch("/api/channels", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => []);
  const channels = Array.isArray(data) ? data : data.items || [];
  return channels.filter(
    (c: any) => ["facebook", "instagram", "whatsapp"].includes(c.channel_type?.toLowerCase()),
  );
}

