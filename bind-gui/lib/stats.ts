// ── BIND Statistics Channel Client ──────────────────────────────────
//
// Fetches JSON statistics from BIND's statistics-channels HTTP endpoint
// (port 8953, not published to host — Docker-network-scoped only).
// Composes the HTTP JSON data with `rndc status` for a full picture.
//
// BIND JSON statistics schema (v1.7, BIND 9.18):
//   Top-level keys: nsstats, views._default.zones, memory, taskmgr.tasks,
//   sockstats, traffic, opcodes, rcodes, qtypes, zonestats.
//   No nested ns.stats.server wrapper — everything is flat.

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

/** Flat key-value map — e.g. { QrySuccess: 71, Requestv4: 138, ... } */
export type CounterMap = Record<string, number>;

export interface MemorySummary {
    totalUse: number | null;
    inUse: number | null;
    malloced: number | null;
    contextSize: number | null;
    lost: number | null;
    contexts: MemoryContext[];
}

export interface MemoryContext {
    name: string;
    total: number;
    inuse: number;
    malloced: number;
}

export interface ZoneStatsEntry {
    name: string;
    class: string;
    serial: number | null;
    type: string;
    /** Per-zone response-code counters like { QrySuccess: 9, ... } */
    rcodes: CounterMap;
    /** Per-zone query-type counters like { A: 9, AAAA: 11, ... } */
    qtypes: CounterMap;
}

export interface TaskEntry {
    id: string;
    name: string;
    references: number;
    state: string;
    quantum: number;
    events: number;
}

export interface SocketStats {
    counters: CounterMap;
}

export interface BindStatistics {
    /** Server-wide counters (from `nsstats`). */
    serverCounters: CounterMap;
    /** Aggregate zone counters (from `zonestats`). */
    zoneCounters: CounterMap;
    /** Memory summary + per-context breakdown. */
    memory: MemorySummary;
    /** User-configured zones (type=primary) with optional per-zone counters. */
    zones: ZoneStatsEntry[];
    /** Task manager tasks. */
    tasks: TaskEntry[];
    /** Socket stats. */
    socketStats: SocketStats;
    /** Whole raw JSON for debugging. */
    raw: Record<string, unknown>;
}

/** Bundle returned by the statistics API */
export interface StatsBundle {
    rndcStatus: ServerStatus;
    stats: BindStatistics | null;
    statsAvailable: boolean;
}

// ── Fetch helpers ──────────────────────────────────────────────────

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

// ── Parsers (BIND 9.18 JSON stats v1.7) ───────────────────────────

function asRecord(obj: unknown): Record<string, unknown> {
    return (obj || {}) as Record<string, unknown>;
}

function parseCounterMap(obj: unknown): CounterMap {
    const raw = asRecord(obj);
    const map: CounterMap = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof val === "number") {
            map[key] = val;
        }
    }
    return map;
}

function parseMemory(json: Record<string, unknown>): MemorySummary {
    const mem = asRecord(json["memory"]);
    return {
        totalUse: typeof mem["TotalUse"] === "number" ? (mem["TotalUse"] as number) : null,
        inUse: typeof mem["InUse"] === "number" ? (mem["InUse"] as number) : null,
        malloced: typeof mem["Malloced"] === "number" ? (mem["Malloced"] as number) : null,
        contextSize: typeof mem["ContextSize"] === "number" ? (mem["ContextSize"] as number) : null,
        lost: typeof mem["Lost"] === "number" ? (mem["Lost"] as number) : null,
        contexts: parseMemoryContexts(mem["contexts"]),
    };
}

function parseMemoryContexts(ctxArr: unknown): MemoryContext[] {
    if (!Array.isArray(ctxArr)) return [];
    return ctxArr.map((c: unknown) => {
        const ctx = asRecord(c);
        return {
            name: String(ctx["name"] ?? ""),
            total: typeof ctx["total"] === "number" ? (ctx["total"] as number) : 0,
            inuse: typeof ctx["inuse"] === "number" ? (ctx["inuse"] as number) : 0,
            malloced: typeof ctx["malloced"] === "number" ? (ctx["malloced"] as number) : 0,
        };
    }).filter((c) => c.name !== "");
}

function parseZones(json: Record<string, unknown>): ZoneStatsEntry[] {
    const views = asRecord(json["views"]);
    const defaultView = asRecord(views["_default"]);
    const zones = defaultView["zones"];
    if (!Array.isArray(zones)) return [];

    return zones
        .map((z: unknown) => {
            const zone = asRecord(z);
            return {
                name: String(zone["name"] ?? ""),
                class: String(zone["class"] ?? "IN"),
                serial: typeof zone["serial"] === "number" ? (zone["serial"] as number) : null,
                type: String(zone["type"] ?? ""),
                rcodes: parseCounterMap(zone["rcodes"]),
                qtypes: parseCounterMap(zone["qtypes"]),
            };
        })
        .filter((z) => z.name !== "" && z.type === "primary");
}

function parseTasks(json: Record<string, unknown>): TaskEntry[] {
    const taskmgr = asRecord(json["taskmgr"]);
    const tasks = taskmgr["tasks"];
    if (!Array.isArray(tasks)) return [];

    return tasks.map((t: unknown) => {
        const task = asRecord(t);
        return {
            id: String(task["id"] ?? ""),
            name: String(task["name"] ?? "unnamed"),
            references: typeof task["references"] === "number" ? (task["references"] as number) : 0,
            state: String(task["state"] ?? ""),
            quantum: typeof task["quantum"] === "number" ? (task["quantum"] as number) : 0,
            events: typeof task["events"] === "number" ? (task["events"] as number) : 0,
        };
    });
}

function parseBindStatistics(json: Record<string, unknown>): BindStatistics {
    const nsstats = parseCounterMap(json["nsstats"]);
    const zonestats = parseCounterMap(json["zonestats"]);

    return {
        serverCounters: nsstats,
        zoneCounters: zonestats,
        memory: parseMemory(json),
        zones: parseZones(json),
        tasks: parseTasks(json),
        socketStats: { counters: parseCounterMap(json["sockstats"]) },
        raw: json,
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
 * Look up a specific counter by name from a CounterMap.
 * Returns `0` if not found.
 */
export function getCounter(counters: CounterMap, name: string): number {
    return counters[name] ?? 0;
}
