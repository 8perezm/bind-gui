#!/usr/bin/env node

/**
 * migrate-to-dynamic.mjs
 *
 * One-shot migration script for existing BIND DNS GUI deployments.
 * Reads named.conf.local, finds zone blocks with `allow-update { none; }`,
 * and calls `rndc modzone` to flip them to the TSIG-based policy.
 *
 * Usage:
 *   node scripts/migrate-to-dynamic.mjs
 *
 * Prerequisites:
 *   - bind-gui.key must exist in the bind config directory
 *   - rndc must be installed (bind-tools Alpine package)
 *   - BIND_RNDC_HOST env var must point to the bind9 container (default: 127.0.0.1)
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const NAMED_CONF_LOCAL = process.env.CONFIG_DIR
    ? path.join(process.env.CONFIG_DIR, "named.conf.local")
    : path.join(process.cwd(), "..", "bind", "config", "named.conf.local");

const RNDC_HOST = process.env.BIND_RNDC_HOST || "127.0.0.1";
const TSIG_KEY = process.env.TSIG_KEY || "bind-gui-key";

// Match zone blocks: zone "<name>" { ... allow-update { none; }; ... };
const ZONE_BLOCK_RE =
    /zone\s+"([^"]+)"\s*\{[^}]*?allow-update\s*\{\s*none\s*;?\s*\}\s*;?[^}]*\};/gs;

function main() {
    console.log("=== BIND DNS GUI — Migrate to Dynamic Updates ===\n");

    if (!fs.existsSync(NAMED_CONF_LOCAL)) {
        console.error(`✗ named.conf.local not found at: ${NAMED_CONF_LOCAL}`);
        console.error("  Set CONFIG_DIR env var or run from the project root.");
        process.exit(1);
    }

    const content = fs.readFileSync(NAMED_CONF_LOCAL, "utf-8");
    const matches = [...content.matchAll(ZONE_BLOCK_RE)];

    if (matches.length === 0) {
        console.log("✓ No static zone blocks found (or all already migrated).");
        console.log("  Nothing to do.");
        return;
    }

    console.log(`Found ${matches.length} zone block(s) with allow-update { none; }:\n`);

    for (const match of matches) {
        const zoneName = match[1];
        console.log(`  • ${zoneName}`);

        const configStr =
            `type master; file "/etc/bind/db.${zoneName}"; allow-update { key "${TSIG_KEY}"; };`;

        try {
            const result = execSync(
                `rndc -s ${RNDC_HOST} modzone "${zoneName}" '${configStr}'`,
                { timeout: 10_000, encoding: "utf-8" },
            );
            console.log(`    ✓ modzone succeeded: ${result.trim() || "(no output)"}`);
        } catch (err) {
            console.error(`    ✗ modzone failed: ${err.stderr?.trim() || err.message}`);
            console.error("      Check that rndc can reach the bind9 container.");
        }
    }

    console.log("\n=== Migration complete ===");
    console.log("You may want to update named.conf.local manually to");
    console.log(`change the template blocks from { none; } to { key "${TSIG_KEY}"; };`);
    console.log("for future reference (the GUI-created zones use rndc addzone now).");
}

main();
