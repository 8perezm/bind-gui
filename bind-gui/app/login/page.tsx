"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const result = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (result?.ok) {
                // Use window.location for a full page refresh to ensure session is picked up
                window.location.href = "/";
            } else {
                setError(result?.error || "Invalid credentials");
                setLoading(false);
            }
        } catch {
            setError("An error occurred. Please try again.");
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-6">
            <Link href="/" className="absolute top-6 left-6 font-logo text-xl tracking-tight hover:underline underline-offset-4 transition-colors duration-INSTANT">
                BIND DNS
            </Link>

            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md bg-white border-2 border-black p-8 md:p-10"
            >
                <h1 className="font-heading text-5xl md:text-6xl tracking-tighter mb-2 leading-none">
                    Sign In
                </h1>
                <p className="text-mutedForeground mb-8 mt-3">
                    Access your DNS configuration editor.
                </p>

                {error && (
                    <div className="border-b-2 border-black py-3 mb-6 text-sm uppercase tracking-wider">
                        Invalid username or password
                    </div>
                )}

                <div className="mb-6">
                    <Label htmlFor="username">Username</Label>
                    <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoFocus
                    />
                </div>

                <div className="mb-8">
                    <Label htmlFor="password">Password</Label>
                    <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                    />
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Signing in..." : "Sign In"}
                </Button>
            </form>
        </div>
    );
}
