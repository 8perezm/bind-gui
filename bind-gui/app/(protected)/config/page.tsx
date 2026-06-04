"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConfigFile {
    filename: string;
    content: string;
}

export default function ConfigPage() {
    const [files, setFiles] = useState<ConfigFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/config/files")
            .then((res) => res.json())
            .then((data: { files?: ConfigFile[] }) => {
                setFiles(data.files ?? []);
                setLoading(false);
            })
            .catch(() => {
                setError("Failed to load config files.");
                setLoading(false);
            });
    }, []);

    if (loading) {
        return <LoadingState />;
    }

    if (error || !files.length) {
        return <NotFound error={error} />;
    }

    const firstFile = files[0]?.filename ?? "";

    return (
        <div className="space-y-12">
            {/* Header */}
            <section>
                <Link href="/" className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 mb-6 transition-colors duration-INSTANT">
                    <ArrowLeft size={16} strokeWidth={1.5} />
                    Dashboard
                </Link>
                <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none mb-2">
                    Configuration
                </h1>
                <p className="text-mutedForeground font-mono text-xs uppercase tracking-widest mt-2">
                    BIND configuration files · read-only view
                </p>
            </section>

            {/* Config tabs */}
            <Tabs defaultValue={firstFile}>
                <TabsList>
                    {files.map((file) => (
                        <TabsTrigger key={file.filename} value={file.filename}>
                            {file.filename}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {files.map((file) => (
                    <TabsContent key={file.filename} value={file.filename}>
                        <div className="border-2 border-black bg-white p-6 overflow-auto max-h-[60vh]">
                            <pre className="font-mono text-sm whitespace-pre-wrap break-all">{file.content}</pre>
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="py-32 flex items-center justify-center gap-3 font-mono text-sm tracking-widest uppercase text-mutedForeground">
            <Loader2 size={16} className="animate-spin" />
            Loading config...
        </div>
    );
}

function NotFound({ error }: { error: string | null }) {
    return (
        <div className="space-y-8 py-16">
            <Link href="/" className="inline-flex items-center gap-2 text-sm tracking-widest uppercase hover:underline underline-offset-4 transition-colors duration-INSTANT">
                <ArrowLeft size={16} strokeWidth={1.5} />
                Dashboard
            </Link>
            <h1 className="font-heading text-5xl md:text-7xl tracking-tighter leading-none">No Config</h1>
            <p className="text-mutedForeground max-w-lg">
                {error || "No configuration files found in the BIND config directory."}
            </p>
        </div>
    );
}
