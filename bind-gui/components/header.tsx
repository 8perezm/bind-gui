"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import VersionDisplay from "@/components/version-display";

export default function Header() {
    const { data: session } = useSession();

    return (
        <header className="border-b-4 border-black px-6 md:px-8 lg:px-12 py-6 bg-white">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-4 group">
                    <span className="font-logo text-3xl tracking-tight text-black transition-colors duration-INSTANT">
                        BIND DNS
                    </span>
                    <span className="text-mutedForeground font-mono text-sm tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-INSTANT">
                        Editor
                    </span>
                    <VersionDisplay />
                </Link>

                {session && (
                    <nav className="hidden md:flex items-center gap-8">
                        <NavLink href="/">Zones</NavLink>
                        <NavLink href="/config">Config</NavLink>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => signOut({ callbackUrl: "/login" })}
                        >
                            Sign Out
                        </Button>
                    </nav>
                )}
            </div>
        </header>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="text-sm tracking-widest uppercase hover:underline underline-offset-4 focus-visible:border-black focus-visible:outline-none transition-colors duration-INSTANT"
        >
            {children}
        </Link>
    );
}
