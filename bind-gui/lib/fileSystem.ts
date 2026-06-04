import fs from "fs";
import path from "path";

const CONFIG_DIR = process.env.CONFIG_DIR || "/etc/bind";

function zonePath(filename: string): string {
    return path.join(CONFIG_DIR, filename);
}

export function listZoneFiles(): string[] {
    try {
        const allFiles = fs.readdirSync(CONFIG_DIR);
        return allFiles.filter((f) => f.startsWith("db."));
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
    return `zone "${domain}" {\n    type master;\n    file "${filePath}";\n    allow-update { none; };\n};`;
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

    // Build the zone block using absolute path matching what's already in the config
    const filePath = `${CONFIG_DIR}/db.${domain}`;
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

    // Match the entire zone block for this domain and remove it along with surrounding blank lines
    const zoneBlockRegex = new RegExp(
        `\\n?\\s*\\n?\\s*zone\\s+"${escapeRegExp(domain)}"\\s*{[^}]*}\\s*;\\s*`,
        "g"
    );
    let updatedContent = rawContent.replace(zoneBlockRegex, "");

    // Trim trailing whitespace and re-add single newline
    updatedContent = updatedContent.trimEnd() + "\n";

    if (updatedContent === rawContent.trimEnd() + "\n") {
        console.log(`Zone "${domain}" not found in ${NAMED_CONF_LOCAL}, skipping removal.`);
        return true;
    }

    return writeConfigFile(NAMED_CONF_LOCAL, updatedContent);
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
