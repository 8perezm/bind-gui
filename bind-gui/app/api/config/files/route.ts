import { NextResponse } from "next/server";
import { listConfigFiles, readConfigFile } from "@/lib/fileSystem";

export async function GET() {
    const filenames = listConfigFiles();
    const files = [];

    for (const filename of filenames) {
        const content = readConfigFile(filename);
        if (content !== null) {
            files.push({ filename, content });
        }
    }

    return NextResponse.json({ files });
}
