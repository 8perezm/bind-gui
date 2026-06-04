export interface DnsRecord {
    id: string;
    name: string; // @ for SOA/NS/A at apex, * for wildcard, or subdomain label
    type: RecordType;
    ttl?: number;
    data: string;
    comment?: string;
}

export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "PTR" | "NS" | "SOA";

export const RECORD_TYPES: RecordType[] = [
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "TXT",
    "PTR",
    "NS",
];

export interface ZoneFile {
    filename: string;
    domain: string;
    ttl: number;
    soaPrimaryNs: string;
    soaAdminEmail: string;
    serial: string;
    refresh: number;
    retry: number;
    expire: number;
    minimumTtl: number;
    records: DnsRecord[];
    rawContent: string;
}

export interface ConfigFileInfo {
    filename: string;
    content: string;
}
