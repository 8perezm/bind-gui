import { NextRequest, NextResponse } from "next/server";
import { deleteZoneFile, readZoneFile } from "@/lib/fileSystem";
import { parseZoneFile } from "@/lib/dnsParser";
import { diffRecords, opsToCommands } from "@/lib/dnsDiff";
import { applyTransaction } from "@/lib/nsupdate";
import { delZone, zoneStatus } from "@/lib/rndc";
import type { DnsRecord } from "@/lib/dnsTypes";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
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

    // Remove the zone from the running BIND first via rndc
    try {
        await delZone(domain);
    } catch (err) {
        console.error(`rndc delzone failed for "${domain}":`, err);
        return NextResponse.json(
            {
                error: "Failed to remove zone from BIND. Check that bind-gui.key exists and rndc can reach the bind9 container.",
                detail: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        );
    }

    // Remove the on-disk zone file
    const fileRemoved = deleteZoneFile(filename);
    if (!fileRemoved) {
        console.warn(
            `Zone file ${filename} not found or could not be deleted (zone was removed from BIND).`,
        );
    }

    return NextResponse.json({ success: true });
}

function extractDomainFromFilename(filename: string): string {
    const match = filename.match(/^db\.(.+)$/);
    return match ? match[1] : filename.replace(/^db\./, "");
}
