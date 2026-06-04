import Header from "@/components/header";

export default function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <Header />
            <main className="px-6 md:px-8 lg:px-12 py-12">
                <div className="max-w-6xl mx-auto">{children}</div>
            </main>
        </>
    );
}
