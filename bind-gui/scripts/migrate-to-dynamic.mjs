#!/usr/bin/env node

/**
 * migrate-to-dynamic.mjs
 *
 * One-shot migration script for existing BIND DNS GUI deployments.
 * Walks every zone block in named.conf.local and ensures it has
 * `allow-update { key "bind-gui-key"; };`, performing the right edit
 * for whichever form the zone is currently in:
 *
 *   1. `allow-update { none; }`        → rewritten to the bind-gui key clause
 *   2. no `allow-update` clause at all → one is inserted before the closing `};`
 *   3. `allow-update { key "bind-gui-key"; };` (already migrated) → left alone
 *   4. `allow-update { key "other-key"; };`  (foreign key)        → left alone,
 *                                                                     warned
 *
 * The file is written back atomically, then `rndc reconfig` is run so BIND
 * picks up the change without a container restart.
 *
 * Usage:
 *   node scripts/migrate-to-dynamic.mjs
 *
 * Prerequisites:
 *   - bind-gui.key must exist in the bind config directory
 *   - rndc must be installed (bind-tools + bind Alpine packages)
 *   - BIND_RNDC_HOST env var must point to the bind9 container (default: 127.0.0.1)
 *
 * Why not `rndc modzone`?
 *   `rndc modzone` only works on zones that are managed by rndc (added via
 *   `rndc addzone`). Static zones declared in named.conf.local cannot be
 *   reconfigured in-memory — BIND returns "failure" if you try. The reliable
 *   way to migrate a static zone to dynamic is to edit the config file and
 *   run `rndc reconfig`.
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const NAMED_CONF_LOCAL = process.env.CONFIG_DIR
    ? path.join(process.env.CONFIG_DIR, "named.conf.local")
    : path.join(process.cwd(), "..", "bind", "config", "named.conf.local");

const RNDC_HOST = process.env.BIND_RNDC_HOST || "127.0.0.1";
const TSIG_KEY = process.env.TSIG_KEY || "bind-gui-key";
const TSIG_KEY_FILE = process.env.TSIG_KEY_FILE || "/etc/bind/bind-gui.key";

// Match `allow-update { none; }` in both single-line and multi-line forms.
//   allow-update { none; };
//   allow-update { "none"; };
//   allow-update {
//       none;
//   };
const ALLOW_UPDATE_NONE_RE =
    /allow-update\s*\{\s*(?:"none"|none)\s*;?\s*\}\s*;?/gi;

// We don't use a regex for zone-block matching because the body of a zone
// block frequently contains another `{...}` pair (e.g. `allow-update
// { key "x"; };`), and a non-greedy `\{([\s\S]*?)\}` cannot tell those
// inner braces from the closing `}` of the zone block. The function below
// counts braces explicitly to get the right block boundaries.

/**
 * Find every `zone "name" { ... };` block in `text`, correctly handling
 * nested braces (e.g. `allow-update { key "x"; };` inside the block).
 *
 * Returns an array of { name, startIdx, bodyEndIdx, endIdx, body, raw } where:
 *   - name     : the zone name
 *   - startIdx : index of the `zone` keyword (start of the match)
 *   - bodyEndIdx: index just past the matching `}` (start of `;` or whitespace)
 *   - endIdx   : index just past the optional trailing `;` and whitespace
 *   - body     : the block contents (between `{` and matching `}`)
 *   - raw      : the full matched substring (`zone "name" { ... };`)
 *
 * This is needed because a regex like `\{([\s\S]*?)\}` cannot tell apart
 * the inner `}` of `allow-update { ... }` from the outer `}` that closes
 * the zone block — both look identical to a non-greedy match.
 */
