/**
 * Familee - reading a GEDCOM file (5.5, 5.5.1 and 7.0)
 *
 * The line grammar is the same in all three versions (GEDCOM 7.0, section 1.3):
 *
 *   Line = Level SP [Xref SP] Tag [SP LineVal] EOL
 *
 * with one space between the parts, an optional cross-reference identifier in @…@,
 * and a line terminator of CR LF, CR or LF. The differences are:
 *   - 5.5 and 5.5.1 split long values with CONC (no line break) and CONT (a line break);
 *     7.0 has no CONC and continues with CONT only;
 *   - an "@" inside a value is written as "@@" in every version;
 *   - 5.5 and 5.5.1 allow several character sets (ANSEL is the default); 7.0 is UTF-8 only.
 *
 * parseGedcomFile() returns the records together with the version and the encoding
 * from the header, and the number of lines it could not read: those are warnings for
 * the import plan, not silent losses.
 */

export type GedLine = {
    level: number;
    xref: string | null;
    tag: string;
    value: string;
    children: GedLine[];
};

export type GedRecord = GedLine;

export type GedcomFile = {
    /** "5.5", "5.5.1", "7.0" or "unknown": the GEDC.VERS value of the header. */
    version: string;
    /** The CHAR value of the header in upper case, or "" when the header has none. */
    encoding: string;
    records: GedRecord[];
    /** Lines that do not follow the grammar; they are skipped and counted. */
    skippedLines: number;
};

const LINE = /^(\d+) (?:(@[A-Za-z0-9_]+@) )?([A-Za-z0-9_]+)(?: (.*))?$/;

/**
 * A raw line as the grammar reads it: without a byte-order mark and without leading white space.
 * GEDCOM 5.5.1 lets writers indent the lines by level and asks readers to accept that, so the
 * indent is dropped; what follows the tag is left alone, the value may start with a space.
 */
function cleanLine(raw: string): string {
    return raw.replace(/^﻿/, "").replace(/^[ \t]+/, "");
}

/**
 * The GEDC.VERS of the header, read before the lines are parsed (it decides the "@" rule). GEDC
 * may stand anywhere among the children of HEAD (SOUR and CHAR often come first), so every line of
 * the header is looked at; the search stops at the first record after it.
 */
function detectVersion(lines: string[]): string {
    let inHead = false;
    let inGedc = false;
    for (const raw of lines) {
        const match = LINE.exec(cleanLine(raw));
        if (!match) continue;
        const level = Number(match[1]);
        const tag = match[3];
        if (level === 0) {
            if (tag !== "HEAD") break;
            inHead = true;
            continue;
        }
        if (!inHead) continue;
        if (level === 1) {
            inGedc = tag === "GEDC";
            continue;
        }
        if (level === 2 && inGedc && tag === "VERS") {
            return match[4]?.trim() || "unknown";
        }
    }
    return "unknown";
}

/**
 * The "@" rule of the version: 7.0 doubles only a leading "@" of a line string;
 * 5.5 and 5.5.1 double every "@".
 */
function unescapeValue(value: string, version: string): string {
    if (version.startsWith("7")) return value.startsWith("@@") ? value.slice(1) : value;
    return value.replace(/@@/g, "@");
}

/** Reads the GEDCOM text into records with their nested lines. */
export function parseGedcomFile(text: string): GedcomFile {
    const rawLines = text.split(/\r\n|\r|\n/);
    const version = detectVersion(rawLines);
    const roots: GedLine[] = [];
    const stack: GedLine[] = [];
    let skippedLines = 0;

    for (const raw of rawLines) {
        const line = cleanLine(raw);
        if (line.trim() === "") continue;

        const match = LINE.exec(line);
        if (!match) {
            skippedLines += 1;
            continue;
        }

        const [, levelText = "", xref, tagText = "", valueText] = match;
        const level = Number(levelText);
        const tag = tagText;
        // Only one space separates the tag from the value; further spaces belong to it.
        const value = unescapeValue(valueText ?? "", version);

        // CONT and CONC continue the value of their parent, the line one level up - not whatever
        // line came last: "1 NOTE a / 2 SOUR @S1@ / 2 CONT b" continues the note, not the source.
        if (tag === "CONT" || tag === "CONC") {
            const parent = level > 0 && level <= stack.length ? stack[level - 1] : undefined;
            if (!parent) {
                skippedLines += 1;
                continue;
            }
            parent.value += tag === "CONT" ? `\n${value}` : value;
            continue;
        }

        const node: GedLine = {
            level,
            xref: xref ?? null,
            tag,
            value,
            children: [],
        };

        if (level > stack.length) {
            // A line cannot start a level deeper than the line above it plus one.
            skippedLines += 1;
            continue;
        }
        stack.length = level;
        if (level === 0) {
            roots.push(node);
        } else {
            stack[level - 1]?.children.push(node);
        }
        stack[level] = node;
    }

    const header = roots.find((node) => node.tag === "HEAD");
    const encoding = header ? (child(header, "CHAR")?.value.trim().toUpperCase() ?? "") : "";

    return {
        version,
        encoding,
        records: roots.filter(
            (node) => node.level === 0 && node.tag !== "HEAD" && node.tag !== "TRLR",
        ),
        skippedLines,
    };
}

/** The first child with the tag, or undefined. */
export function child(node: GedLine, tag: string): GedLine | undefined {
    return node.children.find((item) => item.tag === tag);
}

/** All children with the tag. */
export function childrenOf(node: GedLine, tag: string): GedLine[] {
    return node.children.filter((item) => item.tag === tag);
}
