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
import { addZone, reconfig, zoneStatus, RndcError } from "@/lib/rndc";

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
        const {
            domain,
            primaryNs,
            adminEmail,
            ttl,
            inlineSigning,
            nameserverIp,
        } = body as {
            domain: string;
            primaryNs?: string;
            adminEmail?: string;
            ttl?: number;
            inlineSigning?: boolean;
            nameserverIp?: string;
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

        // Validate nameserver IP if provided (a glue A record is only
        // useful when the IP is syntactically valid).
        if (nameserverIp !== undefined && nameserverIp !== null && nameserverIp !== "") {
            if (
                !/^(\d{1,3}\.){3}\d{1,3}$/.test(nameserverIp) ||
                !nameserverIp.split(".").every((o) => {
                    const n = parseInt(o, 10);
                    return n >= 0 && n <= 255;
                })
            ) {
                return NextResponse.json(
                    { error: "Nameserver IP must be a valid IPv4 address (e.g. 192.0.2.1)." },
                    { status: 400 }
                );
            }
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

        const soaPrimaryNs = primaryNs || `ns1.${domain}.`;
        const soaAdminEmail = adminEmail || `admin.${domain}.`;

        // If a glue IP was provided, the nameserver is in-bailiwick and
        // we need an A record for it in the generated zone file. BIND
        // refuses to load a zone whose in-bailiwick NS has no address
        // records, so without this glue the new zone would be silently
        // dropped by `rndc reconfig` and the user would see a 201
        // success but `rndc zonestatus` would say "not loaded".
        const extraRecords: { name: string; type: "A" | "AAAA"; ttl: number; data: string }[] = [];
        if (nameserverIp) {
            // The NS name in the zone block is `soaPrimaryNs`, e.g.
            // `ns1.example.com.`. Inside the zone (which has apex
            // `example.com.`), the owner name is the leading label(s)
            // that aren't part of the zone apex — just `ns1` in the
            // common case. We strip the trailing dot and the zone
            // suffix (without its dot) to compute the owner name.
            const nsLabel = soaPrimaryNs.endsWith(".")
                ? soaPrimaryNs.slice(0, -1)
                : soaPrimaryNs;
            const apex = domain; // apex has no trailing dot
            let ownerName: string;
            if (nsLabel === apex) {
                ownerName = "@";
            } else if (nsLabel.endsWith(`.${apex}`)) {
                ownerName = nsLabel.slice(0, -(`.${apex}`).length);
            } else {
                // External NS — no glue needed. We still emit the A
                // record at the FQDN, which BIND accepts, but it
                // won't be useful until the parent zone has a
                // matching delegation.
                ownerName = nsLabel;
            }
            extraRecords.push({
                name: ownerName,
                type: "A",
                ttl: ttl ?? 86400,
                data: nameserverIp,
            });
        }

        // Generate zone file content with SOA block + NS apex + optional glue.
        const content = generateZoneFile({
            domain,
            soaPrimaryNs,
            soaAdminEmail,
            ttl: ttl ?? 86400,
            records: extraRecords,
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

        // `reconfig` and `addzone` both report "success" even if BIND
        // silently dropped the new zone due to a load error (e.g. an
        // in-bailiwick NS without glue). Verify the zone is actually
        // loaded before we tell the user "201 Created" — otherwise the
        // zone would appear in the GUI's list but `rndc zonestatus`
        // would say "not loaded", which is the silent-failure mode that
        // caught the user out before this fix.
        try {
            await zoneStatus(domain);
        } catch (statusErr) {
            // Roll back so the user is not left with an orphan that
            // can't be removed via the GUI.
            unregisterZoneFromNamedConfLocal(domain);
            deleteZoneFile(filename);
            const stderr =
                statusErr instanceof RndcError
                    ? statusErr.stderr || statusErr.message
                    : statusErr instanceof Error
                        ? statusErr.message
                        : String(statusErr);
            return NextResponse.json(
                {
                    error: `BIND accepted the zone registration but did not load the zone. The most common cause is an in-bailiwick NS without an A/AAAA glue record — provide a nameserver IP in the create dialog. (${stderr})`,
                    detail: stderr,
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
