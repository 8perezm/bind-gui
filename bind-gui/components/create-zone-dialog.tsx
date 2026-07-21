"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

interface CreateZoneDialogProps {
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess: () => void;
}

export default function CreateZoneDialog({
    trigger = <Button variant="outline" size="sm">+ Create Zone</Button>,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    onSuccess,
}: CreateZoneDialogProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const [domain, setDomain] = useState("");
    const [primaryNs, setPrimaryNs] = useState("ns1.");
    const [adminEmail, setAdminEmail] = useState("admin.");
    const [nameserverIp, setNameserverIp] = useState("");
    const [ttl, setTtl] = useState("86400");
    const [inlineSigning, setInlineSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

    useEffect(() => {
        if (open) reset();
    }, [open]);

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

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!domain.trim()) return;

        setSaving(true);
        setError(null);

        try {
            const body: Record<string, unknown> = {
                domain: domain.trim(),
                primaryNs: `${primaryNs}${domain}.`,
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

            setOpen(false);
            reset();
            onSuccess();
        } catch (err) {
            console.error("Create zone failed:", err);
            setError("Network error. Please try again.");
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            {!isControlled && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-md">
                <DialogTitle className="font-heading text-3xl tracking-tight mb-2">
                    Create New Zone
                </DialogTitle>
                <DialogDescription className="text-mutedForeground text-sm mb-6">
                    Create a new authoritative DNS zone. The zone file is written to the
                    shared config directory and registered in named.conf.local.
                </DialogDescription>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <Field label="Domain Name">
                        <Input
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="example.com"
                            required
                            autoFocus
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
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

                    <p className="text-xs text-mutedForeground font-mono uppercase tracking-wide">
                        SOA: {primaryNs}{domain}. | Rfc822: {adminEmail}{domain}.
                    </p>

                    <Field label="TTL">
                        <Input
                            type="text"
                            inputMode="numeric"
                            value={ttl}
                            onChange={(e) => setTtl(e.target.value)}
                            placeholder="86400"
                        />
                    </Field>

                    <Field label={`${primaryNs}${domain}.  IP  (optional, glue A record)`}>
                        <Input
                            value={nameserverIp}
                            onChange={(e) => setNameserverIp(e.target.value)}
                            placeholder="192.0.2.1"
                        />
                    </Field>
                    <p className="text-xs text-mutedForeground font-mono uppercase tracking-wide -mt-3">
                        Required if the nameserver is in-bailiwick — BIND will not load
                        the zone otherwise.
                    </p>

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
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <Label>{label}</Label>
            {children}
        </div>
    );
}
