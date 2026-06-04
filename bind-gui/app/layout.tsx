import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "./SessionProviderWrapper";

export const metadata: Metadata = {
    title: "Bind DNS Editor",
    description: "Edit Bind DNS zone configuration via web GUI",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="antialiased noise-overlay min-h-screen">
                <div className="relative z-10">
                    <SessionProviderWrapper>{children}</SessionProviderWrapper>
                </div>
            </body>
        </html>
    );
}
