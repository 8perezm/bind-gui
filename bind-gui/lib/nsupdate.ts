import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const DNS_HOST = process.env.BIND_DNS_HOST || "127.0.0.1";
const TSIG_KEY_FILE = process.env.TSIG_KEY_FILE || "/etc/bind/bind-gui.key";
const TIMEOUT_MS = 10_000;

export class NsupdateError extends Error {
    constructor(
        message: string,
        public stdout: string,
        public stderr: string,
    ) {
        super(message);
        this.name = "NsupdateError";
    }
}

/**
 * Run an nsupdate transaction from an array of command lines.
 * The `send` command is appended automatically.
 */
async function runNsupdate(commands: string[]): Promise<{ stdout: string; stderr: string }> {
    // Build the script
    const scriptLines = [`server ${DNS_HOST}`, ...commands, "send"];
    const script = scriptLines.join("\n") + "\n";

    // Write to a temporary file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nsupdate-"));
    const scriptPath = path.join(tmpDir, "script.txt");
    fs.writeFileSync(scriptPath, script, "utf-8");

    return new Promise((resolve, reject) => {
        const child = spawn("nsupdate", ["-k", TSIG_KEY_FILE, "-v", scriptPath], {
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
            // Cleanup temp files
            try {
                fs.unlinkSync(scriptPath);
                fs.rmdirSync(tmpDir);
            } catch {
                // best-effort cleanup
            }

            if (code === 0) {
                resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
            } else {
                reject(
                    new NsupdateError(
                        `nsupdate failed (exit ${code})`,
                        stdout.trim(),
                        stderr.trim(),
                    ),
                );
            }
        });

        child.on("error", (err) => {
            try {
                fs.unlinkSync(scriptPath);
                fs.rmdirSync(tmpDir);
            } catch {
                // best-effort cleanup
            }
            reject(
                new NsupdateError(
                    `nsupdate spawn error: ${err.message}`,
                    stdout.trim(),
                    stderr.trim(),
                ),
            );
        });
    });
}

function validateRecord(record: { zone?: string; name?: string; type?: string }): void {
    if (record.zone !== undefined && !/^[a-zA-Z0-9._*-]+$/.test(record.zone)) {
        throw new NsupdateError(`Invalid zone name: "${record.zone}"`, "", "");
    }
    if (record.name !== undefined && !/^[a-zA-Z0-9._*-]+$/.test(record.name)) {
        throw new NsupdateError(`Invalid record name: "${record.name}"`, "", "");
    }
    if (record.type !== undefined && !/^[A-Z]+$/.test(record.type)) {
        throw new NsupdateError(`Invalid record type: "${record.type}"`, "", "");
    }
}

/**
 * Add a single resource record via nsupdate.
 * BIND auto-bumps the SOA serial when the update is applied.
 */
export async function addRecord(
    zone: string,
    name: string,
    type: string,
    ttl: number,
    rdata: string,
): Promise<void> {
    validateRecord({ zone, name, type });
    await runNsupdate([
        `zone ${zone}`,
        `update add ${name} ${ttl} IN ${type} ${rdata}`,
    ]);
}

/**
 * Delete a specific resource record (exact match on name + type + rdata).
 */
export async function deleteRecord(
    zone: string,
    name: string,
    type: string,
    rdata: string,
): Promise<void> {
    validateRecord({ zone, name, type });
    await runNsupdate([
        `zone ${zone}`,
        `update delete ${name} IN ${type} ${rdata}`,
    ]);
}

/**
 * Delete an entire RRset (all records matching name + type).
 */
export async function deleteRRset(
    zone: string,
    name: string,
    type: string,
): Promise<void> {
    validateRecord({ zone, name, type });
    await runNsupdate([
        `zone ${zone}`,
        `update delete ${name} IN ${type}`,
    ]);
}

/**
 * Run an arbitrary nsupdate transaction script (lines of nsupdate commands).
 * The `send` command is appended automatically.
 */
export async function applyTransaction(
    commands: string[],
): Promise<{ stdout: string; stderr: string }> {
    return runNsupdate(commands);
}
