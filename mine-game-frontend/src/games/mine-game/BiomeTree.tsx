import { useState, useMemo } from 'react';
import type { PlanetNodeView } from './GameSurface.types';
import magmaFieldsTexture from './assets/magma-fields.png';
import deepFreezeTexture from './assets/deep-freeze.png';
import hiveSprawlTexture from './assets/hive-sprawl.png';
import alienRuinsTexture from './assets/alien-ruins.png';
import thermalVentsTexture from './assets/thermal-vents.png';
import emberJungleTexture from './assets/ember-jungle.png';
import slagWastesTexture from './assets/slag-wastes.png';
import cryoMarshTexture from './assets/cryo-marsh.png';
import falloutTundraTexture from './assets/fallout-tundra.png';
import mutantThicketTexture from './assets/mutant-thicket.png';

interface BiomeTreeProps {
  nodes: PlanetNodeView[];
  currentNodeId?: number;
  visitedNodeIds?: number[];
  traversedEdges?: Array<[number, number]>;
  selectedNodeId?: number;
  onSelectNode?: (nodeId: number) => void;
}

const VIEW_SIZE = 600;
const CENTER = VIEW_SIZE / 2;
const MAX_DEPTH = 6;
const OUTER_RADIUS = VIEW_SIZE * 0.46;
const TREE_RADIUS = VIEW_SIZE * 0.41;
const NODE_RADIUS = 5;

const INTENSITY_FILL: Record<1 | 2 | 3, string> = {
  1: '#67e8f9',
  2: '#a78bfa',
  3: '#f43f5e',
};

const INTENSITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

const HAZARD_EMOJI: Record<string, string> = {
  heat: '🔥',
  cold: '❄️',
  bio: '🐛',
  rad: '☢️',
};

const MIN_HIT_RADIUS = 8;
const CIRCLE_SEGMENTS = 96;
const EPSILON = 1e-6;

type Point = { x: number; y: number };

const BIOME_TEXTURE: Record<string, string> = {
  magma_fields: magmaFieldsTexture,
  deep_freeze: deepFreezeTexture,
  hive_sprawl: hiveSprawlTexture,
  alien_ruins: alienRuinsTexture,
  thermal_vents: thermalVentsTexture,
  ember_jungle: emberJungleTexture,
  slag_wastes: slagWastesTexture,
  cryo_marsh: cryoMarshTexture,
  fallout_tundra: falloutTundraTexture,
  mutant_thicket: mutantThicketTexture,
};

function nodePosition(nodeId: number): { x: number; y: number } {
  const depth = Math.floor(Math.log2(nodeId));
  if (depth === 0) return { x: CENTER, y: CENTER };

  const nodesAtDepth = 1 << depth;
  const pos = nodeId - nodesAtDepth;
  const angle = ((pos + 0.5) / nodesAtDepth) * Math.PI * 2 - Math.PI / 2;
  const r = (depth / MAX_DEPTH) * TREE_RADIUS;

  return {
    x: CENTER + Math.cos(angle) * r,
    y: CENTER + Math.sin(angle) * r,
  };
}

function makeCirclePolygon(cx: number, cy: number, radius: number, segments: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
    });
  }
  return points;
}

function clipPolygonToHalfPlane(
  polygon: Point[],
  a: number,
  b: number,
  c: number,
): Point[] {
  if (polygon.length === 0) return polygon;
  const out: Point[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const s = polygon[i];
    const e = polygon[(i + 1) % polygon.length];
    const sInside = a * s.x + b * s.y <= c + EPSILON;
    const eInside = a * e.x + b * e.y <= c + EPSILON;

    if (sInside && eInside) {
      out.push(e);
      continue;
    }

    if (sInside !== eInside) {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const denom = a * dx + b * dy;
      if (Math.abs(denom) > EPSILON) {
        const t = (c - a * s.x - b * s.y) / denom;
        out.push({
          x: s.x + dx * t,
          y: s.y + dy * t,
        });
      }
    }

    if (!sInside && eInside) {
      out.push(e);
    }
  }

  return out;
}

