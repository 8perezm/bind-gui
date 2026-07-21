import { NextResponse } from "next/server";
import {
    listZoneFiles,
    readZoneFile,
    createZoneFile,
    deleteZoneFile,
    registerZoneInNamedConfLocal,
    unregisterZoneFromNamedConfLocal,
    setInlineSigningInNamedConfLocal,
} from "@/lib/fileSystem";
import { parseZoneFile, generateZoneFile } from "@/lib/dnsParser";
import { addZone, reconfig, RndcError } from "@/lib/rndc";

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
        const { domain, primaryNs, adminEmail, ttl, inlineSigning } = body as {
            domain: string;
            primaryNs?: string;
            adminEmail?: string;
            ttl?: number;
            inlineSigning?: boolean;
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

        // Register the zone in named.conf.local. This is what makes BIND
        // actually serve the zone after `rndc reconfig`. It's idempotent,
        // safe, and works on any BIND deployment (no `allow-new-zones`
        // required — that's only needed for `rndc addzone`).
        const registered = registerZoneInNamedConfLocal(domain);
        if (!registered) {
            deleteZoneFile(filename);
            return NextResponse.json(
                { error: "Failed to register zone in named.conf.local" },
                { status: 500 }
            );
        }

        if (inlineSigning) {
            const toggled = setInlineSigningInNamedConfLocal(domain, true);
            if (!toggled) {
                // Roll back
                unregisterZoneFromNamedConfLocal(domain);
                deleteZoneFile(filename);
                return NextResponse.json(
                    { error: "Failed to enable inline-signing in named.conf.local" },
                    { status: 500 }
                );
            }
        }

        // Ask BIND to re-read named.conf so the new zone block is loaded.
        // Try `reconfig` first (non-disruptive). If that fails because the
        // BIND deployment requires `allow-new-zones` for newly-introduced
        // zones via reconfig, fall back to `rndc addzone`. If both fail,
        // roll back so the user isn't left with an orphan.
        let loaded = false;
        let lastError: string | null = null;

        try {
            await reconfig();
            loaded = true;
        } catch (reconfigErr) {
            lastError = reconfigErr instanceof Error ? reconfigErr.message : String(reconfigErr);
            console.warn(`rndc reconfig failed for "${domain}", falling back to addzone:`, reconfigErr);
            try {
                await addZone(domain, { inlineSigning });
                loaded = true;
            } catch (addzoneErr) {
                lastError = addzoneErr instanceof Error ? addzoneErr.message : String(addzoneErr);
                if (addzoneErr instanceof RndcError) lastError = addzoneErr.stderr || lastError;
            }
        }

        if (!loaded) {
            // Roll back: remove the zone from named.conf.local and delete the file.
            unregisterZoneFromNamedConfLocal(domain);
            deleteZoneFile(filename);
            return NextResponse.json(
                {
                    error: "BIND would not load the new zone. The zone was not created. Ensure rndc can reach BIND and the controls block in named.conf allows this host.",
                    detail: lastError,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { success: true, filename, domain },
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
