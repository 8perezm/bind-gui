import { NextRequest, NextResponse } from "next/server";
import {
    deleteZoneFile,
    readZoneFile,
    unregisterZoneFromNamedConfLocal,
} from "@/lib/fileSystem";
import { parseZoneFile } from "@/lib/dnsParser";
import { diffRecords, opsToCommands } from "@/lib/dnsDiff";
import { applyTransaction } from "@/lib/nsupdate";
import { delZone, zoneStatus, sync, reconfig, RndcError } from "@/lib/rndc";
import type { DnsRecord } from "@/lib/dnsTypes";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const domain = extractDomainFromFilename(filename);

    // Best-effort: flush the journal to the zone file before reading it
    // so the file reflects BIND's in-memory state. This prevents stale
    // diffs when the user makes a second edit after a previous nsupdate
    // (records that were added via nsupdate but never made it to the file
    // would otherwise be invisible to the GUI's diff logic).
    try {
        await sync(domain, true);
    } catch (err) {
        // Zone may not be dynamic, or rndc may not be reachable. The GET
        // should still work, so swallow the error and read whatever is on
        // disk.
        if (!(err instanceof RndcError)) {
            console.warn(`Best-effort sync of ${domain} failed:`, err);
        }
    }

    const content = readZoneFile(filename);
    if (!content) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const parsed = parseZoneFile(filename, content);
        return NextResponse.json(parsed);
    } catch (err) {
        console.error(`Failed to parse ${filename}:`, err);
        return NextResponse.json({ error: "Parse failed" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const body = await req.json();
    const records: DnsRecord[] = body.records ?? [];

    const domain = extractDomainFromFilename(filename);

    // Same best-effort sync as GET: make sure the on-disk file reflects
    // BIND's in-memory state before we diff against it.
    try {
        await sync(domain, true);
    } catch (err) {
        if (!(err instanceof RndcError)) {
            console.warn(`Best-effort sync of ${domain} before PUT failed:`, err);
        }
    }

    // Read current zone file to diff against the incoming records
    const rawContent = readZoneFile(filename);
    if (!rawContent) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = parseZoneFile(filename, rawContent);
    const currentRecords = parsed.records ?? [];
    const zone = parsed.domain;

    // Compute the minimal set of nsupdate operations
    const ops = diffRecords(zone, currentRecords, records);

    if (ops.length === 0) {
        return NextResponse.json({ success: true, applied: 0 });
    }

    const commands = opsToCommands(ops);

    try {
        await applyTransaction(commands);
    } catch (err) {
        console.error(`nsupdate failed for ${filename}:`, err);
        return NextResponse.json(
            {
                error: "Dynamic update failed. Check BIND logs for details.",
                detail: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        );
    }

    // Flush the journal again so the file is current. If this fails,
    // it's not fatal — the next save will retry.
    try {
        await sync(domain, true);
    } catch (err) {
        if (!(err instanceof RndcError)) {
            console.warn(`Post-save sync of ${domain} failed:`, err);
        }
    }

    // Fetch the new serial to confirm the update took effect
    let newSerial: number | null = null;
    try {
        const status = await zoneStatus(zone);
        newSerial = status.serial;
    } catch {
        // best-effort — serial is informational
    }

    return NextResponse.json({
        success: true,
        applied: ops.length,
        serial: newSerial,
    });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const domain = extractDomainFromFilename(filename);

    // Best-effort rndc delzone. It's OK if this fails — the zone may
    // never have been registered with BIND (the case for orphan zone
    // files that were created via the older broken create flow). The
    // file removal + named.conf.local edit is what actually unhooks
    // the zone; rndc delzone is a courtesy.
    let rndcWarning: string | null = null;
    try {
        await delZone(domain);
    } catch (err) {
        const msg = err instanceof RndcError
            ? (err.stderr || err.message)
            : (err instanceof Error ? err.message : String(err));
        console.warn(`rndc delzone failed for "${domain}" (continuing): ${msg}`);
        rndcWarning = msg;
    }

    // Remove the zone from named.conf.local so the next rndc reconfig
    // unloads it from BIND. (This is the authoritative way to delete a
    // static zone — no need for `allow-new-zones`.)
    const unregistered = unregisterZoneFromNamedConfLocal(domain);
    if (!unregistered) {
        return NextResponse.json(
            {
                error: "Failed to remove zone from named.conf.local.",
            },
            { status: 500 }
        );
    }

    // Reload the config so BIND drops the zone.
    try {
        await reconfig();
    } catch (err) {
        // If reconfig fails, the file removal will still go through but
        // BIND may keep serving the zone until the next reload. We
        // proceed because the file is gone and the named.conf.local is
        // updated — the user's intent is captured.
        console.warn(`rndc reconfig failed after unregistering ${domain}:`, err);
    }

    // Remove the on-disk zone file. This is what the user actually
    // asked for: the file to be gone.
    const fileRemoved = deleteZoneFile(filename);
    if (!fileRemoved) {
        return NextResponse.json(
            {
                error: "Zone was removed from BIND and named.conf.local, but the on-disk file could not be deleted.",
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        warning: rndcWarning, // surfaced for transparency, not as an error
    });
}

function extractDomainFromFilename(filename: string): string {
    const match = filename.match(/^db\.(.+)$/);
    return match ? match[1] : filename.replace(/^db\./, "");
}
