import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import {
    zoneStatus,
    reloadZone,
    reconfig,
    freeze,
    thaw,
    RndcError,
} from "@/lib/rndc";
import { setInlineSigningInNamedConfLocal } from "@/lib/fileSystem";

const TIMEOUT_MS = 10_000;

interface DsInfo {
    cds: string | null;
    cdnskey: string | null;
    dsRecord: string | null;
}

// GET /api/zones/[filename]/dnssec
// Returns zone status with DNSSEC info
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const domain = extractDomain(filename);

    try {
        const status = await zoneStatus(domain);

        let ds: DsInfo | null = null;
        if (status.inlineSigning) {
            ds = await fetchDsRecords(domain);
        }

        return NextResponse.json({ status, ds });
    } catch (err) {
        if (err instanceof RndcError) {
            return NextResponse.json(
                { error: err.message, stderr: err.stderr },
                { status: 500 }
            );
        }
        return NextResponse.json(
            { error: "Failed to get DNSSEC status" },
            { status: 500 }
        );
    }
}

// POST /api/zones/[filename]/dnssec
// Body: { action: "enable" | "disable" }
//
// Implementation: edit named.conf.local to add/remove `inline-signing
// yes;` inside the zone block, then `rndc reconfig` + `rndc reload
// <zone>`. The two-step is required because `reconfig` alone does not
// reload zones whose block was modified (only adds new zones and
// removes deleted ones). This never takes the zone out of service —
// unlike the previous `delZone + addZone` approach, which left the
// zone missing from BIND whenever the second call failed.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const domain = extractDomain(filename);
    const body = await req.json();
    const { action } = body as { action: string };

    if (action !== "enable" && action !== "disable") {
        return NextResponse.json(
            { error: "Action must be 'enable' or 'disable'" },
            { status: 400 }
        );
    }

    const enabled = action === "enable";

    const edited = setInlineSigningInNamedConfLocal(domain, enabled);
    if (!edited) {
        return NextResponse.json(
            {
                error: `Failed to ${action} inline-signing: could not edit named.conf.local. Is the zone declared there?`,
            },
            { status: 500 }
        );
    }

    try {
        // 1) Re-read named.conf into the running config. This picks up
        //    the change to the zone block (it doesn't reload the zone
        //    itself, just registers the new options).
        await reconfig();
        // 2) Reload just this zone so BIND applies the new options
        //    atomically without disturbing other zones.
        await reloadZone(domain);
    } catch (err) {
        // We edited the file but BIND didn't accept the reload. Try to
        // undo the named.conf.local edit so on-disk state matches
        // BIND's running state.
        const stderr = err instanceof RndcError ? (err.stderr || err.message) : (err instanceof Error ? err.message : String(err));
        console.error(`rndc reload ${domain} failed after editing named.conf.local:`, err);

        setInlineSigningInNamedConfLocal(domain, !enabled);
        return NextResponse.json(
            {
                error: `Failed to ${action} DNSSEC: rndc reload was rejected. named.conf.local was reverted.`,
                stderr,
            },
            { status: 500 }
        );
    }

    // Force immediate signing when enabling, so the user doesn't have
    // to wait for the next resign interval.
    if (enabled) {
        try {
            await freeze(domain);
            await thaw(domain);
        } catch {
            // best-effort — zone may already be up to date, or may not
            // be dynamic (in which case freeze/thaw is a no-op error).
        }
    }

    // Re-read status after the change
    let status = null;
    try {
        status = await zoneStatus(domain);
    } catch (err) {
        console.error(`rndc zonestatus ${domain} failed after toggle:`, err);
        return NextResponse.json(
            {
                error: "inline-signing was edited and BIND reloaded, but the post-toggle status read failed.",
            },
            { status: 500 }
        );
    }

    let ds: DsInfo | null = null;
    if (status.inlineSigning) {
        ds = await fetchDsRecords(domain);
    }

    return NextResponse.json({ success: true, status, ds });
}

function extractDomain(filename: string): string {
    const match = filename.match(/^db\.(.+)$/);
    return match ? match[1] : filename.replace(/^db\./, "");
}

async function fetchDsRecords(zone: string): Promise<DsInfo | null> {
    try {
        const [cds, cdnskey, dsRecord] = await Promise.all([
            digShort(zone, "CDS"),
            digShort(zone, "CDNSKEY"),
            runDsFromKey(zone),
        ]);
        return { cds, cdnskey, dsRecord };
    } catch {
        return null;
    }
}

async function digShort(zone: string, type: string): Promise<string | null> {
    return new Promise((resolve) => {
        const child = spawn("dig", [
            "@127.0.0.1", zone, type, "+short",
        ], {
            timeout: TIMEOUT_MS,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr.on("data", (_data: Buffer) => {
            // ignore stderr
        });

        child.on("close", (code) => {
            if (code === 0 && stdout.trim()) {
                resolve(stdout.trim());
            } else {
                resolve(null);
            }
        });

        child.on("error", () => resolve(null));
    });
}

async function runDsFromKey(zone: string): Promise<string | null> {
    return new Promise((resolve) => {
        const child = spawn("dnssec-dsfromkey", [zone], {
            cwd: "/etc/bind",
            timeout: TIMEOUT_MS,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0 && stdout.trim()) {
                resolve(stdout.trim());
            } else {
                resolve(null);
            }
        });

        child.on("error", () => resolve(null));
    });
}
