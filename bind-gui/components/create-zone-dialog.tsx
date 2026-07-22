"use client";

import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import Popover from "@/components/ui/popover";

interface CreateZoneDialogProps {
    onSuccess: () => void;
}

export default function CreateZoneDialog({ onSuccess }: CreateZoneDialogProps) {
    const [expanded, setExpanded] = useState(false);
    const [domain, setDomain] = useState("");
    const [primaryNs, setPrimaryNs] = useState("ns1.");
    const [adminEmail, setAdminEmail] = useState("admin.");
    const [nameserverIp, setNameserverIp] = useState("");
    const [ttl, setTtl] = useState("86400");
    const [inlineSigning, setInlineSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const formId = useId();

    const fullPrimaryNs = `${primaryNs}${domain}.`;

    function reset() {
        setDomain("");
        setPrimaryNs("ns1.");
        setAdminEmail("admin.");
        setNameserverIp("");
        setTtl("86400");
        setInlineSigning(false);
        setError(null);
        setSaving(false);
    }

    function toggleExpanded() {
        if (expanded) {
            setExpanded(false);
            reset();
        } else {
            setExpanded(true);
            setError(null);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!domain.trim()) return;

        // Check whether the primary NS lives inside the zone being
        // created — if so BIND needs a glue A record.
        const nsLabel = fullPrimaryNs.endsWith(".")
            ? fullPrimaryNs.slice(0, -1)
            : fullPrimaryNs;
        const apex = domain.trim();
        const isInBailiwick = nsLabel === apex || nsLabel.endsWith(`.${apex}`);
        if (isInBailiwick && !nameserverIp.trim()) {
            setError(
                `The nameserver ${fullPrimaryNs} is part of the zone you are creating. ` +
                "BIND requires an IP address for it — like a contact needs a phone number. " +
                "Fill in the IP field above and try again.",
            );
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const body: Record<string, unknown> = {
                domain: apex,
                primaryNs: fullPrimaryNs,
                adminEmail: `${adminEmail}${domain}.`,
                ttl: parseInt(ttl, 10),
                inlineSigning,
            };
            if (nameserverIp.trim()) {
                body.nameserverIp = nameserverIp.trim();
            }

            const res = await fetch("/api/zones", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const result = await res.json();

            if (!res.ok) {
                setError(result.error || "Failed to create zone");
                setSaving(false);
                return;
            }

            setExpanded(false);
            reset();
            onSuccess();
        } catch (err) {
            console.error("Create zone failed:", err);
            setError("Network error. Please try again.");
            setSaving(false);
        }
    }

    return (
        <div>
            {/* Toggle button */}
            <button
                type="button"
                onClick={toggleExpanded}
                className="inline-flex h-11 items-center gap-2 border-2 border-black bg-black px-5 text-sm font-mono uppercase tracking-[0.3em] text-white transition-colors duration-INSTANT hover:bg-white hover:text-black"
            >
                {expanded ? "Close" : "+ Create Zone"}
                {expanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
            </button>

            {/* Inline form */}
            {expanded && (
                <div className="mt-6 border-2 border-black bg-white p-6 md:p-8">
                    <h2 className="font-heading text-3xl tracking-tight mb-1">
                        Create New Zone
                    </h2>
                    <p className="text-mutedForeground text-sm mb-6">
                        Create a new authoritative DNS zone. The zone file is written to the
                        shared config directory and registered in named.conf.local.
                    </p>

                    <form id={formId} onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
                        <Field label="Domain Name">
                            <Input
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                placeholder="example.com"
                                required
                                autoFocus
                            />
                        </Field>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                            <Field label="Primary NS Prefix">
                                <Input
                                    value={primaryNs}
                                    onChange={(e) => setPrimaryNs(e.target.value)}
                                    placeholder="ns1."
                                />
                            </Field>
                            <Field label="Admin Email Prefix">
                                <Input
                                    value={adminEmail}
                                    onChange={(e) => setAdminEmail(e.target.value)}
                                    placeholder="admin."
                                />
                            </Field>
                        </div>

                        <p className="text-xs text-mutedForeground font-mono uppercase tracking-wide -mt-3">
                            SOA: {fullPrimaryNs} | Rfc822: {adminEmail}{domain}.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                            <Field label="TTL">
                                <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={ttl}
                                    onChange={(e) => setTtl(e.target.value)}
                                    placeholder="86400"
                                />
                            </Field>
                            <Field
                                label={
                                    <span className="inline-flex items-center gap-1.5">
                                        {fullPrimaryNs}  IP
                                        <Popover
                                            trigger={<Info size={14} strokeWidth={2.5} className="text-amber-700 cursor-pointer" />}
                                            align="end"
                                        >
                                            <p className="font-mono font-bold uppercase tracking-wide text-amber-900 mb-1">
                                                Why is this needed?
                                            </p>
                                            <p className="text-amber-800">
                                                Your nameserver <strong>{fullPrimaryNs}</strong> lives inside the zone you&apos;re
                                                creating — BIND needs an address for it, just like a contact in your phone needs a
                                                phone number. Without it, BIND will silently reject the zone.
                                            </p>
                                            <p className="text-amber-800 mt-1">
                                                If you change the &quot;Primary NS Prefix&quot; above to point to an external
                                                nameserver (e.g. <strong>ns1.cloudflare.com.</strong>), this IP is no longer needed.
                                            </p>
                                        </Popover>
                                    </span>
                                }
                            >
                                <Input
                                    value={nameserverIp}
                                    onChange={(e) => setNameserverIp(e.target.value)}
                                    placeholder="192.0.2.1"
                                />
                            </Field>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div>
                                <Label>DNSSEC (inline-signing)</Label>
                                <p className="text-xs text-mutedForeground font-mono mt-1">
                                    BIND signs the zone automatically. Publish the DS record at your registrar.
                                </p>
                            </div>
                            <Switch
                                checked={inlineSigning}
                                onCheckedChange={setInlineSigning}
                            />
                        </div>

                        {error && (
                            <p className="text-red-600 font-mono text-sm uppercase tracking-wider border-l-2 border-red-600 pl-3">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3 pt-4 border-t-2 border-black mt-6">
                            <Button type="submit" disabled={saving}>
                                {saving ? "Creating..." : "Create Zone"}
                            </Button>
                            <Button type="button" variant="ghost" onClick={toggleExpanded}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string | React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <Label>{label}</Label>
            {children}
        </div>
    );
}