function polygonToPath(polygon: Point[]): string {
  if (polygon.length === 0) return '';
  const first = polygon[0];
  const commands = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < polygon.length; i++) {
    const p = polygon[i];
    commands.push(`L ${p.x} ${p.y}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

function texturePatternId(nodeId: number): string {
  return `biome-texture-${nodeId}`;
}

function formatBiomeName(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function BiomeTree({
  nodes,
  currentNodeId,
  visitedNodeIds: _visitedNodeIds = [],
  traversedEdges = [],
  selectedNodeId,
  onSelectNode,
}: BiomeTreeProps) {
  const [hoveredNode, setHoveredNode] = useState<PlanetNodeView | null>(null);

  const posMap = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    for (const node of nodes) m.set(node.id, nodePosition(node.id));
    return m;
  }, [nodes]);

  const voronoiCells = useMemo(() => {
    const baseCircle = makeCirclePolygon(CENTER, CENTER, OUTER_RADIUS, CIRCLE_SEGMENTS);
    const sites = nodes
      .map((node) => {
        const pos = posMap.get(node.id);
        if (!pos) return null;
        return { node, pos };
      })
      .filter((entry): entry is { node: PlanetNodeView; pos: Point } => entry != null);

    return sites
      .map(({ node, pos }) => {
        let poly = baseCircle;
        for (const other of sites) {
          if (other.node.id === node.id) continue;

          const dx = other.pos.x - pos.x;
          const dy = other.pos.y - pos.y;
          const c = (other.pos.x * other.pos.x + other.pos.y * other.pos.y - pos.x * pos.x - pos.y * pos.y) / 2;
          poly = clipPolygonToHalfPlane(poly, dx, dy, c);
          if (poly.length < 3) break;
        }

        if (poly.length < 3) return null;
        return {
          nodeId: node.id,
          path: polygonToPath(poly),
          textureUrl: BIOME_TEXTURE[node.biomeType] ?? null,
        };
      })
      .filter((cell): cell is { nodeId: number; path: string; textureUrl: string | null } => cell != null);
  }, [nodes, posMap]);

  const hoveredPos = hoveredNode ? posMap.get(hoveredNode.id) : null;
  const tooltipAbove = hoveredPos ? hoveredPos.y > VIEW_SIZE * 0.18 : true;
  const traversedEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const [a, b] of traversedEdges) {
      const left = Math.min(a, b);
      const right = Math.max(a, b);
      set.add(`${left}-${right}`);
    }
    return set;
  }, [traversedEdges]);

  return (
    <div
      className="relative"
      style={{ height: '100%', maxHeight: VIEW_SIZE, aspectRatio: '1', maxWidth: '100%' }}
    >
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          {voronoiCells
            .filter((cell) => cell.textureUrl != null)
            .map((cell) => (
              <pattern
                key={`pattern-${cell.nodeId}`}
                id={texturePatternId(cell.nodeId)}
                patternUnits="userSpaceOnUse"
                width={64}
                height={64}
              >
                <image
                  href={cell.textureUrl ?? undefined}
                  x={0}
                  y={0}
                  width={64}
                  height={64}
                  preserveAspectRatio="xMidYMid slice"
                />
              </pattern>
            ))}
        </defs>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_RADIUS}
          fill="rgba(186, 230, 253, 0.9)"
          stroke="rgba(139, 92, 246, 0.25)"
          strokeWidth={2}
        />

        {voronoiCells.map((cell) => (
          <path
            key={`cell-${cell.nodeId}`}
            d={cell.path}
            fill={cell.textureUrl ? `url(#${texturePatternId(cell.nodeId)})` : 'rgba(139, 92, 246, 0.12)'}
            fillOpacity={0.75}
            stroke="rgba(139, 92, 246, 0.08)"
            strokeWidth={0.6}
          />
        ))}

        {[1, 2, 3, 4, 5, 6].map((d) => (
          <circle
            key={`ring-${d}`}
            cx={CENTER}
            cy={CENTER}
            r={(d / MAX_DEPTH) * TREE_RADIUS}
            fill="none"
            stroke="rgba(139, 92, 246, 0.06)"
            strokeWidth={0.5}
          />
        ))}

        {nodes.map((node) => {
          if (node.id <= 1) return null;
          const parentId = Math.floor(node.id / 2);
          const p = posMap.get(parentId);
          const c = posMap.get(node.id);
          if (!p || !c) return null;
          const edgeKey = `${Math.min(parentId, node.id)}-${Math.max(parentId, node.id)}`;
          const isTraversed = traversedEdgeSet.has(edgeKey);

          return (
            <g key={`edge-${node.id}`}>
              <line
                x1={p.x}
                y1={p.y}
                x2={c.x}
                y2={c.y}
                stroke={isTraversed ? 'rgba(251, 191, 36, 0.55)' : 'rgba(15, 23, 42, 0.34)'}
                strokeWidth={3.4}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={p.x}
                y1={p.y}
                x2={c.x}
                y2={c.y}
                stroke={isTraversed ? 'rgba(245, 158, 11, 1)' : 'rgba(56, 189, 248, 0.98)'}
                strokeWidth={1.9}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}

        {nodes.map((node) => {
          const pos = posMap.get(node.id);
          if (!pos) return null;

          const isCurrent = node.id === currentNodeId;
          const isSelected = node.id === selectedNodeId;
          const isHovered = hoveredNode?.id === node.id;
          const baseR = NODE_RADIUS;

          let r: number;
          let fill: string;
          let stroke: string;
          let sw: number;
          let opacity: number;

          if (isCurrent) {
            r = baseR * 1.8;
            fill = '#2563eb';
            stroke = '#ffffff';
            sw = 2.2;
            opacity = 1;
          } else {
            r = baseR;
            fill = INTENSITY_FILL[node.intensity];
            stroke = 'rgba(15, 23, 42, 0.4)';
            sw = 0.9;
            opacity = 1;
          }

          if (isHovered && !isCurrent) {
            r = Math.max(r, baseR) * 1.4;
            stroke = '#7c3aed';
            sw = 1.5;
            opacity = Math.max(opacity, 0.85);
          }

          return (
            <g key={`node-${node.id}`}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={Math.max(MIN_HIT_RADIUS, r + 3)}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectNode?.(node.id)}
              />
              {isSelected && !isCurrent && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={Math.max(r, baseR) + 5}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  opacity={Math.max(opacity, 0.9)}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {isCurrent && isSelected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r + 5}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={sw}
                opacity={opacity}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}
      </svg>

      {hoveredNode && hoveredPos && hoveredNode.id !== selectedNodeId && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: `${(hoveredPos.x / VIEW_SIZE) * 100}%`,
            top: `${(hoveredPos.y / VIEW_SIZE) * 100}%`,
            transform: tooltipAbove
              ? 'translate(-50%, -100%) translateY(-14px)'
              : 'translate(-50%, 0%) translateY(14px)',
          }}
        >
          <div className="bg-gray-900/90 backdrop-blur-sm text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-lg border border-purple-500/30 whitespace-nowrap">
            <p className="font-semibold text-xs inline-flex items-center gap-1.5">
              <span>{formatBiomeName(hoveredNode.biomeType)}</span>
              <span className="inline-flex items-center gap-1">
                {hoveredNode.hazards.map((hazard, idx) => (
                  <span key={`${hoveredNode.id}-${hazard}-${idx}`} aria-label={hazard} title={hazard}>
                    {HAZARD_EMOJI[hazard] ?? hazard}
                  </span>
                ))}
              </span>
            </p>
            <p className="text-white/60 mt-0.5">
              Depth {hoveredNode.depth} &middot; Intensity{' '}
              {hoveredNode.intensity} ({INTENSITY_LABEL[hoveredNode.intensity]})
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
