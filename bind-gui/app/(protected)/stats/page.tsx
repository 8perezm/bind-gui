"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
    StatsBundle,
    ZoneStatsEntry,
    StatsCounter,
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
                            label="Zone Count"
                            value={status.zoneCount?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="Zone Maximum"
                            value={status.zoneMaximum?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="Recursive Clients"
                            value={status.recursiveClients?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="TCP Clients"
                            value={status.tcpClients?.toString() ?? "—"}
                        />
                        <DetailBox
                            label="Last Reconfig"
                            value={status.lastReconfigTime ?? "—"}
                        />
                        <DetailBox
                            label="Xfers Running"
                            value={
                                status.raw["transfers running"] ??
                                status.raw["xfers running"] ??
                                "—"
                            }
                        />
                    </div>
                </section>
            )}

            {/* ── Server Counters ──────────────────────────────────── */}
            {stats?.server && stats.server.counters.length > 0 && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Server Counters
                    </h2>
                    <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mb-4">
                        Aggregate counters since last BIND start
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <DetailBox
                            label="Queries In"
                            value={formatCounter(stats.server.counters, "queries-in")}
                        />
                        <DetailBox
                            label="Queries Out"
                            value={formatCounter(stats.server.counters, "queries-out")}
                        />
                        <DetailBox
                            label="TCP Connections"
                            value={formatCounter(stats.server.counters, "tcp-connections")}
                        />
                        <DetailBox
                            label="UDP Receives"
                            value={formatCounter(stats.server.counters, "udp-receives")}
                        />
                        <DetailBox
                            label="Auth Queries"
                            value={
                                formatCounter(stats.server.counters, "auth-queries") ??
                                formatCounter(stats.server.counters, "QryAuthAns") ??
                                "—"
                            }
                        />
                        <DetailBox
                            label="Recursive Queries"
                            value={
                                formatCounter(stats.server.counters, "recursive-queries") ??
                                formatCounter(stats.server.counters, "QryRecAns") ??
                                "—"
                            }
                        />
                        <DetailBox
                            label="NXDOMAIN"
                            value={formatCounter(stats.server.counters, "QryNXDOMAIN") ?? "—"}
                        />
                        <DetailBox
                            label="SERVFAIL"
                            value={formatCounter(stats.server.counters, "QrySERVFAIL") ?? "—"}
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
                    </div>
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
                                    <Th>Task</Th>
                                    <Th>Counter</Th>
                                    <Th>Value</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.tasks.map((task, ti) =>
                                    task.counters.length > 0
                                        ? task.counters.map((c, ci) => (
                                            <tr
                                                key={`${ti}-${ci}`}
                                                className="border-b border-black/10"
                                            >
                                                <Td>
                                                    {ci === 0 ? task.name : ""}
                                                </Td>
                                                <Td>{c.name}</Td>
                                                <Td className="text-right tabular-nums">
                                                    {c.value.toLocaleString()}
                                                </Td>
                                            </tr>
                                        ))
                                        : (
                                            <tr key={ti} className="border-b border-black/10">
                                                <Td>{task.name}</Td>
                                                <Td colSpan={2} className="text-mutedForeground">
                                                    No counters
                                                </Td>
                                            </tr>
                                        ),
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
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

type SortField = "zone" | "type" | "serial" | keyof typeof COUNTER_LABELS;
type SortDir = "asc" | "desc";

const COUNTER_LABELS = {
    "QrySuccess": "Queries",
    "QryAuthAns": "Auth Ans",
    "QryNxrrset": "NXRRSet",
    "QryNXDOMAIN": "NXDOMAIN",
    "QrySERVFAIL": "SERVFAIL",
    "QryDuplicate": "Dup Qry",
    "QryDropped": "Qry Drop",
    "NotifyIn": "Notify In",
    "NotifyOut": "Notify Out",
    "XfrReqDone": "IXFR Req",
    "XfrReqDoneAXFR": "AXFR Req",
    "UpdateReq": "Update Req",
    "UpdateRej": "Update Rej",
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
            const va = findCounterVal(a.counters, sortField);
            const vb = findCounterVal(b.counters, sortField);
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

    const counterKeys = Object.keys(COUNTER_LABELS) as (keyof typeof COUNTER_LABELS)[];

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
                                {COUNTER_LABELS[key]} <SortIcon field={key} />
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
                                    {findCounterVal(zone.counters, key).toLocaleString()}
                                </Td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function findCounterVal(counters: StatsCounter[], name: string): number {
    const found = counters.find((c) => c.name === name);
    return found ? found.value : 0;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatCounter(counters: StatsCounter[], name: string): string {
    const found = counters.find((c) => c.name === name);
    return found ? found.value.toLocaleString() : "—";
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
