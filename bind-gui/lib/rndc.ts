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
    raw: Record<string, string>;
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
    allowUpdateKey?: string,
): Promise<RndcResult> {
    validateDomain(domain);
    const key = allowUpdateKey || "bind-gui-key";
    const configStr = `type master; file "/etc/bind/db.${domain}"; allow-update { key "${key}"; };`;
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

    return {
        name: raw["name"] || "",
        type: raw["type"] || "",
        serial: raw["serial"] ? parseInt(raw["serial"], 10) : null,
        dynamic: raw["dynamic"] === "yes",
        journal: raw["journal"] === "yes",
        raw,
    };
}
