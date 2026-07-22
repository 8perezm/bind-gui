import type { DnsRecord, ZoneFile } from "./dnsTypes";

const DEFAULT_TTL = 86400;

export function parseZoneFile(filename: string, content: string): ZoneFile {
    const lines = content.split("\n");
    const domain = extractDomainFromFilename(filename);

    let ttl = DEFAULT_TTL;
    let soaPrimaryNs = "";
    let soaAdminEmail = "";
    let serial = "2024010101";
    let refresh = 3600;
    let retry = 1800;
    let expire = 604800;
    let minimumTtl = 86400;
    const records: DnsRecord[] = [];

    // BIND rewrites zone files after `rndc sync` with a different format:
    // it uses $ORIGIN directives and omits the owner name on lines that
    // inherit from the previous resource-record line. Track the current
    // owner so we can reconstruct fully-qualified record lines.
    let lastKnownOwner: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const line = originalLine.trim();

        if (line.startsWith("$TTL")) {
            const match = line.match(/\$TTL\s+(\d+)/i);
            if (match) ttl = parseInt(match[1], 10);
            continue;
        }

        // Skip comments, empty lines, and $ORIGIN directives
        if (!line || line.startsWith(";") || line.startsWith("$")) continue;

        // Detect lines where BIND omitted the owner name (they inherit
        // from the last explicit owner). These lines begin with whitespace.
        const hasImplicitOwner =
            originalLine.length > 0 && /^[ \t]/.test(originalLine);

        // SOA record — extract the owner name before skipping it so
        // subsequent implicit-owner lines can inherit it.
        if (line.includes("SOA") && line.toUpperCase().includes("SOA")) {
            if (!hasImplicitOwner) {
                const soaParts = line.split(/\s+/);
                if (soaParts.length > 0 && soaParts[0] !== "IN") {
                    lastKnownOwner = normalizeOwner(soaParts[0], domain);
                }
            }
            continue;
        }

        // Closing parenthesis of a multi-line SOA, or timing params inside one
        if (/\)/.test(line) && !line.includes("Minimum TTL")) continue;
        if (/^\d+\s+;/.test(line)) continue;

        // Reconstruct the effective record line: if BIND omitted the
        // owner, prepend the last known owner so parseRecordLine sees a
        // complete three-field line (name type data).
        const effectiveLine =
            hasImplicitOwner && lastKnownOwner
                ? `${lastKnownOwner} ${line}`
                : line;

        // Parse regular records
        const record = parseRecordLine(effectiveLine, ttl);
        if (record) {
            // Normalise FQDNs that match the zone apex back to "@" so
            // the frontend & diff logic see stable record names.
            record.name = normalizeOwner(record.name, domain);

            if (!hasImplicitOwner) {
                lastKnownOwner = record.name;
            }
            records.push(record);
        }
    }

    return {
        filename,
        domain,
        ttl,
        soaPrimaryNs,
        soaAdminEmail,
        serial,
        refresh,
        retry,
        expire,
        minimumTtl,
        records,
        rawContent: content,
    };
}

function extractDomainFromFilename(filename: string): string {
    // db.foo.esuyo.com -> foo.esuyo.com
    const match = filename.match(/^db\.(.+)$/);
    if (match) return match[1];

    // db.192.168.5 -> 192.168.5 reverse zone
    if (filename.startsWith("db.")) return filename.replace(/^db\./, "");
    return filename;
}

/**
 * Normalise an owner name to `@` when it matches the zone apex.
 * BIND's `rndc sync` rewrites zone files using the full FQDN (e.g.
 * `test.com`) instead of `@`, but downstream consumers (frontend,
 * diff logic) expect `@` for apex records. Strips any trailing dot
 * before comparing to the domain.
 */
function normalizeOwner(owner: string, domain: string): string {
    const stripped = owner.endsWith(".") ? owner.slice(0, -1) : owner;
    if (stripped === domain) return "@";
    return owner;
}

function parseRecordLine(
    line: string,
    defaultTtl: number
): DnsRecord | null {
    let comment = "";
    const commentIdx = line.indexOf(";");
    if (commentIdx !== -1) {
        comment = line.substring(commentIdx + 1).trim();
        line = line.substring(0, commentIdx).trim();
    }

    if (!line || /^\)/.test(line.trim())) return null;

    // Remove trailing ) if present
    line = line.replace(/\)\s*$/, "").trim();

    // Split into tokens respecting whitespace
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;

    let idx = 0;
    let name = "@";
    let typeStr: string = "";
    let dataParts: string[] = [];

    // First token is always the name/owner
    name = parts[idx++];

    // Check for IN class
    if (idx < parts.length && parts[idx].toUpperCase() === "IN") {
        idx++;
    }

    // Next should be record type
    typeStr = parts[idx++]?.toUpperCase() ?? "";

    // Rest is data
    dataParts = parts.slice(idx);
    const data = dataParts.join(" ");

    if (!typeStr || !data) return null;

    const id = `${name}-${typeStr}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return { id, name, type: typeStr as DnsRecord["type"], ttl: defaultTtl, data, comment };
}

export function serializeZoneFile(zone: ZoneFile): string {
    const lines: string[] = [];

    lines.push(`$TTL    ${zone.ttl}`);
    lines.push("");

    // SOA block - simplified reconstruction from raw content
    const soaMatch = zone.rawContent.match(/\$TTL[\s\S]{0,500}/m);
    if (soaMatch) {
        const soaLines = soaMatch[0]
            .split("\n")
            .filter((l) => l.trim());
        lines.push(...soaLines.map((l) => l + "\n"));
    } else {
        // Fallback: generate minimal SOA
        lines.push(
            `@       IN      NS      ${zone.soaPrimaryNs || "ns1." + zone.domain}.`
        );
    }

    lines.push("");

    // Records grouped by type for readability
    const nsRecords = zone.records.filter((r) => r.type === "NS");
    const aRecords = zone.records.filter((r) => r.type === "A");
    const cnameRecords = zone.records.filter((r) => r.type === "CNAME");
    const mxRecords = zone.records.filter((r) => r.type === "MX");
    const txtRecords = zone.records.filter((r) => r.type === "TXT");
    const ptrRecords = zone.records.filter((r) => r.type === "PTR");
    const otherRecords = zone.records.filter(
        (r) => !["NS", "A", "CNAME", "MX", "TXT", "PTR"].includes(r.type)
    );

    if (nsRecords.length) {
        lines.push("; Name servers");
        for (const rec of nsRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (aRecords.length) {
        lines.push("; A records");
        for (const rec of aRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (cnameRecords.length) {
        lines.push("; CNAME records");
        for (const rec of cnameRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (mxRecords.length) {
        lines.push("; MX records");
        for (const rec of mxRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (txtRecords.length) {
        lines.push("; TXT records");
        for (const rec of txtRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (ptrRecords.length) {
        lines.push("; PTR records");
        for (const rec of ptrRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (otherRecords.length) {
        lines.push("; Other records");
        for (const rec of otherRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
}

function formatRecord(record: DnsRecord): string {
    const comment = record.comment ? ` ; ${record.comment}` : "";
    return `${padRight(record.name, 8)} IN      ${padRight(record.type, 6)}${record.data}${comment}`;
}

/** Generate a stable id for a freshly-constructed record. */
function makeRecordId(name: string, type: string): string {
    return `${name}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function padRight(str: string, len: number): string {
    while (str.length < len) str += " ";
    return str;
}

