// ── BIND Statistics Channel Client ──────────────────────────────────
//
// Fetches JSON statistics from BIND's statistics-channels HTTP endpoint
// (port 8953, not published to host — Docker-network-scoped only).
// Composes the HTTP JSON data with `rndc status` for a full picture.

import { serverStatus, type ServerStatus } from "@/lib/rndc";

const STATS_URL = process.env.BIND_STATS_URL || "http://bind9:8953";

// ── Error type ─────────────────────────────────────────────────────

export class StatsUnavailableError extends Error {
    constructor(
        message: string,
        public statusCode?: number,
        public cause?: unknown,
    ) {
        super(message);
        this.name = "StatsUnavailableError";
    }
}

// ── Typed interfaces for the BIND statistics JSON ──────────────────

export interface StatsCounter {
    name: string;
    value: number;
}

export interface ServerStats {
    counters: StatsCounter[];
    raw?: Record<string, unknown>;
}

export interface MemorySummary {
    totalUse: number | null;
    inUse: number | null;
    malloced: number | null;
    contextSize: number | null;
    raw?: Record<string, unknown>;
}

export interface ZoneStatsEntry {
    name: string;
    class: string;
    serial: number | null;
    type: string;
    counters: StatsCounter[];
}

export interface TaskEntry {
    name: string;
    counters: StatsCounter[];
}

export interface BindStatistics {
    server: ServerStats;
    memory: MemorySummary;
    zones: ZoneStatsEntry[];
    tasks: TaskEntry[];
    raw: Record<string, unknown>;
}

/** Bundle returned by the statistics API */
export interface StatsBundle {
    rndcStatus: ServerStatus;
    stats: BindStatistics | null;
    statsAvailable: boolean;
}

// ── Fetch helpers ──────────────────────────────────────────────────

/**
 * Fetch the raw JSON statistics document from BIND's statistics-channels
 * endpoint. Returns the full parsed JSON (any shape).
 *
 * Throws `StatsUnavailableError` if the endpoint is unreachable or
 * returns a non-200 status.
 */
async function fetchStatsJson(
    path = "/json/v1",
): Promise<Record<string, unknown>> {
    const url = `${STATS_URL}${path}`;
    let res: Response;
    try {
        res = await fetch(url, {
            signal: AbortSignal.timeout(5_000),
        });
    } catch (err) {
        throw new StatsUnavailableError(
            `Failed to connect to BIND statistics channel at ${url}`,
            undefined,
            err,
        );
    }

    if (!res.ok) {
        throw new StatsUnavailableError(
            `BIND statistics channel returned HTTP ${res.status}`,
            res.status,
        );
    }

    try {
        return (await res.json()) as Record<string, unknown>;
    } catch (err) {
        throw new StatsUnavailableError(
            "BIND statistics channel returned non-JSON response",
            undefined,
            err,
        );
    }
}

// ── Parsers ────────────────────────────────────────────────────────

function extractCounters(obj: unknown): StatsCounter[] {
    if (!obj || typeof obj !== "object") return [];
    const arr = (obj as Record<string, unknown>)["counter"];
    if (!Array.isArray(arr)) return [];
    return arr
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
            name: String(c["name"] ?? ""),
            value: Number(c["value"] ?? 0),
        }))
        .filter((c) => c.name !== "");
}

function parseServerStats(serverObj: unknown): ServerStats {
    const raw = (serverObj as Record<string, unknown>) ?? {};
    return {
        counters: extractCounters(raw),
        raw: raw as Record<string, unknown>,
    };
}

function parseMemorySummary(memObj: unknown): MemorySummary {
    const raw = (memObj as Record<string, unknown>) ?? {};
    const summary = raw["summary"] as Record<string, unknown> | undefined;
    if (!summary || typeof summary !== "object") {
        return { totalUse: null, inUse: null, malloced: null, contextSize: null, raw: undefined };
    }
    return {
        totalUse: typeof summary["TotalUse"] === "number" ? (summary["TotalUse"] as number) : null,
        inUse: typeof summary["InUse"] === "number" ? (summary["InUse"] as number) : null,
        malloced: typeof summary["Malloced"] === "number" ? (summary["Malloced"] as number) : null,
        contextSize: typeof summary["ContextSize"] === "number" ? (summary["ContextSize"] as number) : null,
        raw: summary as Record<string, unknown>,
    };
}

function parseZones(zonesObj: unknown): ZoneStatsEntry[] {
    if (!zonesObj || typeof zonesObj !== "object") return [];
    const raw = zonesObj as Record<string, unknown>;
    const zones = raw["zone"];
    if (!Array.isArray(zones)) return [];

    return zones.map((z: unknown) => {
        const zone = (z as Record<string, unknown>) ?? {};
        return {
            name: String(zone["name"] ?? ""),
            class: String(zone["class"] ?? "IN"),
            serial: typeof zone["serial"] === "number" ? (zone["serial"] as number) : null,
            type: String(zone["type"] ?? ""),
            counters: extractCounters(zone),
        };
    });
}

function parseTasks(tasksObj: unknown): TaskEntry[] {
    if (!tasksObj || typeof tasksObj !== "object") return [];
    const raw = tasksObj as Record<string, unknown>;
    const tasks = raw["task"];
    if (!Array.isArray(tasks)) return [];

    return tasks.map((t: unknown) => {
        const task = (t as Record<string, unknown>) ?? {};
        return {
            name: String(task["name"] ?? ""),
            counters: extractCounters(task),
        };
    });
}

function parseBindStatistics(json: Record<string, unknown>): BindStatistics {
    const ns = (json["ns"] as Record<string, unknown>) ?? {};
    const nsStats = (ns["stats"] as Record<string, unknown>) ?? {};

    return {
        server: parseServerStats(nsStats["server"]),
        memory: parseMemorySummary(nsStats["memory"]),
        zones: parseZones(nsStats["zones"]),
        tasks: parseTasks(nsStats["tasks"]),
        raw: nsStats,
    };
}

// ── Composed fetch ─────────────────────────────────────────────────

/**
 * Fetch the full statistics bundle: `rndc status` plus the JSON
 * statistics-channels data (if available).
 *
 * The statistics-channel portion is best-effort: if BIND hasn't been
 * configured with a `statistics-channels` block, this returns
 * `stats: null` and `statsAvailable: false` rather than throwing.
 */
export async function getStatsBundle(): Promise<StatsBundle> {
    // `rndc status` is always available
    const status = await serverStatus();

    // The statistics-channel JSON is best-effort
    let stats: BindStatistics | null = null;
    let statsAvailable = false;

    try {
        const json = await fetchStatsJson();
        stats = parseBindStatistics(json);
        statsAvailable = true;
    } catch (err) {
        if (err instanceof StatsUnavailableError) {
            // Statistics channel not configured or unreachable — this is
            // not an error from the caller's perspective.
            stats = null;
            statsAvailable = false;
        } else {
            // Unexpected error — rethrow
            throw err;
        }
    }

    return { rndcStatus: status, stats, statsAvailable };
}

/**
 * Look up a specific counter by name from a list of counters.
 * Returns `null` if not found.
 */
export function findCounter(counters: StatsCounter[], name: string): number | null {
    const found = counters.find((c) => c.name === name);
    return found ? found.value : null;
}
