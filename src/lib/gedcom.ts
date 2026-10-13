/**
 * Familee - reading a GEDCOM 5.5.1 file (the format of most genealogy programs)
 *
 * Two steps, both pure functions with no database access:
 *   1. parseGedcom() turns the text into a tree of lines (level, tag, value, children);
 *   2. planImport() turns the individuals and families into persons, names, events
 *      and unions, and lists what cannot be taken as it is as warnings.
 *
 * Nothing is written here. The import is shown as a plan first, so that a strange
 * record (a name in the wrong field, a date that does not read) is seen before it
 * reaches the tree.
 */

export type GedLine = {
    level: number;
    xref: string | null;
    tag: string;
    value: string;
    children: GedLine[];
};

export type GedRecord = GedLine & { tag: string };

/** Turns the GEDCOM text into records: lines of level 0 with their nested lines. */
export function parseGedcom(text: string): GedRecord[] {
    const roots: GedLine[] = [];
    const stack: GedLine[] = [];

    // CONT and CONC continue the value of the previous line.
    let previous: GedLine | null = null;

    // The line ends with CR, LF, or both (GEDCOM 5.4, chapter 1).
    for (const raw of text.split(/\r\n|\r|\n/)) {
        const line = raw.replace(/^﻿/, "");
        if (line.trim() === "") continue;

        const match = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/.exec(line);
        if (!match) continue;

        const [, levelText = "", xref, tagText = "", valueText] = match;
        const level = Number(levelText);
        const tag = tagText;
        const value = valueText ?? "";

        if (tag === "CONT" && previous) {
            previous.value += `\n${value}`;
            continue;
        }
        if (tag === "CONC" && previous) {
            previous.value += value;
            continue;
        }

        const node: GedLine = {
            level,
            xref: xref ?? null,
            tag,
            value,
            children: [],
        };

        stack.length = level;
        if (level === 0) {
            roots.push(node);
        } else {
            const parent = stack[level - 1];
            if (parent) parent.children.push(node);
        }
        stack[level] = node;
        previous = node;
    }

    return roots.filter((node): node is GedRecord => node.level === 0);
}

/** The first child with the tag, or undefined. */
export function child(node: GedLine, tag: string): GedLine | undefined {
    return node.children.find((item) => item.tag === tag);
}

/** All children with the tag. */
export function childrenOf(node: GedLine, tag: string): GedLine[] {
    return node.children.filter((item) => item.tag === tag);
}
