import { spawn } from "child_process";

const RNDC_HOST = process.env.BIND_RNDC_HOST || "127.0.0.1";
const TSIG_KEY_FILE = process.env.TSIG_KEY_FILE || "/etc/bind/bind-gui.key";
const TIMEOUT_MS = 10_000;

export class RndcError extends Error {
    constructor(
        message: string,
        public stdout: string,
        public stderr: string,
    ) {
        super(message);
        this.name = "RndcError";
    }
}

export interface RndcResult {
    success: boolean;
    output: string;
}

export interface ZoneStatus {
    name: string;
    type: string;
    serial: number | null;
    dynamic: boolean;
    journal: boolean;
    inlineSigning: boolean;
    keyDirectory: string | null;
    /** "automatic" if `auto-dnssec maintain;` is set, "none" otherwise. */
    keyMaintenance: string | null;
    /** Human-readable timestamp of the next scheduled key event, e.g. "22-Jul-2026 04:02:05 GMT". */
    nextKeyEvent: string | null;
    raw: Record<string, string>;
}

export interface AddZoneOptions {
    allowUpdateKey?: string;
    inlineSigning?: boolean;
}

function runRndc(args: string[]): Promise<RndcResult> {
    return new Promise((resolve, reject) => {
        const child = spawn("rndc", ["-s", RNDC_HOST, "-k", TSIG_KEY_FILE, ...args], {
            timeout: TIMEOUT_MS,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve({ success: true, output: stdout.trim() });
            } else {
                reject(
                    new RndcError(
                        `rndc failed (exit ${code})`,
                        stdout.trim(),
                        stderr.trim(),
                    ),
                );
            }
        });

        child.on("error", (err) => {
            reject(
                new RndcError(
                    `rndc spawn error: ${err.message}`,
                    stdout.trim(),
                    stderr.trim(),
                ),
            );
        });
    });
}

function validateDomain(domain: string): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(domain)) {
        throw new RndcError(
            `Invalid domain name: "${domain}". Only letters, numbers, dots, and hyphens allowed.`,
            "",
            "",
        );
    }
}

/**
 * Add a zone to BIND using `rndc addzone`.
 * The zone file must already exist on disk (created by the caller).
 */
export async function addZone(
    domain: string,
    options?: AddZoneOptions,
): Promise<RndcResult> {
    validateDomain(domain);
    const key = options?.allowUpdateKey || "bind-gui-key";
    const inline = options?.inlineSigning ? ' inline-signing yes;' : '';
    const configStr = `{ type master; file "/etc/bind/db.${domain}"; allow-update { key "${key}"; };${inline} };`;
    return runRndc(["addzone", domain, configStr]);
}

/** Remove a zone from the running BIND using `rndc delzone`. File is NOT removed. */
export async function delZone(domain: string): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["delzone", domain]);
}

/** Modify a running zone's options using `rndc modzone`. */
export async function modZone(
    domain: string,
    configStr: string,
): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["modzone", domain, configStr]);
}

/** Freeze (lock) a dynamic zone for manual file editing. */
export async function freeze(domain: string): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["freeze", domain]);
}

/** Sign a zone — generate keys if needed and sign all records (like `rndc sign`). */
export async function signZone(domain: string): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["sign", domain]);
}

/** Thaw (unlock) a dynamic zone so BIND resumes journal writes. */
export async function thaw(domain: string): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["thaw", domain]);
}

/** Get detailed status for a zone using `rndc zonestatus`. */
export async function zoneStatus(domain: string): Promise<ZoneStatus> {
    validateDomain(domain);
    const result = await runRndc(["zonestatus", domain]);
    return parseZoneStatus(result.output);
}

/** Trigger a full configuration reload across all zones. */
export async function reload(): Promise<RndcResult> {
    return runRndc(["reload"]);
}

/** Reload a single zone, picking up changes to its block in named.conf.local. */
export async function reloadZone(domain: string): Promise<RndcResult> {
    validateDomain(domain);
    return runRndc(["reload", domain]);
}

