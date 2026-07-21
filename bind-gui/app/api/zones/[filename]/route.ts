import { NextRequest, NextResponse } from "next/server";
import { deleteZoneFile, readZoneFile, writeZoneFile, unregisterZoneFromNamedConfLocal } from "@/lib/fileSystem";
import { parseZoneFile, serializeZoneFile } from "@/lib/dnsParser";
import { restartDockerContainer } from "@/lib/restartContainer";
import type { DnsRecord } from "@/lib/dnsTypes";

const BIND_CONTAINER_NAME = "bind9";

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

    // Read current file and rebuild with updated records
    const rawContent = readZoneFile(filename);
    if (!rawContent) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = parseZoneFile(filename, rawContent);
    parsed.records = records;

    const serialized = serializeZoneFile(parsed);
    const success = writeZoneFile(filename, serialized);

    if (!success) {
        return NextResponse.json({ error: "Write failed" }, { status: 500 });
    }

    // Restart the BIND container so it picks up the updated zone file
    const result = await restartDockerContainer(BIND_CONTAINER_NAME);

    if (!result.success) {
        console.error(`Failed to restart BIND container: ${result.error}`);
    }

    return NextResponse.json({
        success: true,
        containerRestarted: result.success,
        containerError: result.error ?? null,
    });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params;
    const domain = extractDomainFromFilename(filename);
    const success = deleteZoneFile(filename);

    if (!success) {
        return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    // Also remove the zone from named.conf.local
    unregisterZoneFromNamedConfLocal(domain);

    return NextResponse.json({ success: true });
}

function extractDomainFromFilename(filename: string): string {
    const match = filename.match(/^db\.(.+)$/);
    return match ? match[1] : filename.replace(/^db\./, "");
}
