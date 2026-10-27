import type { GraphRow } from '../graph.ts';
import type { Ref } from '../log-format.ts';
import { t, type MessageKey } from './i18n.ts';

/** Height of one commit row, in CSS px. The dot sits in its middle. */
export const ROW = 26;
/** Distance between two lanes. */
const LANE = 14;
/** Lanes drawn at most; wider histories are clipped on the right. */
export const MAX_LANES = 24;
const SVG = 'http://www.w3.org/2000/svg';
// One colour per lane, from the theme. Syntax tokens are optional in the snapshot,
// so each falls back to a semantic colour every host provides.
const LANE_COLORS = [
  'var(--oc-syntax-keyword, var(--oc-primary))',
  'var(--oc-syntax-string, var(--oc-success))',
  'var(--oc-syntax-function, var(--oc-warning))',
  'var(--oc-syntax-type, var(--oc-info))',
  'var(--oc-syntax-number, var(--oc-error))',
  'var(--oc-primary)',
  'var(--oc-info)',
  'var(--oc-success)',
  'var(--oc-warning)',
  'var(--oc-error)',
];

export const STYLE = `
  html, body { margin: 0; height: 100%; background: transparent; color: var(--oc-fg); font: 12px/1.35 var(--oc-font); }
  body[data-surface="page"] { font-size: 13px; }
  #root { height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
  button { font: inherit; color: inherit; }
  .toolbar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 8px 6px; }
  .toolbar .search { flex: 1 1 160px; min-width: 120px; }
  .headinfo { display: flex; align-items: center; gap: 6px; color: var(--oc-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .headinfo .branch { color: var(--oc-fg); font-weight: 600; }
  .headinfo .dirty { color: var(--oc-warning-text); }
  .notice { flex: none; padding: 0 8px; }
  .notice:empty { display: none; }
  .notice > * + * { margin-top: 6px; }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 0 4px 8px; }
  .row { display: flex; align-items: center; gap: 8px; height: ${ROW}px; padding-right: 6px; border-radius: 4px;
    cursor: pointer; white-space: nowrap; }
  .row:hover { background: var(--oc-hover); }
  .row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--oc-focus); }
  .row.current .subject { font-weight: 600; }
  .graph { flex: none; display: block; overflow: visible; }
  .refs { flex: none; display: flex; gap: 4px; max-width: 45%; overflow: hidden; }
  .subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .author, .date { flex: none; color: var(--oc-muted); overflow: hidden; text-overflow: ellipsis; }
  .author { width: 110px; }
  .date { width: 90px; text-align: right; }
  .hash { flex: none; font-family: var(--oc-mono); font-size: 11px; color: var(--oc-muted); }
  .copy { all: unset; flex: none; cursor: pointer; font-size: 11px; color: var(--oc-muted); padding: 0 4px; border-radius: 4px;
    visibility: hidden; }
  .row:hover .copy, .row:focus-within .copy, .copy.done { visibility: visible; }
  .copy:hover { color: var(--oc-fg); background: var(--oc-active, var(--oc-hover)); }
  .copy:focus-visible { visibility: visible; box-shadow: 0 0 0 2px var(--oc-focus); }
  body[data-surface="panel"] .author, body[data-surface="panel"] .hash { display: none; }
  .ref { flex: none; max-width: 160px; overflow: hidden; text-overflow: ellipsis; border-radius: 4px; padding: 0 5px;
    font-size: 10.5px; line-height: 16px; font-weight: 600; border: 1px solid transparent; }
  .ref.current, .ref.head { background: var(--oc-primary); color: var(--oc-primary-fg); }
  .ref.local { border-color: var(--oc-border); color: var(--oc-fg); }
  .ref.remote { background: color-mix(in srgb, var(--oc-info) 16%, transparent); color: var(--oc-info-text); }
  .ref.tag { background: color-mix(in srgb, var(--oc-warning) 16%, transparent); color: var(--oc-warning-text); }
  .footer { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 8px 0; color: var(--oc-muted); }
  .footer:empty { display: none; }
`;

const laneX = (lane: number): number => LANE / 2 + 2 + lane * LANE;
export const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length] ?? 'var(--oc-muted)';
export const graphWidth = (lanes: number): number => Math.min(Math.max(lanes, 1), MAX_LANES) * LANE + 4;

const svgNode = <K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

export type DotKind = 'commit' | 'merge' | 'current';

/** One row of the graph: straight lanes first, curves over them, the dot on top. */
export const drawRowGraph = (row: GraphRow, width: number, dot: DotKind): SVGSVGElement => {
  const svg = svgNode('svg', { width, height: ROW, class: 'graph', 'aria-hidden': 'true' });
  const visible = (lane: number) => lane < MAX_LANES;
  const mid = ROW / 2;
  const x = laneX(row.lane);
  const isCurve = (type: string) => type === 'branch-out' || type === 'merge-in';
  const ordered = [...row.connectors.filter((c) => !isCurve(c.type)), ...row.connectors.filter((c) => isCurve(c.type))];
  for (const connector of ordered) {
    if (!visible(connector.fromLane) || !visible(connector.toLane)) continue;
    const from = laneX(connector.fromLane);
    const to = laneX(connector.toLane);
    const d = connector.type === 'passing' || connector.type === 'commit-lane' ? `M${from} 0 L${from} ${ROW}`
      : connector.type === 'top-stub' ? `M${from} 0 L${from} ${mid}`
        : connector.type === 'bottom-stub' ? `M${from} ${mid} L${from} ${ROW}`
          : connector.type === 'branch-out' ? `M${x} ${mid} C${x} ${ROW} ${to} ${mid} ${to} ${ROW}`
            : `M${from} 0 C${from} ${mid} ${x} 0 ${x} ${mid}`;
    // A curve takes the colour of the lane it comes from (merge-in) or goes to (branch-out).
    const lane = connector.type === 'branch-out' ? connector.toLane : connector.fromLane;
    svg.append(svgNode('path', { d, fill: 'none', stroke: laneColor(lane), 'stroke-width': 1.75, 'stroke-linecap': 'round' }));
  }
  if (visible(row.lane)) {
    const color = laneColor(row.lane);
    svg.append(svgNode('circle', dot === 'merge'
      ? { cx: x, cy: mid, r: 3.5, fill: 'var(--oc-bg)', stroke: color, 'stroke-width': 2 }
      : { cx: x, cy: mid, r: dot === 'current' ? 5 : 4, fill: color, stroke: 'var(--oc-bg)', 'stroke-width': 1.5 }));
  }
  return svg;
};

/** Filtered view: no lines (they would lie about ancestry), only the dot in its lane colour. */
export const drawDot = (lane: number): SVGSVGElement => {
  const svg = svgNode('svg', { width: 14, height: ROW, class: 'graph', 'aria-hidden': 'true' });
  svg.append(svgNode('circle', { cx: 7, cy: ROW / 2, r: 4, fill: laneColor(lane) }));
  return svg;
};

const REF_TITLE: Record<Ref['kind'], MessageKey> = {
  head: 'ref.head',
  local: 'ref.local',
  remote: 'ref.remote',
  tag: 'ref.tag',
};

export const refBadge = (ref: Ref): HTMLElement => {
  const isCurrent = ref.current && ref.kind === 'local';
  const badge = element('span', `ref ${isCurrent ? 'current' : ref.kind}`, isCurrent ? `HEAD → ${ref.name}` : ref.name);
  badge.title = t('common.labelled', { label: t(isCurrent ? 'ref.current' : REF_TITLE[ref.kind]), value: ref.name });
  return badge;
};

export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
