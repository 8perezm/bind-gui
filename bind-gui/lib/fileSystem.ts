import fs from "fs";
import path from "path";

const CONFIG_DIR = process.env.CONFIG_DIR || "/etc/bind";

function zonePath(filename: string): string {
    return path.join(CONFIG_DIR, filename);
}

export function listZoneFiles(): string[] {
    try {
        const allFiles = fs.readdirSync(CONFIG_DIR);
        return allFiles.filter((f) => {
            if (!f.startsWith("db.")) return false;
            // BIND auto-creates .jbk (journal backup), .signed (inline-signed
            // zone), .jnl (journal), and .signed.jnl files alongside the real
            // zone files. Filter them out so the UI only shows actual zones.
            if (f.endsWith(".jbk")) return false;
            if (f.endsWith(".signed")) return false;
            if (f.endsWith(".jnl")) return false;
            if (f.endsWith(".signed.jnl")) return false;
            return true;
        });
    } catch (err) {
        console.error("Failed to read zone files:", err);
        return [];
    }
}

export function readZoneFile(filename: string): string | null {
    try {
        return fs.readFileSync(zonePath(filename), "utf-8");
    } catch (err) {
        console.error(`Failed to read ${filename}:`, err);
        return null;
    }
}

export function writeZoneFile(filename: string, content: string): boolean {
    try {
        fs.writeFileSync(zonePath(filename), content.trimEnd() + "\n", "utf-8");
        return true;
    } catch (err) {
        console.error(`Failed to write ${filename}:`, err);
        return false;
    }
}

export function deleteZoneFile(filename: string): boolean {
    try {
        fs.unlinkSync(zonePath(filename));
        return true;
    } catch (err) {
        console.error(`Failed to delete ${filename}:`, err);
        return false;
    }
}

export function listConfigFiles(): string[] {
    try {
        const allFiles = fs.readdirSync(CONFIG_DIR);
        return allFiles.filter((f) => !f.startsWith("db.") && !f.startsWith("."));
    } catch (err) {
        console.error("Failed to read config files:", err);
        return [];
    }
}

export function readConfigFile(filename: string): string | null {
    try {
        const filePath = path.join(CONFIG_DIR, filename);
        return fs.readFileSync(filePath, "utf-8");
    } catch (err) {
        console.error(`Failed to read config file ${filename}:`, err);
        return null;
    }
}

/**
 * Read a config file but redact HMAC secrets so it can be safely
 * shown in the UI. Returns null if the file can't be read.
 */
export function readConfigFileRedacted(filename: string): string | null {
    const content = readConfigFile(filename);
    if (content === null) return null;
    return redactSecrets(content);
}

/**
 * Replace `secret "..."` values with `secret "REDACTED"`. Leaves the
 * rest of the file (key names, algorithms, semicolons) intact.
 */
export function redactSecrets(content: string): string {
    return content.replace(/(secret\s+)"[^"]*"/g, '$1"REDACTED"');
}

/** Write content back to a config file in CONFIG_DIR */
export function writeConfigFile(filename: string, content: string): boolean {
    try {
        const filePath = path.join(CONFIG_DIR, filename);
        fs.writeFileSync(filePath, content.trimEnd() + "\n", "utf-8");
        return true;
    } catch (err) {
        console.error(`Failed to write config file ${filename}:`, err);
        return false;
    }
}

const NAMED_CONF_LOCAL = "named.conf.local";

/** Generate the BIND zone block for a forward domain */
function generateZoneBlock(domain: string, filePath: string): string {
    return `zone "${domain}" {\n    type master;\n    file "${filePath}";\n    allow-update { key "bind-gui-key"; };\n};`;
}

