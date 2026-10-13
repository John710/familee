"use client";

/**
 * Familee - the canvas of the visual tree
 *
 * React Flow draws the cards and the lines; the positions come from the server (see
 * src/lib/tree-view.ts), so nothing here moves a card. A click on a card opens a small panel
 * that comes out of that card, with a button to the card page. The search bar finds people by
 * name: the matches are marked, and the canvas centres on the first one; Enter and the arrows
 * go on to the next. The browser's context menu is switched off on the canvas. Panning and
 * zooming stay on.
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
    ReactFlowProvider,
    useReactFlow,
} from "@xyflow/react";
import { ChevronDown, ChevronUp, Images, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { Link } from "@/i18n/navigation";
import { cropStyle } from "@/lib/photo-crop";
import { focusedNodeIds } from "@/lib/tree-focus";
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

/** What a card needs on the canvas: its data, its state, and how to close its panel. */
type PersonFlowData = PersonNodeData & {
    selected: boolean;
    highlighted: boolean;
    /** Outside the focus: the card stays on the canvas, but dimmed. */
    dimmed: boolean;
    canEdit: boolean;
    onClose: () => void;
    onFocus: () => void;
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
                data-match={data.highlighted ? "true" : "false"}
                className={`person-card nodrag flex h-full w-full overflow-hidden text-start transition-opacity ${sexBorder(data.sex)} ${data.dimmed ? "opacity-25" : ""}`}
            >
                <span
                    aria-hidden="true"
                    style={data.photoCrop ? { containerType: "size" } : undefined}
                    className={`relative flex aspect-square h-full shrink-0 items-center justify-center overflow-hidden font-semibold text-xl ${data.photoUrl ? "" : "person-photo-empty"}`}
                >
                    {data.photoUrl ? (
                        // biome-ignore lint/performance/noImgElement: the picture comes from our own route, already sized as a thumbnail
                        <img
                            src={data.photoUrl}
                            alt=""
                            loading="lazy"
                            className={
                                data.photoCrop ? "absolute max-w-none" : "size-full object-cover"
                            }
                            style={cropStyle(data.photoCrop, data.photoRatio)}
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
            {data.isSelf && (
                <span className="badge badge-primary badge-sm pointer-events-none absolute -top-2 -right-2 z-10 shadow">
                    {t("tree.view.you")}
                </span>
            )}
            <NodeToolbar isVisible={data.selected} position={Position.Right} offset={16}>
                <PersonPanel data={data} />
            </NodeToolbar>
        </div>
    );
}

function UnionDot({ data }: NodeProps<Node<{ dimmed: boolean }, "union">>) {
    return (
        <div
            className={`rounded-full bg-base-content/40 transition-opacity ${data.dimmed ? "opacity-20" : ""}`}
            style={{ width: 12, height: 12 }}
        >
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

    const { details } = data;

    return (
        // The scrollable panel keeps the wheel for itself: scrolling it does not zoom the canvas.
        <div
            role="dialog"
            aria-label={name}
            className="card card-border nowheel max-h-[70vh] w-80 overflow-y-auto bg-base-100 shadow-lg"
        >
            <div className="card-body gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                        <h2 className="font-semibold text-base leading-snug">{name}</h2>
                        {years && <p className="text-base-content/70 text-sm">{years}</p>}
                    </div>
                    <Link
                        href={data.albumHref}
                        aria-label={t("gallery.albumLink")}
                        title={t("gallery.albumLink")}
                        className="btn btn-ghost btn-sm btn-square shrink-0"
                    >
                        <Images className="size-4" />
                    </Link>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className="badge badge-soft">
                        {t(`enums.sex.${data.sex as "male" | "female" | "unknown"}`)}
                    </span>
                    {data.isLiving !== null && (
                        <span className="badge badge-soft">
                            {data.isLiving ? t("person.living") : t("person.deceased")}
                        </span>
                    )}
                    {data.isSelf && (
                        <span className="badge badge-primary">{t("tree.view.you")}</span>
                    )}
                </div>

                {details.notes && (
                    <p className="line-clamp-4 whitespace-pre-line text-base-content/80 text-sm">
                        {details.notes}
                    </p>
                )}

                <section className="flex flex-col gap-2">
                    <h3 className="font-medium text-base-content/60 text-xs uppercase tracking-wide">
                        {t("tree.view.timeline")}
                    </h3>
                    {details.timeline.length === 0 ? (
                        <p className="text-base-content/60 text-sm">{t("tree.view.noTimeline")}</p>
                    ) : (
                        <ol className="flex flex-col gap-3 border-base-300 border-l pl-4">
                            {details.timeline.map((item) => (
                                <li key={item.key} className="relative flex flex-col gap-0.5">
                                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
                                    <span className="text-base-content/60 text-xs">
                                        {item.date ?? t("common.none")}
                                    </span>
                                    <span className="text-sm">
                                        {t(`events.${item.typeCode}` as "events.birth")}
                                        {item.partner
                                            ? ` · ${t("tree.view.withPartner", { name: item.partner })}`
                                            : ""}
                                        {item.value ? ` · ${item.value}` : ""}
                                    </span>
                                    {item.description && (
                                        <span className="whitespace-pre-line text-base-content/70 text-xs">
                                            {item.description}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <div className="flex flex-wrap items-center gap-2">
                    <Link href={data.href} className="btn btn-primary btn-sm">
                        {data.canEdit ? t("person.edit") : t("person.openCard")}
                    </Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={data.onFocus}>
                        {t("tree.view.focus.enable")}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** The focus bar: whose ancestors and descendants are shown, and how many generations. */
function FocusBar({
    name,
    depth,
    onDepth,
    onOff,
}: {
    name: string;
    depth: number;
    onDepth: (depth: number) => void;
    onOff: () => void;
}) {
    const t = useTranslations();
    return (
        <div className="card card-border absolute top-3 right-3 z-10 flex-row flex-wrap items-center gap-3 bg-base-100 p-2 shadow-md">
            <div className="flex min-w-0 flex-col">
                <span className="text-base-content/60 text-xs">{t("tree.view.focus.title")}</span>
                <span className="max-w-48 truncate font-medium text-sm">{name}</span>
            </div>
            <label className="flex items-center gap-2 text-xs">
                <span>{t("tree.view.focus.generations")}</span>
                <select
                    className="select select-sm w-auto"
                    value={depth}
                    onChange={(event) => onDepth(Number(event.target.value))}
                >
                    {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                            {value}
                        </option>
                    ))}
                </select>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOff}>
                {t("tree.view.focus.off")}
            </button>
        </div>
    );
}

/** The search bar over the canvas: finds people by name and walks through the matches. */
function TreeSearch({
    matches,
    cursor,
    query,
    onQuery,
    onStep,
}: {
    matches: number;
    cursor: number;
    query: string;
    onQuery: (value: string) => void;
    onStep: (delta: number) => void;
}) {
    const t = useTranslations();

    function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
        }
        if (event.key === "Escape") onQuery("");
    }

    return (
        <div className="card card-border absolute top-3 left-3 z-10 flex-row items-center gap-2 bg-base-100 p-2 shadow-md">
            <Search className="ml-1 size-4 text-base-content/60" aria-hidden="true" />
            <input
                type="search"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("tree.view.searchPlaceholder")}
                aria-label={t("tree.view.searchPlaceholder")}
                className="input input-sm w-52"
            />
            {query.trim() !== "" && (
                <>
                    <span className="min-w-20 text-center text-base-content/70 text-xs">
                        {matches === 0
                            ? t("tree.view.searchNone")
                            : t("tree.view.searchCount", { current: cursor + 1, total: matches })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-square"
                        aria-label={t("tree.view.searchPrevious")}
                        disabled={matches === 0}
                        onClick={() => onStep(-1)}
                    >
                        <ChevronUp className="size-4" />
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-square"
                        aria-label={t("tree.view.searchNext")}
                        disabled={matches === 0}
                        onClick={() => onStep(1)}
                    >
                        <ChevronDown className="size-4" />
                    </button>
                </>
            )}
        </div>
    );
}

function TreeCanvasInner({
    nodes,
    edges,
    canEdit,
}: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const { setCenter, getZoom } = useReactFlow();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const [focus, setFocus] = useState<{ nodeId: string; depth: number } | null>(null);
    const close = () => setSelectedId(null);

    // In the focus mode the cards outside the person's ancestors and descendants are dimmed.
    const focusKeep = useMemo(
        () => (focus ? focusedNodeIds(edges, focus.nodeId, focus.depth) : null),
        [focus, edges],
    );
    const focusName = useMemo(() => {
        const node = nodes.find((candidate) => candidate.id === focus?.nodeId);
        return node?.type === "person" ? node.data.name || t("common.unknown") : "";
    }, [nodes, focus, t]);

    // Entering the focus centres the canvas on the person; changing the depth does not move it.
    const focusNodeId = focus?.nodeId ?? null;
    useEffect(() => {
        if (!focusNodeId) return;
        const node = latestNodes.current.find((candidate) => candidate.id === focusNodeId);
        if (!node) return;
        void setCenter(node.position.x + CARD_WIDTH / 2, node.position.y + CARD_HEIGHT / 2, {
            zoom: Math.max(getZoom(), 0.9),
            duration: 400,
        });
    }, [focusNodeId, setCenter, getZoom]);

    // The people whose name contains the query, in the order of the tree.
    const matches = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        if (needle === "") return [] as string[];
        return nodes
            .filter((node): node is Extract<FlowNode, { type: "person" }> => node.type === "person")
            .filter((node) => node.data.name.toLocaleLowerCase().includes(needle))
            .map((node) => node.id);
    }, [nodes, query]);

    const activeIndex = matches.length === 0 ? 0 : Math.min(cursor, matches.length - 1);
    const activeId = matches[activeIndex] ?? null;

    // The latest nodes are kept in a ref: the canvas moves when the active match changes, not
    // whenever the list of nodes is rebuilt.
    const latestNodes = useRef(nodes);
    useEffect(() => {
        latestNodes.current = nodes;
    }, [nodes]);

    // Whenever the active match changes, the canvas moves to it.
    useEffect(() => {
        if (!activeId) return;
        const node = latestNodes.current.find((candidate) => candidate.id === activeId);
        if (!node) return;
        void setCenter(node.position.x + CARD_WIDTH / 2, node.position.y + CARD_HEIGHT / 2, {
            zoom: Math.max(getZoom(), 0.9),
            duration: 400,
        });
    }, [activeId, setCenter, getZoom]);

    const matchSet = useMemo(() => new Set(matches), [matches]);

    // The open card is raised above its neighbours, so its panel is not hidden by them.
    const flowNodes = nodes.map((node) => {
        const dimmed = focusKeep !== null && !focusKeep.has(node.id);
        if (node.type === "person") {
            return {
                ...node,
                zIndex: node.id === selectedId ? 1000 : 0,
                data: {
                    ...node.data,
                    selected: node.id === selectedId,
                    highlighted: matchSet.has(node.id),
                    dimmed,
                    canEdit,
                    onClose: close,
                    onFocus: () => {
                        setFocus((current) => ({
                            nodeId: node.id,
                            depth: current?.depth ?? 3,
                        }));
                        close();
                    },
                },
            };
        }
        return { ...node, data: { ...node.data, dimmed } };
    }) as Node[];

    const flowEdges: Edge[] = edges.map((edge) => {
        const outside =
            focusKeep !== null && !(focusKeep.has(edge.source) && focusKeep.has(edge.target));
        return {
            ...edge,
            selectable: false,
            focusable: false,
            style: {
                stroke: "color-mix(in oklab, var(--color-base-content) 45%, transparent)",
                strokeWidth: 1.5,
                opacity: outside ? 0.12 : 1,
            },
        };
    });

    function step(delta: number) {
        if (matches.length === 0) return;
        setCursor((activeIndex + delta + matches.length) % matches.length);
    }

    return (
        <div className="relative h-full w-full">
            <TreeSearch
                matches={matches.length}
                cursor={activeIndex}
                query={query}
                onQuery={(value) => {
                    setQuery(value);
                    setCursor(0);
                }}
                onStep={step}
            />
            {focus && (
                <FocusBar
                    name={focusName}
                    depth={focus.depth}
                    onDepth={(depth) => setFocus({ ...focus, depth })}
                    onOff={() => setFocus(null)}
                />
            )}
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

export function TreeCanvas(props: { nodes: FlowNode[]; edges: FlowEdge[]; canEdit: boolean }) {
    return (
        <ReactFlowProvider>
            <TreeCanvasInner {...props} />
        </ReactFlowProvider>
    );
}
