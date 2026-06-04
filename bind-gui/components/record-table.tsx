"use client";

import type { DnsRecord } from "@/lib/dnsTypes";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil } from "lucide-react";

interface RecordTableProps {
    records: DnsRecord[];
    onEdit: (record: DnsRecord) => void;
    onDelete: (record: DnsRecord) => void;
}

export default function RecordTable({ records, onEdit, onDelete }: RecordTableProps) {
    if (!records.length) {
        return (
            <p className="py-8 text-mutedForeground italic">No records yet.</p>
        );
    }

    return (
        <div className="overflow-x-auto border-t-4 border-black">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b-2 border-black bg-muted">
                        <th className="text-left py-3 px-4 font-medium tracking-wider uppercase text-xs">Name</th>
                        <th className="text-left py-3 px-4 font-medium tracking-wider uppercase text-xs">Type</th>
                        <th className="text-left py-3 px-4 font-medium tracking-wider uppercase text-xs hidden md:table-cell">TTL</th>
                        <th className="text-left py-3 px-4 font-medium tracking-wider uppercase text-xs">Data</th>
                        <th className="text-right py-3 px-4 font-medium tracking-wider uppercase text-xs w-[100px]">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {records.map((record, idx) => (
                        <RecordRow
                            key={record.id}
                            record={record}
                            isLast={idx === records.length - 1}
                            onEdit={() => onEdit(record)}
                            onDelete={() => onDelete(record)}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RecordRow({
    record,
    isLast,
    onEdit,
    onDelete,
}: {
    record: DnsRecord;
    isLast: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <tr
            className={`border-b border-black group hover:bg-muted transition-colors duration-INSTANT ${isLast ? "border-b-2" : ""}`}
        >
            <td className="py-3 px-4 font-mono">{record.name}</td>
            <td className="py-3 px-4">
                <Badge>{record.type}</Badge>
            </td>
            <td className="py-3 px-4 text-mutedForeground hidden md:table-cell font-mono">
                {record.ttl ?? "-"}
            </td>
            <td className="py-3 px-4 font-mono break-all max-w-[300px]">{record.data}</td>
            <td className="py-3 px-4 text-right opacity-0 group-hover:opacity-100 transition-opacity duration-INSTANT">
                <div className="inline-flex gap-2 justify-end">
                    <button onClick={onEdit} title="Edit" className="hover:text-mutedForeground transition-colors duration-INSTANT p-1">
                        <Pencil size={16} strokeWidth={1.5} />
                    </button>
                    <button onClick={onDelete} title="Delete" className="hover:text-red-700 transition-colors duration-INSTANT p-1">
                        <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                </div>
            </td>
        </tr>
    );
}