/** Register a new zone in named.conf.local (idempotent — skips if already present). Returns true on success. */
export function registerZoneInNamedConfLocal(domain: string): boolean {
    // Read existing config
    const rawContent = readConfigFile(NAMED_CONF_LOCAL);
    const content = rawContent || "";

    // Check if this domain is already registered
    const zoneRegex = new RegExp(`^\\s*zone\\s+"${escapeRegExp(domain)}"\\s*{`, "m");
    if (zoneRegex.test(content)) {
        console.log(`Zone "${domain}" already exists in ${NAMED_CONF_LOCAL}, skipping.`);
        return true;
    }

    // Build the zone block using BIND's filesystem perspective, not the GUI's
    const filePath = `/etc/bind/db.${domain}`;
    const zoneBlock = generateZoneBlock(domain, filePath);

    // Append to end of file with proper spacing
    const trimmedContent = content.trimEnd();
    const updatedContent = `${trimmedContent}\n\n${zoneBlock}\n`;

    return writeConfigFile(NAMED_CONF_LOCAL, updatedContent);
}

/** Remove a zone from named.conf.local (no-op if not found). Returns true on success or if zone wasn't present. */
export function unregisterZoneFromNamedConfLocal(domain: string): boolean {
    const rawContent = readConfigFile(NAMED_CONF_LOCAL);
    if (!rawContent) {
        console.log(`${NAMED_CONF_LOCAL} doesn't exist, nothing to remove.`);
        return true;
    }

    const block = findZoneBlock(rawContent, domain);
    if (!block) {
        console.log(`Zone "${domain}" not found in ${NAMED_CONF_LOCAL}, skipping removal.`);
        return true;
    }

    // Drop the block plus the surrounding blank line(s).
    const { start, end } = blockWithSurroundingWhitespace(rawContent, block);
    const updatedContent =
        rawContent.slice(0, start) + rawContent.slice(end).replace(/^\n+/, "");

    if (updatedContent === rawContent) {
        return true;
    }

    return writeConfigFile(NAMED_CONF_LOCAL, updatedContent);
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate a `zone "X" { ... }` block in named.conf.local, returning the
 * exact character spans of the open brace, the body (everything between
 * the braces), and the close brace. Handles nested braces correctly
 * (e.g. `allow-update { key "..."; }` inside the zone block) — a
 * previous implementation used `[^}]*` which silently stopped at the
 * first inner `}` and corrupted the file on every call.
 *
 * Returns null if the domain is not present in the file.
 */
function findZoneBlock(
    content: string,
    domain: string
): { start: number; openEnd: number; closeStart: number; end: number; open: string; body: string; close: string } | null {
    // Find the start of `zone "X" {` — `start` points at the `z` of `zone`.
    const startRegex = new RegExp(`(^|\\n)[ \\t]*zone[ \\t]+"${escapeRegExp(domain)}"[ \\t]*\\{`);
    const startMatch = startRegex.exec(content);
    if (!startMatch) return null;

    // `openStart` is the index of `zone`. We want the index of the `{`.
    const openStart = startMatch.index + startMatch[1].length;
    // The `{` is somewhere after `openStart`; find it.
    const braceIdx = content.indexOf("{", openStart);
    if (braceIdx === -1) return null;
    const openEnd = braceIdx + 1;

    // Track brace depth to find the matching `}`.
    let depth = 1;
    let i = openEnd;
    let inString = false;
    let inComment = false;
    while (i < content.length) {
        const ch = content[i];
        const next = content[i + 1];

        if (inComment) {
            if (ch === "\n") inComment = false;
        } else if (inString) {
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === '"') inString = false;
        } else {
            if (ch === "/" && next === "/") {
                inComment = true;
                i += 2;
                continue;
            }
            if (ch === "/" && next === "*") {
                // Block comment — skip to */
                const end = content.indexOf("*/", i + 2);
                if (end === -1) return null;
                i = end + 2;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === "{") depth++;
            else if (ch === "}") {
                depth--;
                if (depth === 0) {
                    const closeStart = i;
                    const end = i + 1;
                    return {
                        start: openStart,
                        openEnd,
                        closeStart,
                        end,
                        open: content.slice(openStart, openEnd),
                        body: content.slice(openEnd, closeStart),
                        close: content.slice(closeStart, end),
                    };
                }
            }
        }
        i++;
    }
    return null;
}