export interface NewZoneOptions {
    domain: string;
    soaPrimaryNs?: string;
    soaAdminEmail?: string;
    ttl?: number;
    refresh?: number;
    retry?: number;
    expire?: number;
    minimumTtl?: number;
    /**
     * Initial records to seed the zone with. `id` is generated
     * server-side; callers don't need to provide one. `comment` is
     * optional and defaults to none.
     */
    records?: Array<Omit<DnsRecord, "id"> & { id?: string }>;
}

/** Generate serial number in YYYYMMDDNN format */
function generateSerial(): string {
    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
    const nn = String(Math.floor(Math.random() * 99)).padStart(2, "0");
    return `${yyyymmdd}${nn}`;
}

/** Generate a complete BIND zone file content from scratch (no rawContent needed) */
export function generateZoneFile(options: NewZoneOptions): string {
    const {
        domain,
        soaPrimaryNs = `ns1.${domain}.`,
        soaAdminEmail = `admin.${domain}.`,
        ttl = DEFAULT_TTL,
        refresh = 3600,
        retry = 1800,
        expire = 604800,
        minimumTtl = 86400,
        records = [],
    } = options;

    const serial = generateSerial();
    const lines: string[] = [];

    // $TTL directive
    lines.push(`$TTL    ${ttl}`);
    lines.push("");

    // SOA block - fully generated
    lines.push(`@       IN      SOA     ${soaPrimaryNs} ${soaAdminEmail} (`);
    lines.push(`                        ${serial}      ; Serial`);
    lines.push(`                        ${refresh}            ; Refresh`);
    lines.push(`                        ${retry}            ; Retry`);
    lines.push(`                        ${expire}          ; Expire`);
    lines.push(`                        ${minimumTtl} )         ; Minimum TTL`);
    lines.push("");

    // BIND refuses to load a zone with no NS records, so always emit
    // the apex NS pointing at the SOA primary NS. If the primary NS
    // is in-bailiwick (e.g. `ns1.example.com` for zone `example.com`)
    // the user must also add a glue A record via the record editor,
    // otherwise BIND's strict checks will still reject the zone with
    // "NS has no address records".
    //
    // Normalise the caller-provided records so each has a stable `id`
    // (the DnsRecord type requires one for downstream consumers like
    // formatRecord). The frontend uses (name|type|data) as a composite
    // identity so the random id here never causes a duplicate detection
    // mismatch.
    const withIds: DnsRecord[] = records.map((r) => ({
        ...r,
        id: r.id ?? makeRecordId(r.name, r.type),
    }));
    const nsRecords = withIds.filter((r) => r.type === "NS");
    const aRecords = withIds.filter((r) => r.type === "A");
    const cnameRecords = withIds.filter((r) => r.type === "CNAME");
    const mxRecords = withIds.filter((r) => r.type === "MX");
    const txtRecords = withIds.filter((r) => r.type === "TXT");
    const ptrRecords = withIds.filter((r) => r.type === "PTR");
    const otherRecords = withIds.filter(
        (r) => !["NS", "A", "CNAME", "MX", "TXT", "PTR"].includes(r.type)
    );

    if (nsRecords.length === 0) {
        // Default apex NS pointing at the SOA primary NS. Always emit
        // this when the caller didn't supply their own NS records.
        lines.push("; Name servers");
        lines.push(`@       IN      NS      ${soaPrimaryNs}`);
        lines.push("");
    } else {
        lines.push("; Name servers");
        for (const rec of nsRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (aRecords.length) {
        lines.push("; A records");
        for (const rec of aRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (cnameRecords.length) {
        lines.push("; CNAME records");
        for (const rec of cnameRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (mxRecords.length) {
        lines.push("; MX records");
        for (const rec of mxRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (txtRecords.length) {
        lines.push("; TXT records");
        for (const rec of txtRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (ptrRecords.length) {
        lines.push("; PTR records");
        for (const rec of ptrRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    if (otherRecords.length) {
        lines.push("; Other records");
        for (const rec of otherRecords) {
            lines.push(formatRecord(rec));
        }
        lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
}
