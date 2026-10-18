/**
 * Familee - drawing a tree as one picture
 *
 * The canvas is drawn by React Flow inside the browser and cannot leave the screen. This module
 * draws the same tree as a plain SVG - the same cards, the same lines, the same places - so that a
 * tree can be saved as a picture or printed on paper. The cards carry the monogram, the name and
 * the life years; the photographs are left out, because a picture of a large tree must stay small
 * enough to download.
 *
 * Pure functions, no React and no database: the export page and the unit tests read the same
 * answer.
 */

import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/tree-layout";
import type { FlowEdge, FlowNode, PersonNodeData } from "@/lib/tree-view";

/** The size of a union's dot, matching the canvas (JUNCTION_SIZE in ./tree-view.ts). */
const JUNCTION_SIZE = 12;
/** The margin left around the drawing. */
const PADDING = 40;
/** The band above the drawing, where the title stands. */
const HEADER = 76;
/** How far the corners of a bent line are rounded. */
const CORNER = 8;
/** The monogram's square on a card, and the space between it and the name. */
const AVATAR = 92;
const TEXT_GAP = 12;
const NAME_SIZE = 13;
const YEARS_SIZE = 12;
const LINE_HEIGHT = 17;

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#9ca3af";
const CARD_FILL = "#ffffff";
const AVATAR_FILL = "#f1f3f5";
const BORDER = "#d1d5db";
const SELF_FILL = "#4f46e5";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The border of a card, by the sex of the person; the canvas colours its lines the same way. */
const SEX_STROKE: Record<string, string> = { male: "#00a5ef", female: "#fb64b6" };

/** The same two colours for a line: the sex of the person it ends at (the canvas reads them). */
const TONE_STROKE: Record<string, string> = { male: "#00a5ef", female: "#fb64b6" };

export type TreeImageLabels = {
    /** What to write on a card whose name is not known. */
    unknown: string;
    /** The word on the card of the reader's own person. */
    you: string;
    /** The line under the drawing, usually the day the picture was taken; left out when absent. */
    footer?: string;
};

export type TreeImageInput = {
    title: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
    labels: TreeImageLabels;
    /** The life years of a person as one line, or null when neither date is known. */
    years?: (data: PersonNodeData) => string | null;
};

export type TreeImage = {
    /** The size of the picture in pixels. */
    width: number;
    height: number;
    svg: string;
};

type Point = { x: number; y: number };
type Side = "top" | "bottom" | "left" | "right";
type Box = { x: number; y: number; w: number; h: number };

/** Two decimals are enough for a picture and keep the file small. */
function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** The first letters of the first two words, as they stand on a card without a photograph. */
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => Array.from(word)[0] ?? "")
        .join("")
        .toUpperCase();
}

/**
 * How wide a letter is, as a part of the font size. The picture is drawn on the server, where there
 * is no font to measure with, so a name is wrapped by these numbers: a capital and a wide letter
 * take more room than a narrow one, and a space takes the least.
 */
function letterWidth(char: string): number {
    if (char === " ") return 0.28;
    if ("iljtfrI!.,:;'\"|()[]\\/-".includes(char)) return 0.33;
    if (/[A-ZÀ-ÖØ-ÞА-ЯЁ]/.test(char)) return 0.68;
    return 0.55;
}

/** The width of a piece of text at the given font size. */
export function textWidth(text: string, size: number): number {
    let width = 0;
    for (const char of text) width += letterWidth(char) * size;
    return width;
}

/** The line shortened until an ellipsis still fits in its end. */
function withEllipsis(line: string, maxWidth: number, size: number): string {
    let text = line;
    while (text.length > 0 && textWidth(`${text}…`, size) > maxWidth) text = text.slice(0, -1);
    return `${text}…`;
}

/**
 * A name broken into at most `maxLines` lines, none of them wider than `maxWidth` at the given
 * font size. A word too long for a line is cut where the line ends; when the name does not fit, the
 * last line carries an ellipsis instead.
 */
export function wrapLines(
    text: string,
    maxWidth: number,
    maxLines: number,
    size: number,
): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || maxLines < 1) return [];

    const lines: string[] = [];
    let rest = words;
    while (rest.length > 0 && lines.length < maxLines) {
        const last = lines.length === maxLines - 1;
        let line = "";
        let taken = 0;
        let cut = false;
        for (const word of rest) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && textWidth(candidate, size) > maxWidth) break;
            taken += 1;
            if (textWidth(candidate, size) > maxWidth) {
                // A single word wider than the line is cut where the line ends.
                line = "";
                for (const char of word) {
                    if (textWidth(`${line}${char}`, size) > maxWidth) break;
                    line += char;
                }
                cut = true;
                break;
            }
            line = candidate;
        }
        rest = rest.slice(Math.max(taken, 1));
        // The last line carries the ellipsis when there is more to say than room to say it.
        lines.push(last && (rest.length > 0 || cut) ? withEllipsis(line, maxWidth, size) : line);
    }
    return lines;
}

