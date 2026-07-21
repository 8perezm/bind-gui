// Ad-hoc test for the findZoneBlock brace-matcher and the two functions
// that depend on it. Run from the bind-gui/ directory with:
//   node scripts/test-zone-block-fix.mjs

import { strict as assert } from "node:assert";

// Replicate the helpers from lib/fileSystem.ts (the actual code, copy-paste)
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findZoneBlock(content, domain) {
    const startRegex = new RegExp(`(^|\\n)[ \\t]*zone[ \\t]+"${escapeRegExp(domain)}"[ \\t]*\\{`);
    const startMatch = startRegex.exec(content);
    if (!startMatch) return null;
    const openStart = startMatch.index + startMatch[1].length;
    const braceIdx = content.indexOf("{", openStart);
    if (braceIdx === -1) return null;
    const openEnd = braceIdx + 1;

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
            if (ch === "\\") { i += 2; continue; }
            if (ch === '"') inString = false;
        } else {
            if (ch === "/" && next === "/") { inComment = true; i += 2; continue; }
            if (ch === "/" && next === "*") {
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

function blockWithSurroundingWhitespace(content, block) {
    let start = block.start;
    if (start > 0 && content[start - 1] === "\n") {
        start -= 1;
        if (start > 0 && content[start - 1] === "\n") start -= 1;
    }
    let end = block.end;
    // Eat the terminating `;` if present (BIND statement terminator).
    if (end < content.length && content[end] === ";") end += 1;
    // Eat a following newline (if any).
    if (end < content.length && content[end] === "\n") end += 1;
    return { start, end };
}

const NAMED_CONF_LOCAL = `zone "foo.esuyo.com" {
    type master;
    file "/etc/bind/db.foo.esuyo.com";
    allow-update { key "bind-gui-key"; };
};

zone "5.168.192.in-addr.arpa" {
    type master;
    file "/etc/bind/db.192.168.5";
    allow-update { key "bind-gui-key"; };
};

zone "tail.esuyo.com" {
    type master;
    file "/etc/bind/db.tail.esuyo.com";
    allow-update { key "bind-gui-key"; };
};

zone "example.com" {
    type master;
    file "/etc/bind/db.example.com";
    allow-update { key "bind-gui-key"; };
};
`;

// Test 1: findZoneBlock on each of the user's zones
for (const z of ["foo.esuyo.com", "5.168.192.in-addr.arpa", "tail.esuyo.com", "example.com"]) {
    const block = findZoneBlock(NAMED_CONF_LOCAL, z);
    assert.ok(block, `findZoneBlock should find ${z}`);
    assert.ok(block.body.includes("type master"), `${z} body should contain "type master"`);
    assert.ok(block.body.includes("allow-update"), `${z} body should contain the inner allow-update block`);
    // The body should be exactly the content between the outer braces:
    //      \n    type master;\n    file "...";\n    allow-update { key "..."; };\n
    // which includes the inner "};" from the allow-update block but
    // NOT the trailing ";"+newline that ends the outer zone block.
    // Easiest structural check: the body should be a single non-nested
    // "body" — verify by counting braces (after stripping the inner
    // allow-update braces).
    const bodyForBalance = block.body.replace(/allow-update\s*\{[^}]*\}[^}]*;?/g, "X");
    let depth = 0;
    for (const ch of bodyForBalance) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
    }
    assert.equal(depth, 0, `${z}: body should have balanced braces after stripping allow-update`);
    console.log(`PASS  findZoneBlock("${z}") → body length ${block.body.length}`);
}

// Test 2: blockWithSurroundingWhitespace strips the blank line before/after
{
    const block = findZoneBlock(NAMED_CONF_LOCAL, "foo.esuyo.com");
    const ctx = blockWithSurroundingWhitespace(NAMED_CONF_LOCAL, block);
    // After removal of [ctx.start, ctx.end) the rest should start with the
    // next zone block ("5.168.192.in-addr.arpa").
    const after = NAMED_CONF_LOCAL.slice(0, ctx.start) + NAMED_CONF_LOCAL.slice(ctx.end);
    assert.ok(after.includes('zone "5.168.192.in-addr.arpa"'), "removal should leave 5.168.192.in-addr.arpa intact");
    assert.ok(!after.includes('zone "foo.esuyo.com"'), "removal should drop foo.esuyo.com");
    console.log("PASS  blockWithSurroundingWhitespace removes block + adjacent blank line");
}