function findZoneBlocks(text) {
    const zones = [];
    const zoneStartRe = /zone\s+"([^"]+)"\s*\{/g;
    let m;
    while ((m = zoneStartRe.exec(text)) !== null) {
        const name = m[1];
        const startIdx = m.index;
        const bodyStart = m.index + m[0].length;
        // Walk forward counting braces. The first `{` we already consumed,
        // so we start at depth 1.
        let depth = 1;
        let i = bodyStart;
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            i++;
        }
        // `i` is now just past the matching `}`.
        const bodyEndIdx = i - 1;
        // Skip optional whitespace and `;` after the closing `}`.
        let j = i;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ";") j++;
        zones.push({
            name,
            startIdx,
            bodyEndIdx,
            endIdx: j,
            body: text.slice(bodyStart, bodyEndIdx),
            raw: text.slice(startIdx, j),
        });
        // Continue searching after this block.
        zoneStartRe.lastIndex = j;
    }
    return zones;
}

const NEW_ALLOW_UPDATE = `allow-update { key "${TSIG_KEY}"; };`;

function main() {
    console.log("=== BIND DNS GUI — Migrate to Dynamic Updates ===\n");

    if (!fs.existsSync(NAMED_CONF_LOCAL)) {
        console.error(`✗ named.conf.local not found at: ${NAMED_CONF_LOCAL}`);
        console.error("  Set CONFIG_DIR env var or run from the project root.");
        process.exit(1);
    }

    const original = fs.readFileSync(NAMED_CONF_LOCAL, "utf-8");

    // Classify every zone block into one of:
    //   • "none"    — has `allow-update { none; }`        → Pass 1 will rewrite it
    //   • "missing" — has no `allow-update` clause at all  → Pass 2 will insert one
    //   • "ours"    — already has `allow-update { key "<TSIG_KEY>"; }` → skip
    //   • "foreign" — has `allow-update { key "<other>"; }`  → skip + warn
    const noneZones = [];
    const missingZones = [];
    const foreignZones = [];

    const zones = findZoneBlocks(original);
    for (const z of zones) {
        const { name, body } = z;

        if (ALLOW_UPDATE_NONE_RE.test(body)) {
            ALLOW_UPDATE_NONE_RE.lastIndex = 0;
            noneZones.push(name);
            continue;
        }
        if (!/\ballow-update\b/i.test(body)) {
            missingZones.push(name);
            continue;
        }
        const keyMatch = body.match(/allow-update\s*\{\s*key\s+"([^"]+)"\s*;/i);
        if (keyMatch && keyMatch[1] !== TSIG_KEY) {
            foreignZones.push({ name, key: keyMatch[1] });
        }
        // else: already has our key — silently leave alone
    }

    if (noneZones.length === 0 && missingZones.length === 0) {
        if (foreignZones.length > 0) {
            console.log("✓ No zones need automatic migration.");
            console.log("");
            console.log("  The following zones have an `allow-update` clause for a");
            console.log("  different key. They were left untouched:");
            for (const z of foreignZones) {
                console.log(`    • ${z.name}  (key: ${z.key})`);
            }
            console.log("");
            console.log(`  To migrate them to use "${TSIG_KEY}", edit named.conf.local manually.`);
        } else {
            console.log("✓ No static zone blocks found (or all already migrated).");
            console.log("  Nothing to do.");
        }
        return;
    }

    if (noneZones.length > 0) {
        console.log(`Found ${noneZones.length} zone block(s) with allow-update { none; }:\n`);
        for (const z of noneZones) {
            console.log(`  • ${z}`);
        }
        console.log("");
    }

    if (missingZones.length > 0) {
        console.log(`Found ${missingZones.length} zone block(s) with no allow-update clause:\n`);
        for (const z of missingZones) {
            console.log(`  • ${z}`);
        }
        console.log("");
    }

    // --- Pass 1: rewrite `allow-update { none; }` → our line ---------------
    let updated = original;
    if (noneZones.length > 0) {
        ALLOW_UPDATE_NONE_RE.lastIndex = 0;
        updated = updated.replace(ALLOW_UPDATE_NONE_RE, NEW_ALLOW_UPDATE);
    }

    // --- Pass 2: insert our line into blocks that have no allow-update -----
    // We operate on `updated` (post pass-1) and only touch blocks whose
    // name is in missingZones. The block is preserved verbatim except for
    // the inserted line, which is added just before the closing `};`.
    // The result is idempotent: a second run finds no matches in either pass.
    //
    // We can't use a single regex.replace() here because a non-greedy
    // `\{([\s\S]*?)\}` cannot tell apart the inner `}` of an `allow-update
    // { ... }` clause from the outer `}` that closes the zone block. So
    // we walk the file ourselves using findZoneBlocks(), which counts
    // braces explicitly.
    if (missingZones.length > 0) {
        const blockList = findZoneBlocks(updated);
        // Walk blocks in reverse so earlier indices stay valid as we splice.
        for (let i = blockList.length - 1; i >= 0; i--) {
            const z = blockList[i];
            if (!missingZones.includes(z.name)) continue;
            // Safety: skip if pass 1 (or a previous run) somehow added one.
            if (/\ballow-update\b/i.test(z.body)) continue;
            // Insert the new clause + a trailing newline just before the
            // closing `}`. The trailing newline keeps the closing `};` on
            // its own line (otherwise we'd get `;};` on the same line as
            // the new clause, which looks broken even though BIND would
            // still parse it).
            const newClause = `\n    ${NEW_ALLOW_UPDATE}\n`;
            updated =
                updated.slice(0, z.bodyEndIdx) +
                newClause +
                updated.slice(z.bodyEndIdx);
        }
    }

    if (updated === original) {
        console.log("✓ No changes were needed in named.conf.local.");
        return;
    }

    // Write back atomically: write to a temp file in the same directory, then rename.
    const tmpPath = NAMED_CONF_LOCAL + ".tmp";
    fs.writeFileSync(tmpPath, updated, "utf-8");
    fs.renameSync(tmpPath, NAMED_CONF_LOCAL);

    const total = noneZones.length + missingZones.length;
    console.log(`✓ Updated ${NAMED_CONF_LOCAL}`);
    console.log(`  Pass 1: rewrote ${noneZones.length} allow-update { none; } clause(s).`);
    console.log(`  Pass 2: inserted allow-update clause into ${missingZones.length} zone block(s).`);
    console.log(`  Total: ${total} zone(s) now use: ${NEW_ALLOW_UPDATE}\n`);

    if (foreignZones.length > 0) {
        console.log(`  ⚠ Left ${foreignZones.length} zone(s) with a foreign allow-update key (not migrated):`);
        for (const z of foreignZones) {
            console.log(`      • ${z.name}  (key: ${z.key})`);
        }
        console.log("");
    }

    // Apply the change without restarting BIND. rndc reconfig parses
    // named.conf and applies any new/changed zones and options.
    console.log("Applying changes with rndc reconfig ...");
    try {
        const result = execSync(
            `rndc -s ${RNDC_HOST} -k ${TSIG_KEY_FILE} reconfig`,
            { timeout: 15_000, encoding: "utf-8" },
        );
        console.log(`  ✓ rndc reconfig: ${result.trim() || "(no output)"}`);
    } catch (err) {
        console.error(`  ✗ rndc reconfig failed: ${err.stderr?.trim() || err.message}`);
        console.error("");
        console.error("  The named.conf.local file HAS been updated, but BIND could not");
        console.error("  be reloaded automatically. To finish the migration manually:");
        console.error("");
        console.error(`    docker compose exec bind-gui rndc -s ${RNDC_HOST} -k ${TSIG_KEY_FILE} reconfig`);
        console.error("");
        console.error("  Or restart the bind9 container:");
        console.error("    docker compose restart bind9");
        process.exit(1);
    }

    console.log("\n=== Migration complete ===");
    console.log("All listed zones now use:");
    console.log(`    ${NEW_ALLOW_UPDATE}`);
    console.log("");
    console.log("They are dynamic and will accept updates via `nsupdate` authenticated");
    console.log("with the `bind-gui-key`. The GUI can now edit records without restarting BIND.");
}

main();
