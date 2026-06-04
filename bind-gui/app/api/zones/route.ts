import { NextResponse } from "next/server";
import { listZoneFiles, readZoneFile, createZoneFile, registerZoneInNamedConfLocal } from "@/lib/fileSystem";
import { parseZoneFile, generateZoneFile } from "@/lib/dnsParser";

export async function GET() {
    const zoneFilenames = listZoneFiles();
    const zones = [];

    for (const filename of zoneFilenames) {
        const content = readZoneFile(filename);
        if (!content) continue;
        try {
            const parsed = parseZoneFile(filename, content);
            zones.push({
                domain: parsed.domain,
                filename: parsed.filename,
                recordCount: parsed.records.length,
                records: parsed.records,
            });
        } catch (err) {
            console.error(`Failed to parse ${filename}:`, err);
        }
    }

    return NextResponse.json({ zones });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { domain, primaryNs, adminEmail, ttl } = body as {
            domain: string;
            primaryNs?: string;
            adminEmail?: string;
            ttl?: number;
        };

        if (!domain || typeof domain !== "string") {
            return NextResponse.json(
                { error: "Domain is required" },
                { status: 400 }
            );
        }

        // Validate domain - basic safety check (alphanumeric, dots, hyphens only)
        if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
            return NextResponse.json(
                { error: "Invalid domain name. Only letters, numbers, dots, and hyphens are allowed." },
                { status: 400 }
            );
        }

        const filename = `db.${domain}`;

        // Check for duplicate
        const existingFiles = listZoneFiles();
        if (existingFiles.includes(filename)) {
            return NextResponse.json(
                { error: `Zone file '${filename}' already exists` },
                { status: 409 }
            );
        }

        // Generate zone file content with SOA block
        const content = generateZoneFile({
            domain,
            soaPrimaryNs: primaryNs || `ns1.${domain}.`,
            soaAdminEmail: adminEmail || `admin.${domain}.`,
            ttl: ttl ?? 86400,
        });

        // Create the file on disk
        const success = createZoneFile(filename, content);

        if (!success) {
            return NextResponse.json(
                { error: "Failed to create zone file" },
                { status: 500 }
            );
        }

        // Register the zone in named.conf.local so BIND recognizes it
        const registered = registerZoneInNamedConfLocal(domain);
        if (!registered) {
            console.error(`Failed to register zone "${domain}" in named.conf.local`);
            // Zone file exists but config wasn't updated — warn but don't fail hard
        }

        return NextResponse.json(
            { success: true, filename, domain, registered },
            { status: 201 }
        );
    } catch (err) {
        console.error("POST /api/zones failed:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