/** Where a line leaves or reaches a box. */
function anchor(box: Box, side: Side): Point {
    if (side === "top") return { x: box.x + box.w / 2, y: box.y };
    if (side === "bottom") return { x: box.x + box.w / 2, y: box.y + box.h };
    if (side === "left") return { x: box.x, y: box.y + box.h / 2 };
    return { x: box.x + box.w, y: box.y + box.h / 2 };
}

/** Whether a side is reached from above or below (a vertical line) rather than from the side. */
function isVertical(side: Side): boolean {
    return side === "top" || side === "bottom";
}

/**
 * The corners a line passes through: a straight one has none, the others step halfway. This is the
 * same way React Flow sends a line from a card to a junction.
 */
export function edgePoints(from: Box, fromSide: Side, to: Box, toSide: Side): Point[] {
    const start = anchor(from, fromSide);
    const end = anchor(to, toSide);
    if (isVertical(fromSide) && isVertical(toSide)) {
        const middle = (start.y + end.y) / 2;
        return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
    }
    if (!isVertical(fromSide) && !isVertical(toSide)) {
        const middle = (start.x + end.x) / 2;
        return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
    }
    // One side is reached from the side and the other from above: one corner is enough.
    return isVertical(fromSide)
        ? [start, { x: start.x, y: end.y }, end]
        : [start, { x: end.x, y: start.y }, end];
}

/** A line through the given corners, its bends rounded. */
export function roundedPath(points: Point[], radius: number): string {
    if (points.length < 2) return "";
    const at = (point: Point): string => `${round(point.x)} ${round(point.y)}`;
    const first = points[0];
    if (!first) return "";
    let path = `M ${at(first)}`;
    for (let index = 1; index < points.length - 1; index++) {
        const before = points[index - 1];
        const corner = points[index];
        const after = points[index + 1];
        if (!before || !corner || !after) continue;
        const near = Math.min(
            radius,
            Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
            Math.hypot(after.x - corner.x, after.y - corner.y) / 2,
        );
        const into = toward(corner, before, near);
        const out = toward(corner, after, near);
        path += ` L ${at(into)} Q ${at(corner)} ${at(out)}`;
    }
    const last = points[points.length - 1];
    if (last) path += ` L ${at(last)}`;
    return path;
}

/** The point `distance` away from `from`, on the way to `to`. */
function toward(from: Point, to: Point, distance: number): Point {
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (span === 0) return from;
    return {
        x: from.x + ((to.x - from.x) * distance) / span,
        y: from.y + ((to.y - from.y) * distance) / span,
    };
}

/** The name of the file a picture is saved under, taken from the title of the tree. */
export function treeImageFileName(title: string, extension: "svg" | "png"): string {
    const name = title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    return `${name || "family-tree"}.${extension}`;
}

