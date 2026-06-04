"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ZoneSummary } from "./types";

interface ZoneListProps {
    zones: ZoneSummary[];
}

export default function ZoneList({ zones }: ZoneListProps) {
    return (
        <div className="space-y-0">
            {zones.map((zone) => (
                <Link
                    key={zone.filename}
                    href={`/edit/${encodeURIComponent(zone.filename)}`}
                    className="group flex items-center justify-between border-b-2 border-black py-5 px-6 hover:bg-black hover:text-white transition-colors duration-INSTANT"
                >
                    <div className="flex items-baseline gap-4">
                        <span className="font-heading text-xl md:text-2xl tracking-tight">
                            {zone.domain}
                        </span>
                        <span className="text-mutedForeground group-hover:text-white font-mono text-xs uppercase tracking-widest hidden sm:inline-block">
                            {zone.recordCount} records
                        </span>
                    </div>
                    <span className="text-sm tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-INSTANT">
                        EDIT →
                    </span>
                </Link>
            ))}

            {zones.length === 0 && (
                <p className="py-12 text-mutedForeground text-lg">
                    No zone files found. Create your first zone using the &quot;Create Zone&quot; button above.
                </p>
            )}
        </div>
    );
}
