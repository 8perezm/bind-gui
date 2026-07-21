import { NextRequest, NextResponse } from "next/server";
import { listConfigFiles, readConfigFileRedacted } from "@/lib/fileSystem";

/**
 * Files we never serve over the API because they contain live secrets
 * (HMAC keys, rndc shared keys). Keep this list conservative — anything
 * matching `*.key` is excluded by default.
 */
function isSecretFile(filename: string): boolean {
    return filename.endsWith(".key");
}

export async function GET(req: NextRequest) {
    const filenames = listConfigFiles().filter((f) => !isSecretFile(f));

    // Support `?file=foo` to fetch a single redacted file. The query
    // param is validated against the safe list above.
    const requested = req.nextUrl.searchParams.get("file");
    if (requested) {
        if (isSecretFile(requested) || !filenames.includes(requested)) {
            return NextResponse.json(
                { error: "Not found" },
                { status: 404 }
            );
        }
        const content = readConfigFileRedacted(requested);
        if (content === null) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ filename: requested, content });
    }

    const files: { filename: string; content: string }[] = [];
    for (const filename of filenames) {
        const content = readConfigFileRedacted(filename);
        if (content !== null) {
            files.push({ filename, content });
        }
    }

    return NextResponse.json({ files });
}