/** A card: the monogram, the name, the years, and the marks of "you" and of a death. */
function cardSvg(
    box: Box,
    data: PersonNodeData,
    labels: TreeImageLabels,
    years: string | null,
): string[] {
    const name = data.name || labels.unknown;
    const stroke = SEX_STROKE[data.sex] ?? BORDER;
    const nameWidth = CARD_WIDTH - AVATAR - TEXT_GAP * 2;
    const lines = wrapLines(name, nameWidth, 2, NAME_SIZE);
    const parts: string[] = [
        `<rect x="${round(box.x)}" y="${round(box.y)}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="12" fill="${CARD_FILL}" stroke="${stroke}" stroke-width="2"/>`,
        `<rect x="${round(box.x + 1)}" y="${round(box.y + 1)}" width="${AVATAR - 2}" height="${CARD_HEIGHT - 2}" fill="${AVATAR_FILL}"/>`,
        `<text x="${round(box.x + AVATAR / 2)}" y="${round(box.y + CARD_HEIGHT / 2 + 8)}" font-size="22" font-weight="600" fill="${MUTED}" text-anchor="middle">${escapeXml(initials(name))}</text>`,
    ];

    // The bar across the monogram of a person who is not alive, as on the canvas.
    if (data.isLiving === false) {
        parts.push(
            `<line x1="${round(box.x + 6)}" y1="${round(box.y + 80)}" x2="${round(box.x + 80)}" y2="${round(box.y + 6)}" stroke="#111827" stroke-width="3"/>`,
        );
    }

    const linesHeight = lines.length * LINE_HEIGHT + (years ? YEARS_SIZE + 6 : 0);
    let baseline = box.y + (CARD_HEIGHT - linesHeight) / 2 + NAME_SIZE;
    const textX = round(box.x + AVATAR + TEXT_GAP);
    for (const line of lines) {
        parts.push(
            `<text x="${textX}" y="${round(baseline)}" font-size="${NAME_SIZE}" fill="${INK}">${escapeXml(line)}</text>`,
        );
        baseline += LINE_HEIGHT;
    }
    if (years) {
        parts.push(
            `<text x="${textX}" y="${round(baseline + 2)}" font-size="${YEARS_SIZE}" fill="${MUTED}">${escapeXml(years)}</text>`,
        );
    }

    if (data.isSelf) {
        const width = 16 + labels.you.length * 6;
        const x = box.x + CARD_WIDTH - width - 6;
        parts.push(
            `<rect x="${round(x)}" y="${round(box.y - 10)}" width="${width}" height="20" rx="10" fill="${SELF_FILL}"/>`,
            `<text x="${round(x + width / 2)}" y="${round(box.y + 4)}" font-size="11" fill="#ffffff" text-anchor="middle">${escapeXml(labels.you)}</text>`,
        );
    }

    return parts;
}

/**
 * The whole tree as one SVG picture: the title on top, the cards and the lines under it, and the
 * footer in the corner when one is given.
 */
export function treeImage(input: TreeImageInput): TreeImage {
    const boxes = new Map<string, Box>();
    for (const node of input.nodes) {
        const size =
            node.type === "union"
                ? { w: JUNCTION_SIZE, h: JUNCTION_SIZE }
                : { w: CARD_WIDTH, h: CARD_HEIGHT };
        boxes.set(node.id, { x: node.position.x, y: node.position.y, ...size });
    }

    // Everything the picture has to hold: the cards and the junctions between them.
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const box of boxes.values()) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.w);
        maxY = Math.max(maxY, box.y + box.h);
    }
    if (boxes.size === 0) {
        minX = 0;
        minY = 0;
        maxX = 240;
        maxY = 0;
    }

    const width = maxX - minX + PADDING * 2;
    const height = maxY - minY + PADDING * 2 + HEADER;
    const shiftX = PADDING - minX;
    const shiftY = HEADER + PADDING - minY;

    // The lines first, then the junctions, then the cards: what is written on a card is never
    // covered by a line.
    const lines = input.edges.flatMap((edge) => {
        const from = boxes.get(edge.source);
        const to = boxes.get(edge.target);
        if (!from || !to) return [];
        const path = roundedPath(
            edgePoints(from, edge.sourceHandle as Side, to, edge.targetHandle as Side),
            CORNER,
        );
        return [
            `<path d="${path}" fill="none" stroke="${TONE_STROKE[edge.tone] ?? LINE}" stroke-width="1.5"/>`,
        ];
    });

    const junctions = input.nodes
        .filter((node) => node.type === "union")
        .map((node) => {
            const box = boxes.get(node.id);
            if (!box) return "";
            return `<circle cx="${round(box.x + box.w / 2)}" cy="${round(box.y + box.h / 2)}" r="${JUNCTION_SIZE / 2}" fill="${LINE}"/>`;
        });

    const cards = input.nodes.flatMap((node) => {
        const box = boxes.get(node.id);
        if (!box || node.type !== "person") return [];
        return cardSvg(box, node.data, input.labels, input.years?.(node.data) ?? null);
    });

    const footer = input.labels.footer
        ? `<text x="${round(width - PADDING)}" y="${round(height - 16)}" font-size="11" fill="${MUTED}" text-anchor="end">${escapeXml(input.labels.footer)}</text>`
        : "";

    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" font-family="${FONT}" role="img" aria-label="${escapeXml(input.title)}">`,
        `<rect width="${round(width)}" height="${round(height)}" fill="#ffffff"/>`,
        `<text x="${PADDING}" y="42" font-size="22" font-weight="600" fill="${INK}">${escapeXml(input.title)}</text>`,
        footer,
        `<g transform="translate(${round(shiftX)} ${round(shiftY)})">`,
        ...lines,
        ...junctions,
        ...cards,
        "</g>",
        "</svg>",
    ].join("\n");

    return { width: round(width), height: round(height), svg };
}
