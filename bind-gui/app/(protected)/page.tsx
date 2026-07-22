"use client";

import { useEffect, useState, useCallback } from "react";
import type { ZoneSummary } from "@/components/types";
import ZoneList from "@/components/zone-list";
import CreateZoneDialog from "@/components/create-zone-dialog";

export default function DashboardPage() {
    const [zones, setZones] = useState<ZoneSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchZones = useCallback(async () => {
        try {
            const res = await fetch("/api/zones");
            const data = await res.json();
            setZones(
                data.zones.map((z: any) => ({
                    domain: z.domain,
                    filename: z.filename,
                    recordCount: z.recordCount,
                }))
            );
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch zones:", err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchZones();
    }, [fetchZones]);

    return (
        <div className="space-y-12">
            <section className="py-8 md:py-16 flex flex-col gap-4">
                <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none mb-4">
                    DNS Zones
                </h1>
                <p className="text-mutedForeground max-w-xl text-lg leading-relaxed">
                    Manage your Bind zone files. Select a zone to view and edit its records.
                </p>
                <div className="pt-2">
                    <CreateZoneDialog onSuccess={fetchZones} />
                </div>
            </section>

            <section>
                {loading ? (
                    <p className="py-12 font-mono text-sm tracking-widest uppercase text-mutedForeground">
                        Loading...
                    </p>
                ) : (
                    <ZoneList zones={zones} />
                )}
            </section>
        </div>
    );
}
