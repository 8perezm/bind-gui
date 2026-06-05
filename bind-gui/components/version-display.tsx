"use client";

import { useEffect, useState } from "react";

interface VersionInfo {
    name: string;
    version: string;
    timestamp?: string;
}

export default function VersionDisplay() {
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

    useEffect(() => {
        fetch("/api/version")
            .then((res) => res.json())
            .then((data) => setVersionInfo(data))
            .catch((err) => console.error("Failed to fetch version:", err));
    }, []);

    if (!versionInfo) return null;

    return (
        <span className="text-xs text-mutedForeground font-mono">
            v{versionInfo.version}
        </span>
    );
}
