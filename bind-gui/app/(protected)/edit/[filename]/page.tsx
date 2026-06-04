"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { DnsRecord, ZoneFile } from "@/lib/dnsTypes";
import RecordTable from "@/components/record-table";
import RecordFormDialog from "@/components/record-form-dialog";
import ConfirmDialog from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

export default function EditZonePage() {
    const params = useParams();
    const router = useRouter();
    const filename = decodeURIComponent(params.filename as string);

    const [zone, setZone] = useState<ZoneFile | null>(null);
    const [records, setRecords] = useState<DnsRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [recordDialogOpen, setRecordDialogOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
    const [pendingDeleteRecord, setPendingDeleteRecord] = useState<DnsRecord | null>(null);
    const [deleteZoneOpen, setDeleteZoneOpen] = useState(false);
    const [deletingZone, setDeletingZone] = useState(false);

    useEffect(() => {
        fetch(`/api/zones/${encodeURIComponent(filename)}`)
            .then((res) => res.json())
            .then((data: ZoneFile) => {
                setZone(data);
                setRecords(data.records ?? []);
                setLoading(false);
            });
    }, [filename]);

    async function handleSave(recordData: Omit<DnsRecord, "id"> & { id?: string }) {
        if (recordData.id) {
            // Update existing record
            setRecords((prev) =>
                prev.map((r) =>
                    r.id === recordData.id ? { ...r, ...recordData } : r
                )
            );
        } else {
            // Add new record
            const newRecord: DnsRecord = {
                ...(recordData as any),
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            };
            setRecords((prev) => [...prev, newRecord]);
        }
    }

    function openNewRecord() {
        setEditingRecord(null);
        setRecordDialogOpen(true);
    }

    function openEditRecord(record: DnsRecord) {
        setEditingRecord(record);
        setRecordDialogOpen(true);
    }

    function requestDeleteRecord(record: DnsRecord) {
        setPendingDeleteRecord(record);
    }

    function confirmDeleteRecord() {
        if (!pendingDeleteRecord) return;
        setRecords((prev) => prev.filter((r) => r.id !== pendingDeleteRecord.id));
        setPendingDeleteRecord(null);
    }

    async function confirmDeleteZone() {
        setDeletingZone(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/zones/${encodeURIComponent(filename)}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push("/");
                router.refresh();
                return;
            }
            setMessage("Failed to delete zone. Check server logs.");
        } catch {
            setMessage("Network error. Please try again.");
        } finally {
            setDeletingZone(false);
            setDeleteZoneOpen(false);
        }
    }

    async function saveToServer() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/zones/${encodeURIComponent(filename)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ records }),
            });
            if (res.ok) {
                setMessage("Saved successfully");
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage("Failed to save. Check server logs.");
            }
        } catch {
            setMessage("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <LoadingState />;
    }

    if (!zone) {
        return <NotFound filename={filename} />;
    }

    return (
        <div className="space-y-12">
            {/* Back link & title */}
            <section>
                <Link href="/" className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 mb-6 transition-colors duration-INSTANT">
                    <ArrowLeft size={16} strokeWidth={1.5} />
                    Zones
                </Link>
                <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none mb-2">
                    {zone.domain}
                </h1>
                <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mt-2">
                    {filename} · TTL {zone.ttl}s · {records.length} records
                </p>
            </section>

            {/* Toolbar */}
            <section className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-black pb-6">
                <Button variant="outline" size="sm" onClick={openNewRecord}>+ Add Record</Button>
                <div className="flex items-center gap-3">
                    {message && (
                        <span className={`text-sm tracking-wider ${message.includes("success") ? "text-green-800" : "text-red-700"}`}>
                            {message}
                        </span>
                    )}
                    <Button variant="outline" onClick={() => setDeleteZoneOpen(true)}>
                        Delete Zone
                    </Button>
                    <Button onClick={saveToServer} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 size={16} className="mr-2 animate-spin" /> Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} className="mr-2" strokeWidth={1.5} /> Save Zone
                            </>
                        )}
                    </Button>
                </div>
            </section>

            {/* Records table */}
            <section>
                <h2 className="font-heading text-2xl tracking-tight mb-2 uppercase">Records</h2>
                <RecordTable records={records} onEdit={openEditRecord} onDelete={requestDeleteRecord} />
            </section>

            <RecordFormDialog
                open={recordDialogOpen}
                onOpenChange={(open) => {
                    setRecordDialogOpen(open);
                    if (!open) setEditingRecord(null);
                }}
                record={editingRecord}
                onSave={(recordData) => {
                    handleSave(recordData);
                    setRecordDialogOpen(false);
                    setEditingRecord(null);
                }}
            />

            <ConfirmDialog
                open={pendingDeleteRecord !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDeleteRecord(null);
                }}
                title="Are you sure?"
                description={pendingDeleteRecord ? `Delete the record ${pendingDeleteRecord.name} (${pendingDeleteRecord.type})? This cannot be undone.` : "Delete this record? This cannot be undone."}
                confirmLabel="Delete Record"
                onConfirm={confirmDeleteRecord}
            />

            <ConfirmDialog
                open={deleteZoneOpen}
                onOpenChange={(open) => {
                    if (!open) setDeleteZoneOpen(false);
                }}
                title="Are you sure?"
                description={`Delete zone file ${filename}? This will remove the underlying db.* file.`}
                confirmLabel={deletingZone ? "Deleting..." : "Delete Zone"}
                busy={deletingZone}
                onConfirm={confirmDeleteZone}
            />
        </div>
    );
}

function LoadingState() {
    return (
        <div className="py-32 flex items-center justify-center gap-3 font-mono text-sm tracking-widest uppercase text-mutedForeground">
            <Loader2 size={16} className="animate-spin" />
            Loading zone...
        </div>
    );
}

function NotFound({ filename }: { filename: string }) {
    return (
        <div className="space-y-8 py-16">
            <Link href="/" className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 transition-colors duration-INSTANT">
                <ArrowLeft size={16} strokeWidth={1.5} />
                Zones
            </Link>
            <h1 className="font-heading text-5xl md:text-7xl tracking-tighter leading-none">Not Found</h1>
            <p className="text-mutedForeground max-w-lg">
                Zone file &ldquo;{filename}&rdquo; could not be loaded. It may have been removed or renamed.
            </p>
        </div>
    );
}
