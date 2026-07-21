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

    // Parse $TTL
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith("$TTL")) {
            const match = line.match(/\$TTL\s+(\d+)/i);
            if (match) ttl = parseInt(match[1], 10);
            continue;
        }

        // Skip comments and empty lines
        if (!line || line.startsWith(";") || line.endsWith("(")) continue;

        // SOA record is handled specially - skip it in the loop
        if (line.includes("SOA")) continue;
        if (/\)/.test(line.trim()) && !line.includes("Minimum TTL")) continue;
        // Timing parameters inside SOA block
        if (/^\d+\s+;/.test(line)) continue;

        // Parse regular records
        const record = parseRecordLine(line, ttl);
        if (record) records.push(record);
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
    records?: DnsRecord[];
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
    const nsRecords = records.filter((r) => r.type === "NS");
    const aRecords = records.filter((r) => r.type === "A");
    const cnameRecords = records.filter((r) => r.type === "CNAME");
    const mxRecords = records.filter((r) => r.type === "MX");
    const txtRecords = records.filter((r) => r.type === "TXT");
    const ptrRecords = records.filter((r) => r.type === "PTR");
    const otherRecords = records.filter(
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
