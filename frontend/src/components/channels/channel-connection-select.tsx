"use client";
import { useCallback, useEffect, useState } from "react";
import { listChannels, type ChannelConnection } from "@/lib/channels/browser";
export function useChannelConnections() {
    const [channels, setChannels] = useState<ChannelConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const reload = useCallback(() => { setLoading(true); setRevision(n => n + 1); }, []);
    useEffect(() => {
        let active = true;
        async function load() {
            try {
                const items: ChannelConnection[] = [];
                for (let page = 1;; page++) {
                    const result = await listChannels({ page, page_size: 100 });
                    if (!active)
                        return;
                    items.push(...result.items);
                    if (!result.items.length || items.length >= result.total)
                        break;
                }
                if (active) {
                    setChannels(items);
                    setError("");
                }
            }
            catch (cause) {
                if (active)
                    setError(cause instanceof Error ? cause.message : "Could not load channels.");
            }
            finally {
                if (active)
                    setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [revision]);
    return { channels, loading, error, reload };
}
/** Native popup matches the workspace Select/Listbox contract. No default choice. */
export function ChannelConnectionSelect({ id, value, onChange, catalog, disabled = false, invalid = false }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    catalog: ReturnType<typeof useChannelConnections>;
    disabled?: boolean;
    invalid?: boolean;
}) {
    return <div className="channel-scope-field">
    <label htmlFor={id}>Channel</label>
    <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled || catalog.loading || Boolean(catalog.error)} aria-invalid={invalid} aria-describedby={`${id}-help`}>
      <option value="">{catalog.loading ? "Loading channels..." : "Select a channel"}</option>
      {value && !catalog.channels.some(c => c.id === value) && <option value={value} disabled>Channel unavailable — select another</option>}
      {catalog.channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name} ({channel.channel_type.replaceAll("_", " ")})</option>)}
    </select>
    <p id={`${id}-help`}>{catalog.error || (invalid ? "Select a channel." : !catalog.loading && !catalog.channels.length ? "Create a channel in Channels first." : "")}</p>
    {catalog.error && <button type="button" className="channel-secondary-btn" onClick={catalog.reload}>Retry loading channels</button>}
  </div>;
}
