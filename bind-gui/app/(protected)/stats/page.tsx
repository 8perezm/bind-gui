"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
    StatsBundle,
    ZoneStatsEntry,
    CounterMap,
} from "@/lib/stats";

// ── Page ───────────────────────────────────────────────────────────

export default function StatsPage() {
    const [bundle, setBundle] = useState<StatsBundle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/stats");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || `HTTP ${res.status}`);
                setLoading(false);
                return;
            }
            const data: StatsBundle = await res.json();
            setBundle(data);
            setLoading(false);
        } catch {
            setError("Failed to fetch server statistics");
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    // ── Loading state ──────────────────────────────────────────────
    if (loading && !bundle) {
        return (
            <div className="py-32 flex items-center justify-center gap-3 font-mono text-sm tracking-widest uppercase text-mutedForeground">
                <Loader2 size={16} className="animate-spin" />
                Loading statistics&hellip;
            </div>
        );
    }

    // ── Error state (no data at all) ───────────────────────────────
    if (error && !bundle) {
        return (
            <div className="space-y-8 py-16">
                <h1 className="font-heading text-5xl md:text-7xl tracking-tighter leading-none">
                    Not Found
                </h1>
                <p className="text-mutedForeground max-w-lg">{error}</p>
                <Button variant="outline" onClick={fetchStats}>
                    <RefreshCw size={16} className="mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    const status = bundle?.rndcStatus;
    const stats = bundle?.stats;

    return (
        <div className="space-y-12">
            {/* ── Header ──────────────────────────────────────────── */}
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none mb-2">
                        Statistics
                    </h1>
                    {status?.bootTime && (
                        <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest">
                            Boot: {status.bootTime}
                        </p>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
                    <RefreshCw
                        size={14}
                        className={`mr-2 ${loading ? "animate-spin" : ""}`}
                    />
                    {loading ? "Refreshing&hellip;" : "Refresh"}
                </Button>
            </section>

            {/* Error banner (data loaded but error on refresh) */}
            {error && (
                <p className="text-red-600 font-mono text-sm uppercase tracking-wider border-l-2 border-red-600 pl-3">
                    {error}
                </p>
            )}

            {/* ── Per-Zone Statistics ─────────────────────────────── */}
            {stats?.zones && stats.zones.length > 0 && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Per-Zone Statistics
                    </h2>
                    <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mb-4">
                        Click column headers to sort. Requires <code className="bg-muted px-1">zone-statistics full;</code> in named.conf.options.
                    </p>
                    <ZoneStatsTable zones={stats.zones} />
                </section>
            )}

            {/* ── Server Status ────────────────────────────────────── */}
            {status && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Server Status
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailBox label="Version" value={status.version} />
                        <DetailBox
                            label="Boot Time"
                            value={status.bootTime ?? "—"}
                        />
                        <DetailBox
                            label="Zones"
                            value={status.numberOfZones ?? "—"}
                        />
                        <DetailBox
                            label="Debug Level"
                            value={status.debugLevel?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="Recursive Clients"
                            value={status.recursiveClients ?? "—"}
                        />
                        <DetailBox
                            label="TCP Clients"
                            value={status.tcpClients ?? "—"}
                        />
                        <DetailBox
                            label="Last Configured"
                            value={status.lastConfigured ?? "—"}
                        />
                        <DetailBox
                            label="Xfers Running"
                            value={status.xfersRunning?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="Xfers Deferred"
                            value={status.xfersDeferred?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="TCP High-Water"
                            value={status.tcpHighWater?.toString() ?? "—"}
                        />
                    </div>
                </section>
            )}

            {/* ── Server Counters ──────────────────────────────────── */}
            {stats && Object.keys(stats.serverCounters).length > 0 && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Server Counters
                    </h2>
                    <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mb-4">
                        Aggregate counters since last BIND start
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailBox
                            label="Requests (IPv4)"
                            value={fmt(stats.serverCounters.Requestv4)}
                        />
                        <DetailBox
                            label="Requests (TCP)"
                            value={fmt(stats.serverCounters.ReqTCP)}
                        />
                        <DetailBox
                            label="Responses"
                            value={fmt(stats.serverCounters.Response)}
                        />
                        <DetailBox
                            label="EDNS0"
                            value={fmt(stats.serverCounters.ReqEdns0)}
                        />
                        <DetailBox
                            label="Auth Answers"
                            value={fmt(stats.serverCounters.QryAuthAns)}
                        />
                        <DetailBox
                            label="Recursive Queries"
                            value={fmt(stats.serverCounters.QryRecursion)}
                        />
                        <DetailBox
                            label="NXDOMAIN"
                            value={fmt(stats.serverCounters.QryNXDOMAIN)}
                        />
                        <DetailBox
                            label="SERVFAIL"
                            value={fmt(stats.serverCounters.QrySERVFAIL)}
                        />
                        <DetailBox
                            label="TCP High-Water"
                            value={fmt(stats.serverCounters.TCPConnHighWater)}
                        />
                        <DetailBox
                            label="Cookies In"
                            value={fmt(stats.serverCounters.CookieIn)}
                        />
                    </div>
                </section>
            )}

            {/* ── Response Rcodes ──────────────────────────────────── */}
            {stats && Object.keys(stats.raw.rcodes || {}).length > 0 && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Response Codes
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailBox
                            label="NOERROR"
                            value={fmt((stats.raw.rcodes as CounterMap)?.["NOERROR"])}
                        />
                        <DetailBox
                            label="NXDOMAIN"
                            value={fmt((stats.raw.rcodes as CounterMap)?.["NXDOMAIN"])}
                        />
                        <DetailBox
                            label="SERVFAIL"
                            value={fmt((stats.raw.rcodes as CounterMap)?.["SERVFAIL"])}
                        />
                        <DetailBox
                            label="REFUSED"
                            value={fmt((stats.raw.rcodes as CounterMap)?.["REFUSED"])}
                        />
                    </div>
                </section>
            )}

            {/* ── Memory Summary ──────────────────────────────────── */}
            {stats?.memory && (stats.memory.totalUse !== null) && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Memory
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailBox
                            label="Total Use"
                            value={formatBytes(stats.memory.totalUse)}
                        />
                        <DetailBox
                            label="In Use"
                            value={formatBytes(stats.memory.inUse)}
                        />
                        <DetailBox
                            label="Malloced"
                            value={formatBytes(stats.memory.malloced)}
                        />
                        <DetailBox
                            label="Context Size"
                            value={formatBytes(stats.memory.contextSize)}
                        />
                        <DetailBox
                            label="Lost"
                            value={formatBytes(stats.memory.lost)}
                        />
                    </div>
                    {stats.memory.contexts.length > 0 && (
                        <details className="mt-4 group">
                            <summary className="font-mono text-xs uppercase tracking-widest cursor-pointer hover:underline">
                                Per-Context Breakdown ({stats.memory.contexts.length})
                            </summary>
                            <div className="mt-3 overflow-x-auto border-2 border-black">
                                <table className="w-full font-mono text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-black bg-muted">
                                            <Th>Context</Th>
                                            <Th>Total</Th>
                                            <Th>In Use</Th>
                                            <Th>Malloced</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.memory.contexts.map((ctx, i) => (
                                            <tr key={i} className="border-b border-black/10">
                                                <Td>{ctx.name}</Td>
                                                <Td className="text-right tabular-nums">{formatBytes(ctx.total)}</Td>
                                                <Td className="text-right tabular-nums">{formatBytes(ctx.inuse)}</Td>
                                                <Td className="text-right tabular-nums">{formatBytes(ctx.malloced)}</Td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                </section>
            )}

            {/* ── Tasks ───────────────────────────────────────────── */}
            {stats?.tasks && stats.tasks.length > 0 && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Tasks
                    </h2>
                    <div className="overflow-x-auto border-2 border-black">
                        <table className="w-full font-mono text-sm">
                            <thead>
                                <tr className="border-b-2 border-black bg-muted">
                                    <Th>Name</Th>
                                    <Th>State</Th>
                                    <Th>Refs</Th>
                                    <Th>Quantum</Th>
                                    <Th>Events</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.tasks.map((task, i) => (
                                    <tr key={task.id || i} className="border-b border-black/10 hover:bg-muted/50 transition-colors">
                                        <Td>{task.name}</Td>
                                        <Td>{task.state}</Td>
                                        <Td className="text-right tabular-nums">{task.references}</Td>
                                        <Td className="text-right tabular-nums">{task.quantum}</Td>
                                        <Td className="text-right tabular-nums">{task.events}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* ── Statistics channel unavailable notice ────────────── */}
            {bundle && !bundle.statsAvailable && (
                <section className="border-2 border-black p-6">
                    <p className="font-heading text-xl tracking-tight mb-2 uppercase">
                        Statistics Channel Unavailable
                    </p>
                    <p className="text-mutedForeground font-mono text-sm leading-relaxed">
                        BIND&apos;s <code className="bg-muted px-1">statistics-channels</code> are not
                        configured or the endpoint is unreachable. Server counters, memory,
                        tasks, and per-zone statistics are unavailable. Only <code className="bg-muted px-1">rndc status</code>{" "}
                        data is shown above.
                    </p>
                    <p className="text-mutedForeground font-mono text-sm leading-relaxed mt-2">
                        To enable, add a <code className="bg-muted px-1">statistics-channels</code> block to
                        named.conf.local and run <code className="bg-muted px-1">rndc reconfig</code>.
                    </p>
                </section>
            )}
        </div>
    );
}

// ── Sortable Per-Zone Table ─────────────────────────────────────────

type SortField = "zone" | "type" | "serial" | keyof typeof RCODE_LABELS;
type SortDir = "asc" | "desc";

const RCODE_LABELS = {
    QrySuccess: "Success",
    QryAuthAns: "Auth Ans",
    QryNxrrset: "NXRRSet",
    QryNXDOMAIN: "NXDOMAIN",
    QrySERVFAIL: "SERVFAIL",
    QryUDP: "UDP",
    QryTCP: "TCP",
} as const;

function ZoneStatsTable({ zones }: { zones: ZoneStatsEntry[] }) {
    const [sortField, setSortField] = useState<SortField>("zone");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    const sorted = [...zones].sort((a, b) => {
        let cmp = 0;
        if (sortField === "zone") {
            cmp = a.name.localeCompare(b.name);
        } else if (sortField === "type") {
            cmp = a.type.localeCompare(b.type);
        } else if (sortField === "serial") {
            cmp = (a.serial ?? 0) - (b.serial ?? 0);
        } else {
            const va = a.rcodes[sortField] ?? 0;
            const vb = b.rcodes[sortField] ?? 0;
            cmp = va - vb;
        }
        return sortDir === "asc" ? cmp : -cmp;
    });

    function toggleSort(field: SortField) {
        if (sortField === field) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    }

    const counterKeys = Object.keys(RCODE_LABELS) as (keyof typeof RCODE_LABELS)[];

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
        return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
    };

    return (
        <div className="overflow-x-auto border-2 border-black">
            <table className="w-full font-mono text-sm">
                <thead>
                    <tr className="border-b-2 border-black bg-muted">
                        <ThSort onClick={() => toggleSort("zone")}>
                            Zone <SortIcon field="zone" />
                        </ThSort>
                        <ThSort onClick={() => toggleSort("type")}>
                            Type <SortIcon field="type" />
                        </ThSort>
                        <ThSort onClick={() => toggleSort("serial")}>
                            Serial <SortIcon field="serial" />
                        </ThSort>
                        {counterKeys.map((key) => (
                            <ThSort key={key} onClick={() => toggleSort(key)}>
                                {RCODE_LABELS[key]} <SortIcon field={key} />
                            </ThSort>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((zone) => (
                        <tr
                            key={zone.name}
                            className="border-b border-black/10 hover:bg-muted/50 transition-colors"
                        >
                            <Td className="font-semibold">{zone.name}</Td>
                            <Td>{zone.type}</Td>
                            <Td className="text-right tabular-nums">
                                {zone.serial?.toLocaleString() ?? "—"}
                            </Td>
                            {counterKeys.map((key) => (
                                <Td key={key} className="text-right tabular-nums">
                                    {(zone.rcodes[key] ?? 0).toLocaleString()}
                                </Td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(val: number | undefined | null): string {
    if (val === undefined || val === null) return "—";
    return val.toLocaleString();
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── UI Primitives ───────────────────────────────────────────────────

function DetailBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-2 border-black p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-mutedForeground mb-1">
                {label}
            </p>
            <p className="font-mono text-sm break-all">{value}</p>
        </div>
    );
}

function Th({ children }: { children: React.ReactNode }) {
    return (
        <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-mutedForeground font-semibold">
            {children}
        </th>
    );
}

function ThSort({
    children,
    onClick,
}: {
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <th
            className="text-left px-3 py-2 text-xs uppercase tracking-widest text-mutedForeground font-semibold cursor-pointer select-none hover:text-black transition-colors"
            onClick={onClick}
        >
            {children}
        </th>
    );
}

function Td({
    children,
    className = "",
    colSpan,
}: {
    children: React.ReactNode;
    className?: string;
    colSpan?: number;
}) {
    return (
        <td className={`px-3 py-2 ${className}`} colSpan={colSpan}>{children}</td>
    );
}