// Test 3: simulate setInlineSigningInNamedConfLocal
{
    let content = NAMED_CONF_LOCAL;
    const block = findZoneBlock(content, "example.com");
    let body = block.body.replace(/[ \t]*inline-signing[ \t]+(yes|no)[ \t]*;?[ \t]*\n?/g, "");
    body = body.trimEnd() + "\n    inline-signing yes;\n";
    const newBlock = `${block.open}${body}${block.close}`;
    content = content.slice(0, block.start) + newBlock + content.slice(block.end);
    // BIND should be able to parse this. Sanity-check the syntax balance.
    let depth = 0;
    let inString = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (ch === "\\") { i++; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") depth--;
    }
    assert.equal(depth, 0, "brace depth should be balanced after setInlineSigning");
    assert.ok(content.includes("inline-signing yes;"), "should contain inline-signing yes");
    console.log("PASS  setInlineSigning simulation produces balanced BIND config");
}

// Test 4: simulate unregisterZoneFromNamedConfLocal
{
    let content = NAMED_CONF_LOCAL;
    const block = findZoneBlock(content, "tail.esuyo.com");
    const ctx = blockWithSurroundingWhitespace(content, block);
    content = content.slice(0, ctx.start) + content.slice(ctx.end).replace(/^\n+/, "");
    assert.ok(!content.includes("tail.esuyo.com"), "tail.esuyo.com should be gone");
    assert.ok(content.includes("foo.esuyo.com"), "foo.esuyo.com should still be there");
    assert.ok(content.includes("example.com"), "example.com should still be there");
    // BIND should still parse.
    let depth = 0;
    let inString = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (ch === "\\") { i++; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") depth--;
    }
    assert.equal(depth, 0, "brace depth should be balanced after unregister");
    console.log("PASS  unregister simulation produces balanced BIND config");
}

// Test 5: unregister consumes the trailing `;` of the removed block.
// This was the bug that left `};;` in the file after a delete
// (the new block's terminator became a stray empty statement).
{
    let content = NAMED_CONF_LOCAL;
    const block = findZoneBlock(content, "tail.esuyo.com");
    const ctx = blockWithSurroundingWhitespace(content, block);
    const after = content.slice(0, ctx.start) + content.slice(ctx.end).replace(/^\n+/, "");
    // No `};;` pairs anywhere — the trailing `;` was eaten.
    assert.ok(!after.includes("};" + ";"), "no stray `};` pairs after unregister");
    // BIND's parser will still accept `};` as a no-op empty statement,
    // but the staging deployment's rndc reconfig was rejecting it.
    let depth = 0;
    let inString = false;
    for (let i = 0; i < after.length; i++) {
        const ch = after[i];
        if (inString) {
            if (ch === "\\") { i++; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") depth--;
    }
    assert.equal(depth, 0, "balanced after unregister with trailing-; consumption");
    console.log("PASS  unregister consumes the removed block's trailing `;`");
}

// Test 6: ownerNameForGlue — the in-zone owner name for an in-bailiwick
// NS so we can emit a glue A record. (Mirrors the logic in
// app/api/zones/route.ts.)
function ownerNameForGlue(primaryNs, domain) {
    const nsLabel = primaryNs.endsWith(".")
        ? primaryNs.slice(0, -1)
        : primaryNs;
    const apex = domain;
    if (nsLabel === apex) return "@";
    if (nsLabel.endsWith(`.${apex}`)) return nsLabel.slice(0, -(`.${apex}`).length);
    return nsLabel; // external NS — still emitted at the FQDN
}
assert.equal(ownerNameForGlue("ns1.example.com.", "example.com"), "ns1");
assert.equal(ownerNameForGlue("ns1.example.com", "example.com"), "ns1");
assert.equal(ownerNameForGlue("ns1.sub.example.com.", "sub.example.com"), "ns1");
assert.equal(ownerNameForGlue("example.com.", "example.com"), "@");
assert.equal(ownerNameForGlue("ns1.other.com.", "example.com"), "ns1.other.com");
console.log("PASS  ownerNameForGlue covers common cases");

console.log("\nAll tests passed.");
