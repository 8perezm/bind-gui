import { NextResponse } from "next/server";
import { RndcError } from "@/lib/rndc";
import { getStatsBundle, StatsUnavailableError } from "@/lib/stats";

// GET /api/stats
// Returns the full statistics bundle: rndc status + statistics-channels
// data (if BIND has been configured with a statistics-channels block).
export async function GET() {
    try {
        const bundle = await getStatsBundle();
        return NextResponse.json(bundle);
    } catch (err) {
        if (err instanceof RndcError) {
            return NextResponse.json(
                { error: err.message, stderr: err.stderr },
                { status: 500 },
            );
        }
        if (err instanceof StatsUnavailableError) {
            return NextResponse.json(
                {
                    error: err.message,
                    detail:
                        "The BIND statistics channel is unreachable. Ensure " +
                        "statistics-channels is configured in named.conf.local and " +
                        "run `rndc reconfig` to apply the change.",
                },
                { status: 503 },
            );
        }
        return NextResponse.json(
            { error: "Failed to fetch server statistics" },
            { status: 500 },
        );
    }
}
