#!/usr/bin/env node
/**
 * Familee - the notes of a GitHub release, written from the commits since the previous tag.
 *
 * The commit subjects follow Conventional Commits ("feat: ...", "fix(persons): ..."). The prefix
 * decides the group; a subject without a known prefix goes to "Other", so nothing is lost. Every
 * item links to its commit, and the notes end with a link that compares the two tags.
 *
 *   node scripts/release-notes.mjs <previous-tag> <tag> > notes.md
 *   gh release create <tag> --title "Familee <version>" --notes-file notes.md
 *
 * Only the headings that have items are printed, in the order below.
 */

import { execFileSync } from "node:child_process";

const GROUPS = [
    { title: "Features", types: ["feat"] },
    { title: "Improvements", types: ["perf", "refactor"] },
    { title: "Bug fixes", types: ["fix"] },
    { title: "Tests", types: ["test"] },
    { title: "Documentation", types: ["docs"] },
    { title: "Build and release", types: ["ci", "build", "chore"] },
    { title: "Other", types: [] },
];

const SUBJECT = /^([a-z]+)(\([^)]*\))?!?:\s*(.+)$/;

function git(args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** "owner/repo" from the origin remote, for the commit and compare links. */
function repository() {
    const url = git(["remote", "get-url", "origin"]);
    const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
    if (!match) throw new Error(`origin is not a GitHub remote: ${url}`);
    return match[1];
}

function commitsBetween(previous, tag) {
    const out = git(["log", `${previous}..${tag}`, "--no-merges", "--format=%H%x09%s"]);
    if (out === "") return [];
    return out.split("\n").map((line) => {
        const [hash, subject] = line.split("\t");
        return { hash, subject };
    });
}

function groupOf(type) {
    return GROUPS.find((group) => group.types.includes(type)) ?? GROUPS[GROUPS.length - 1];
}

function notes(previous, tag) {
    const repo = repository();
    const buckets = new Map(GROUPS.map((group) => [group.title, []]));

    for (const commit of commitsBetween(previous, tag)) {
        const match = SUBJECT.exec(commit.subject);
        const type = match ? match[1] : "";
        const text = match ? match[3] : commit.subject;
        const group = match ? groupOf(type) : GROUPS[GROUPS.length - 1];
        const short = commit.hash.slice(0, 7);
        buckets
            .get(group.title)
            .push(`- ${text} ([\`${short}\`](https://github.com/${repo}/commit/${commit.hash}))`);
    }

    const lines = [];
    for (const [title, items] of buckets) {
        if (items.length === 0) continue;
        lines.push(`### ${title}`, "", ...items, "");
    }
    lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${previous}...${tag}`, "");
    return lines.join("\n");
}

const [previous, tag] = process.argv.slice(2);
if (!previous || !tag) {
    console.error("usage: node scripts/release-notes.mjs <previous-tag> <tag>");
    process.exit(2);
}
process.stdout.write(notes(previous, tag));