/**
 * Expand a block's `[start, end)` slice to include one preceding blank
 * line and any following newline, so that removing a block from the
 * file leaves clean blank-line separation between the surrounding
 * blocks.
 *
 * Also absorbs the trailing `;` that terminates a BIND statement
 * (e.g. `zone "..." { ... };`). Without this, removing a block leaves
 * a stray `;` in the file which — while not strictly invalid BIND
 * syntax — caused `rndc reconfig` to fail in practice on the staging
 * deployment.
 */
function blockWithSurroundingWhitespace(
    content: string,
    block: { start: number; end: number }
): { start: number; end: number } {
    let start = block.start;
    // Walk back over one optional newline and one optional blank line
    // (i.e. one blank line plus the newline that follows it).
    if (start > 0 && content[start - 1] === "\n") {
        start -= 1;
        if (start > 0 && content[start - 1] === "\n") {
            start -= 1;
        }
    }

    let end = block.end;
    // Eat the terminating `;` if present.
    if (end < content.length && content[end] === ";") end += 1;
    // Eat a following newline (if any).
    if (end < content.length && content[end] === "\n") end += 1;
    return { start, end };
}

/**
 * Add or remove `inline-signing yes;` and `auto-dnssec maintain;` inside
 * the zone block for `domain` in named.conf.local. Returns true on
 * success (or no-op if already in the desired state).
 *
 * BIND 9.18 requires BOTH directives for DNSSEC auto-signing:
 * - `inline-signing yes;` tells BIND to maintain a signed copy of the zone
 * - `auto-dnssec maintain;` tells BIND to auto-generate and rotate keys
 *
 * Without `auto-dnssec maintain;` the zone block has `inline-signing yes;`
 * but BIND never generates KSK/ZSK keys, so no RRSIG, DNSKEY, CDS, or
 * CDNSKEY records are produced and the DNSSEC status page shows
 * "No DS/CDS/CDNSKEY records found" permanently.
 *
 * This is the safe way to toggle DNSSEC on a static zone — it edits the
 * configuration file and lets the caller `rndc reload <zone>` after, so
 * the running BIND instance is never without the zone in the meantime.
 */
export function setInlineSigningInNamedConfLocal(
    domain: string,
    enabled: boolean
): boolean {
    const rawContent = readConfigFile(NAMED_CONF_LOCAL);
    if (!rawContent) {
        console.error(`${NAMED_CONF_LOCAL} does not exist; cannot toggle inline-signing for "${domain}".`);
        return false;
    }

    const block = findZoneBlock(rawContent, domain);
    if (!block) {
        console.error(`Zone "${domain}" not found in ${NAMED_CONF_LOCAL}.`);
        return false;
    }

    let newBody = block.body;
    // Strip any existing inline-signing and auto-dnssec directives.
    newBody = newBody.replace(/[ \t]*inline-signing[ \t]+(yes|no)[ \t]*;?[ \t]*\n?/g, "");
    newBody = newBody.replace(/[ \t]*auto-dnssec[ \t]+(maintain|off)[ \t]*;?[ \t]*\n?/g, "");

    if (enabled) {
        newBody = newBody.trimEnd() + "\n    inline-signing yes;\n    auto-dnssec maintain;\n";
    }

    const newBlock = `${block.open}${newBody}${block.close}`;
    const updatedContent =
        rawContent.slice(0, block.start) + newBlock + rawContent.slice(block.end);

    return writeConfigFile(NAMED_CONF_LOCAL, updatedContent);
}

export function createZoneFile(filename: string, content: string): boolean {
    if (!filename.startsWith("db.")) {
        console.error(`Invalid zone filename: ${filename}`);
        return false;
    }

    const fp = zonePath(filename);
    if (fs.existsSync(fp)) {
        console.error(`Zone file already exists: ${filename}`);
        return false;
    }

    try {
        fs.writeFileSync(fp, content.trimEnd() + "\n", "utf-8");
        return true;
    } catch (err) {
        console.error(`Failed to create ${filename}:`, err);
        return false;
    }
}