/**
 * Re-read the configuration file.
 *
 * `reconfig` is non-disruptive: it adds new zones, removes deleted
 * zones, and reloads zones whose block changed. However, for dynamic
 * zones (those with `allow-update` and a journal) a plain `reconfig`
 * may skip the reload. After `reconfig`, callers should verify the
 * zone status and use `reloadZone(domain)` — with freeze/thaw for
 * dynamic zones — if the expected change hasn't taken effect.
 */
export async function reconfig(): Promise<RndcResult> {
    return runRndc(["reconfig"]);
}

/**
 * Flush the zone's journal to the zone file.
 *
 * For dynamic zones, BIND keeps an incremental journal (.jnl) alongside
 * the zone file. Without a sync, the file on disk can be stale and not
 * reflect records added via nsupdate. Call this before reading the file
 * to get a view that's consistent with BIND's in-memory state.
 *
 * Pass `clean: true` to also remove the journal after flushing.
 */
export async function sync(domain: string, clean = false): Promise<RndcResult> {
    validateDomain(domain);
    const args = ["sync"];
    if (clean) args.push("-clean");
    args.push(domain);
    return runRndc(args);
}

function parseZoneStatus(output: string): ZoneStatus {
    const lines = output.split("\n");
    const raw: Record<string, string> = {};
    for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            raw[key] = val;
        }
    }

    // BIND 9.18's `rndc zonestatus` does NOT output an `inline signing`
    // field even when inline-signing is configured and active. Instead,
    // zones with inline-signing always include a `signed serial` line
    // (which may equal the regular `serial` if no new signatures have
    // been generated yet). Zones without inline-signing never show
    // `signed serial`. Detect inline-signing from either field.
    const hasSignedSerial = raw["signed serial"] !== undefined && raw["signed serial"] !== "";
    const inlineSigning = raw["inline signing"] === "yes" || hasSignedSerial;

    return {
        name: raw["name"] || "",
        type: raw["type"] || "",
        serial: raw["serial"] ? parseInt(raw["serial"], 10) : null,
        dynamic: raw["dynamic"] === "yes",
        journal: raw["journal"] === "yes",
        inlineSigning,
        keyDirectory: raw["key directory"] || null,
        keyMaintenance: raw["key maintenance"] || null,
        nextKeyEvent: raw["next key event"] || null,
        raw,
    };
}

// ── Server status (rndc status) ─────────────────────────────────────

export interface ServerStatus {
    version: string;
    bootTime: string | null;
    lastConfigured: string | null;
    numberOfZones: string | null;
    debugLevel: number | null;
    xfersRunning: number | null;
    xfersDeferred: number | null;
    recursiveClients: string | null;
    tcpClients: string | null;
    tcpHighWater: number | null;
    /** Raw key-value pairs for any field we don't explicitly parse. */
    raw: Record<string, string>;
}

/** Get overall server status using `rndc status`. */
export async function serverStatus(): Promise<ServerStatus> {
    const result = await runRndc(["status"]);
    return parseServerStatus(result.output);
}

function parseNumber(val: string | undefined): number | null {
    if (val === undefined || val === "") return null;
    // Handle values like "0/900/1000" or "0/150" — extract first number
    const num = parseInt(val.split("/")[0], 10);
    return isNaN(num) ? null : num;
}

function parseServerStatus(output: string): ServerStatus {
    const lines = output.split("\n");
    const raw: Record<string, string> = {};
    for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            raw[key] = val;
        }
    }

    return {
        version: raw["version"] || "",
        bootTime: raw["boot time"] || null,
        lastConfigured: raw["last configured"] || raw["last reconfig time"] || null,
        numberOfZones: raw["number of zones"] || null,
        debugLevel: parseNumber(raw["debug level"]),
        xfersRunning: parseNumber(raw["xfers running"]),
        xfersDeferred: parseNumber(raw["xfers deferred"]),
        recursiveClients: raw["recursive clients"] || null,
        tcpClients: raw["tcp clients"] || null,
        tcpHighWater: parseNumber(raw["TCP high-water"]),
        raw,
    };
}
