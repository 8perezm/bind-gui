"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Copy, Check } from "lucide-react";

interface ZoneStatus {
    name: string;
    type: string;
    serial: number | null;
    dynamic: boolean;
    journal: boolean;
    inlineSigning: boolean;
    keyDirectory: string | null;
    keyMaintenance: string | null;
    nextKeyEvent: string | null;
    raw: Record<string, string>;
}

interface DsInfo {
    cds: string | null;
    cdnskey: string | null;
    dsRecord: string | null;
}

export default function DnssecPage() {
    const params = useParams();
    const router = useRouter();
    const filename = decodeURIComponent(params.filename as string);
    const domain = extractDomain(filename);

    const [status, setStatus] = useState<ZoneStatus | null>(null);
    const [ds, setDs] = useState<DsInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/zones/${encodeURIComponent(filename)}/dnssec`)
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    setError(data.error);
                } else {
                    setStatus(data.status);
                    setDs(data.ds);
                }
                setLoading(false);
            })
            .catch(() => {
                setError("Failed to load DNSSEC status");
                setLoading(false);
            });
    }, [filename]);

    async function handleToggle() {
        if (!status) return;
        setToggling(true);
        setError(null);

        const action = status.inlineSigning ? "disable" : "enable";

        try {
            const res = await fetch(
                `/api/zones/${encodeURIComponent(filename)}/dnssec`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action }),
                }
            );
            const data = await res.json();
            if (res.ok) {
                setStatus(data.status);
                setDs(data.ds);
            } else {
                const detail = data.stderr ? `: ${data.stderr}` : "";
                setError(`${data.error || `Failed to ${action} DNSSEC`}${detail}`);
            }
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setToggling(false);
        }
    }

    async function copyToClipboard(text: string, field: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch {
            // fallback
        }
    }

    if (loading) {
        return (
            <div className="py-32 flex items-center justify-center gap-3 font-mono text-sm tracking-widest uppercase text-mutedForeground">
                <Loader2 size={16} className="animate-spin" />
                Loading DNSSEC status...
            </div>
        );
    }

    if (error && !status) {
        return (
            <div className="space-y-8 py-16">
                <Link
                    href={`/edit/${encodeURIComponent(filename)}`}
                    className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 transition-colors duration-INSTANT"
                >
                    <ArrowLeft size={16} strokeWidth={1.5} />
                    {domain}
                </Link>
                <h1 className="font-heading text-5xl md:text-7xl tracking-tighter leading-none">
                    Not Found
                </h1>
                <p className="text-mutedForeground max-w-lg">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            {/* Back link & title */}
            <section>
                <Link
                    href={`/edit/${encodeURIComponent(filename)}`}
                    className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 mb-6 transition-colors duration-INSTANT"
                >
                    <ArrowLeft size={16} strokeWidth={1.5} />
                    {domain}
                </Link>
                <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none mb-2">
                    DNSSEC
                </h1>
                <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mt-2">
                    {filename}
                </p>
            </section>

            {/* Error banner */}
            {error && (
                <p className="text-red-600 font-mono text-sm uppercase tracking-wider border-l-2 border-red-600 pl-3">
                    {error}
                </p>
            )}

            {/* Status & Toggle */}
            <section className="border-b-4 border-black pb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-heading text-3xl tracking-tight">
                            DNSSEC:{" "}
                            <span
                                className={
                                    status?.inlineSigning
                                        ? "text-black"
                                        : "text-mutedForeground"
                                }
                            >
                                {status?.inlineSigning ? "ENABLED" : "DISABLED"}
                            </span>
                        </p>
                        <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mt-1">
                            BIND inline-signing &mdash; keys stored alongside zone files
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="font-mono text-xs tracking-wider uppercase">
                            {status?.inlineSigning ? "Enabled" : "Disabled"}
                        </span>
                        <Switch
                            checked={status?.inlineSigning ?? false}
                            onCheckedChange={handleToggle}
                            disabled={toggling}
                        />
                    </div>
                </div>
            </section>

            {/* Zone details */}
            <section>
                <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                    Zone Status
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <DetailBox label="Type" value={status?.type ?? "—"} />
                    <DetailBox
                        label="Serial"
                        value={status?.serial?.toString() ?? "—"}
                    />
                    <DetailBox
                        label="Dynamic"
                        value={status?.dynamic ? "Yes" : "No"}
                    />
                    <DetailBox
                        label="Journal"
                        value={status?.journal ? "Yes" : "No"}
                    />
                    {status?.keyDirectory && (
                        <DetailBox label="Key Directory" value={status.keyDirectory} />
                    )}
                    {status?.keyMaintenance && (
                        <DetailBox label="Key Maintenance" value={status.keyMaintenance} />
                    )}
                    {status?.nextKeyEvent && (
                        <DetailBox label="Next Key Event" value={status.nextKeyEvent} />
                    )}
                </div>
            </section>

            {/* DS / CDS / CDNSKEY panel */}
            {ds && (
                <section>
                    <h2 className="font-heading text-2xl tracking-tight mb-4 uppercase">
                        Delegation Signer (DS) Info
                    </h2>
                    <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mb-6">
                        Publish the DS record at your registrar to complete the chain of trust.
                        RFC 8078 (CDS/CDNSKEY automation) depends on registrar support.
                    </p>
                    <div className="space-y-6">
                        {ds.cds && (
                            <RecordBlock
                                label="CDS"
                                value={ds.cds}
                                copiedField={copiedField}
                                onCopy={copyToClipboard}
                            />
                        )}
                        {ds.cdnskey && (
                            <RecordBlock
                                label="CDNSKEY"
                                value={ds.cdnskey}
                                copiedField={copiedField}
                                onCopy={copyToClipboard}
                            />
                        )}
                        {ds.dsRecord && (
                            <RecordBlock
                                label="DS Record"
                                value={ds.dsRecord}
                                copiedField={copiedField}
                                onCopy={copyToClipboard}
                            />
                        )}
                        {!ds.cds && !ds.cdnskey && !ds.dsRecord && (
                            <div className="text-mutedForeground font-mono text-sm space-y-2">
                                <p>
                                    No DS/CDS/CDNSKEY records found. The zone has not finished signing yet.
                                </p>
                                {status?.keyMaintenance === "automatic" && status?.nextKeyEvent && (
                                    <p className="text-amber-800 text-xs space-y-1">
                                        BIND is configured for automatic key maintenance. Keys are
                                        scheduled to be generated at{" "}
                                        <strong>{status.nextKeyEvent}</strong>.
                                        Once generated, the zone will be signed and DS records will
                                        appear in the block above — click <strong>Copy</strong> and
                                        paste it into your registrar&apos;s DNSSEC management section.
                                        This is a one-time delay; subsequent key events only cover
                                        rollover. If you don&apos;t want to wait, toggle DNSSEC off
                                        and back on — this reschedules the event closer to now.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}

function DetailBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-2 border-black p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-mutedForeground mb-1">
                {label}
            </p>
            <p className="font-mono text-sm break-all">{value}</p>
        </div>
    );
}

function RecordBlock({
    label,
    value,
    copiedField,
    onCopy,
}: {
    label: string;
    value: string;
    copiedField: string | null;
    onCopy: (text: string, field: string) => void;
}) {
    const isCopied = copiedField === label;
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs uppercase tracking-widest text-mutedForeground">
                    {label}
                </span>
                <button
                    onClick={() => onCopy(value, label)}
                    className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider hover:underline underline-offset-2 transition-colors duration-INSTANT"
                >
                    {isCopied ? (
                        <>
                            <Check size={14} strokeWidth={1.5} /> Copied
                        </>
                    ) : (
                        <>
                            <Copy size={14} strokeWidth={1.5} /> Copy
                        </>
                    )}
                </button>
            </div>
            <pre className="font-mono text-sm leading-relaxed bg-muted p-4 overflow-x-auto whitespace-pre-wrap border-2 border-black">
                {value}
            </pre>
        </div>
    );
}

function extractDomain(filename: string): string {
    const match = filename.match(/^db\.(.+)$/);
    return match ? match[1] : filename.replace(/^db\./, "");
}
