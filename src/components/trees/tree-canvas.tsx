"use client";

/**
 * Familee - the canvas of the visual tree
 *
 * React Flow draws the cards and the lines; the positions come from the server (see
 * src/lib/tree-view.ts), so nothing here moves a card. A click on a card opens a small
 * panel that comes out of that card, with a button to the card page; the browser's
 * context menu is switched off on the canvas, because right-clicking here means nothing
 * to the archive. Panning and zooming stay on.
 */

import "@xyflow/react/dist/style.css";

import {
    Controls,
    type Edge,
    Handle,
    type Node,
    type NodeProps,
    NodeToolbar,
    Position,
    ReactFlow,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/tree-layout";
import type { FlowEdge, FlowNode, PersonNodeData } from "@/lib/tree-view";

/**
 * The four sides of a card or a junction. The handles are invisible: the lines are drawn
 * from them, and their ids match the edges built on the server (src/lib/tree-view.ts).
 */
function Sides() {
    const hidden = { opacity: 0, pointerEvents: "none" } as const;
    return (
        <>
            <Handle type="target" position={Position.Top} id="top" style={hidden} />
            <Handle type="source" position={Position.Bottom} id="bottom" style={hidden} />
            <Handle type="target" position={Position.Left} id="left" style={hidden} />
            <Handle type="source" position={Position.Right} id="right" style={hidden} />
        </>
    );
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => Array.from(word)[0] ?? "")
        .join("")
        .toUpperCase();
}

/** The life years as one line, or null when neither date is known. */
function useYears(data: PersonNodeData): string | null {
    const t = useTranslations();
    if (data.birthYear && data.deathYear) {
        return t("date.lifespan", { birth: data.birthYear, death: data.deathYear });
    }
    if (data.birthYear) return t("date.lifespanBirthOnly", { birth: data.birthYear });
    if (data.deathYear) return t("date.lifespanDeathOnly", { death: data.deathYear });
    return null;
}

/** The sex colours: blue for men, pink for women; the rest keep the neutral border. */
function sexBorder(sex: string): string {
    if (sex === "male") return "border-sky-500";
    if (sex === "female") return "border-pink-400";
    return "border-base-300";
}

/** What a card needs on the canvas: its data, whether it is open, and how to close it. */
type PersonFlowData = PersonNodeData & {
    selected: boolean;
    canEdit: boolean;
    onClose: () => void;
};

function PersonCard({ data }: NodeProps<Node<PersonFlowData, "person">>) {
    const t = useTranslations();
    const name = data.name || t("common.unknown");
    const years = useYears(data);
    const deceased = data.isLiving === false;
    const label = deceased ? `${name}, ${t("person.deceased")}` : name;

    return (
        <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
            <Sides />
            <button
                type="button"
                aria-label={label}
                data-selected={data.selected ? "true" : "false"}
                className={`person-card nodrag flex h-full w-full overflow-hidden text-start ${sexBorder(data.sex)}`}
            >
                <span
                    aria-hidden="true"
                    className={`relative flex aspect-square h-full shrink-0 items-center justify-center overflow-hidden font-semibold text-xl ${data.photoUrl ? "" : "person-photo-empty"}`}
                >
                    {data.photoUrl ? (
                        // biome-ignore lint/performance/noImgElement: the picture comes from our own route, already sized as a thumbnail
                        <img
                            src={data.photoUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                        />
                    ) : (
                        initials(name)
                    )}
                    {deceased && (
                        <span className="pointer-events-none absolute -right-9 bottom-2 h-3 w-28 -rotate-45 bg-black" />
                    )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3">
                    <span className="line-clamp-2 break-words font-medium text-sm leading-snug">
                        {name}
                    </span>
                    {years && <span className="text-base-content/60 text-xs">{years}</span>}
                </span>
            </button>
            <NodeToolbar isVisible={data.selected} position={Position.Right} offset={16}>
                <PersonPanel data={data} />
            </NodeToolbar>
        </div>
    );
}

function UnionDot() {
    return (
        <div className="rounded-full bg-base-content/40" style={{ width: 12, height: 12 }}>
            <Sides />
        </div>
    );
}

const nodeTypes = { person: PersonCard, union: UnionDot };

/** The browser's menu is not wanted on the canvas: right-click does nothing here. */
function preventMenu(event: { preventDefault: () => void }) {
    event.preventDefault();
}

/** The panel that comes out of an open card: name, years, status and the way to the card. */
function PersonPanel({ data }: { data: PersonFlowData }) {
    const t = useTranslations();
    const years = useYears(data);
    const name = data.name || t("common.unknown");
    const { onClose } = data;

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-label={name}
            className="card card-border w-72 bg-base-100 shadow-lg"
        >
            <div className="card-body gap-3 p-4">
                <h2 className="font-semibold text-base leading-snug">{name}</h2>
                {years && <p className="text-base-content/70 text-sm">{years}</p>}
                <div className="flex flex-wrap gap-2">
                    <span className="badge badge-soft">
                        {t(`enums.sex.${data.sex as "male" | "female" | "unknown"}`)}
                    </span>
                    {data.isLiving !== null && (
                        <span className="badge badge-soft">
                            {data.isLiving ? t("person.living") : t("person.deceased")}
                        </span>
                    )}
                </div>
                <Link href={data.href} className="btn btn-primary btn-sm self-start">
                    {data.canEdit ? t("person.edit") : t("person.openCard")}
                </Link>
            </div>
        </div>
    );
}

export function TreeCanvas({
    nodes,
    edges,
    canEdit,
}: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const close = () => setSelectedId(null);

    // The open card is raised above its neighbours, so its panel is not hidden by them.
    const flowNodes = nodes.map((node) =>
        node.type === "person"
            ? {
                  ...node,
                  zIndex: node.id === selectedId ? 1000 : 0,
                  data: {
                      ...node.data,
                      selected: node.id === selectedId,
                      canEdit,
                      onClose: close,
                  },
              }
            : node,
    ) as Node[];

    const flowEdges: Edge[] = edges.map((edge) => ({
        ...edge,
        selectable: false,
        focusable: false,
        style: {
            stroke: "color-mix(in oklab, var(--color-base-content) 45%, transparent)",
            strokeWidth: 1.5,
        },
    }));

    return (
        <div className="relative h-full w-full">
            <ReactFlow
                className="tree-canvas"
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onPaneContextMenu={preventMenu}
                onNodeContextMenu={preventMenu}
                onEdgeContextMenu={preventMenu}
                onNodeClick={(_, node) => {
                    if (node.type === "person") setSelectedId(node.id);
                }}
                onPaneClick={close}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                minZoom={0.2}
                maxZoom={1.5}
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
                ariaLabelConfig={{
                    "controls.zoomIn.ariaLabel": t("tree.view.zoomIn"),
                    "controls.zoomOut.ariaLabel": t("tree.view.zoomOut"),
                    "controls.fitView.ariaLabel": t("tree.view.fitView"),
                }}
            >
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
