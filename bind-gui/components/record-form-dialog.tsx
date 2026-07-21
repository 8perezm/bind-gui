"use client";

import { useState, useEffect } from "react";
import type { DnsRecord, RecordType } from "@/lib/dnsTypes";
import { RECORD_TYPES } from "@/lib/dnsTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RecordFormDialogProps {
    trigger?: React.ReactNode;
    record?: DnsRecord | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSave: (record: Omit<DnsRecord, "id"> & { id?: string }) => void;
}

export default function RecordFormDialog({
    trigger = <Button variant="outline" size="sm">+ Add Record</Button>,
    record,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    onSave,
}: RecordFormDialogProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const [name, setName] = useState("@");
    const [type, setType] = useState<RecordType>("A");
    const [ttl, setTtl] = useState("86400");
    const [data, setData] = useState("");
    const [comment, setComment] = useState("");

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

    useEffect(() => {
        if (open) {
            if (record) {
                setName(record.name);
                setType(record.type as RecordType);
                setTtl(String(record.ttl ?? "86400"));
                setData(record.data);
                setComment(record.comment ?? "");
            } else {
                reset();
            }
        } else {
            reset();
        }
    }, [record, open]);

    function reset() {
        setName("@");
        setType("A");
        setTtl("86400");
        setData("");
        setComment("");
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSave({
            id: record?.id,
            name,
            type,
            ttl: parseInt(ttl, 10),
            data,
            comment: comment || undefined,
        });
        setOpen(false);
        if (!record) reset();
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && !record) reset(); }}>
            {!isControlled && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-md">
                <DialogTitle className="font-heading text-3xl tracking-tight mb-2">
                    {record ? "Edit Record" : "Add Record"}
                </DialogTitle>
                <DialogDescription className="text-mutedForeground text-sm mb-6">
                    {record
                        ? "Change a resource record. The change is sent to BIND via nsupdate when you click Save Zone on the zone page."
                        : "Add a new resource record to the zone. It is staged in the editor until you click Save Zone."}
                </DialogDescription>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Name">
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="@ or subdomain" />
                        </Field>
                        <Field label="Type">
                            <Select value={type} onValueChange={(v) => setType(v as RecordType)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {RECORD_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>

                    <Field label="TTL">
                        <Input type="text" inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="86400" />
                    </Field>

                    <Field label="Data">
                        <Input value={data} onChange={(e) => setData(e.target.value)} placeholder={type === "A" ? "192.168.1.1" : `Record data for ${type}`} required />
                    </Field>

                    <Field label="Comment">
                        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note..." />
                    </Field>

                    <div className="flex gap-3 pt-4 border-t-2 border-black mt-6">
                        <Button type="submit">{record ? "Save Changes" : "Add Record"}</Button>
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
