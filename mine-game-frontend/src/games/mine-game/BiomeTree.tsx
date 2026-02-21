import { useState, useMemo } from 'react';
import type { PlanetNodeView } from './GameSurface.types';

interface BiomeTreeProps {
  nodes: PlanetNodeView[];
  currentNodeId?: number;
  visitedNodeIds?: number[];
  selectedNodeId?: number;
  onSelectNode?: (nodeId: number) => void;
}

const VIEW_SIZE = 600;
const CENTER = VIEW_SIZE / 2;
const MAX_DEPTH = 6;
const OUTER_RADIUS = VIEW_SIZE * 0.46;
const TREE_RADIUS = VIEW_SIZE * 0.41;

const BASE_RADIUS: Record<number, number> = {
  0: 10, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3.5, 6: 3,
};

const INTENSITY_FILL: Record<1 | 2 | 3, string> = {
  1: '#6ee7b7',
  2: '#fbbf24',
  3: '#fb7185',
};

const INTENSITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

const MIN_HIT_RADIUS = 8;

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

function treeHopDistance(a: number, b: number): number {
  if (a === b) return 0;

  const ancestorsA = new Set<number>();
  let n = a;
  while (n >= 1) {
    ancestorsA.add(n);
    n = Math.floor(n / 2);
  }

  let cur = b;
  let distB = 0;
  while (!ancestorsA.has(cur)) {
    cur = Math.floor(cur / 2);
    distB++;
  }

  const lcaDepth = Math.floor(Math.log2(cur));
  const aDepth = Math.floor(Math.log2(a));
  return (aDepth - lcaDepth) + distB;
}

function falloff(dist: number): { opacity: number; scale: number } {
  if (dist <= 1) return { opacity: 1, scale: 1.15 };
  if (dist === 2) return { opacity: 0.85, scale: 1.0 };
  if (dist === 3) return { opacity: 0.6, scale: 0.9 };
  if (dist === 4) return { opacity: 0.35, scale: 0.8 };
  if (dist === 5) return { opacity: 0.2, scale: 0.7 };
  return { opacity: 0.1, scale: 0.6 };
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
  visitedNodeIds = [],
  selectedNodeId,
  onSelectNode,
}: BiomeTreeProps) {
  const [hoveredNode, setHoveredNode] = useState<PlanetNodeView | null>(null);
  const visitedSet = useMemo(() => new Set(visitedNodeIds), [visitedNodeIds]);

  const posMap = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    for (const node of nodes) m.set(node.id, nodePosition(node.id));
    return m;
  }, [nodes]);

  const distMap = useMemo(() => {
    const m = new Map<number, number>();
    if (currentNodeId == null) return m;
    for (const node of nodes) {
      m.set(node.id, treeHopDistance(currentNodeId, node.id));
    }
    return m;
  }, [nodes, currentNodeId]);

  const hasFocus = currentNodeId != null;

  const hoveredPos = hoveredNode ? posMap.get(hoveredNode.id) : null;
  const tooltipAbove = hoveredPos ? hoveredPos.y > VIEW_SIZE * 0.18 : true;

  return (
    <div
      className="relative"
      style={{ height: '100%', maxHeight: VIEW_SIZE, aspectRatio: '1', maxWidth: '100%' }}
    >
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="absolute inset-0 w-full h-full"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_RADIUS}
          fill="rgba(139, 92, 246, 0.04)"
          stroke="rgba(139, 92, 246, 0.25)"
          strokeWidth={2}
        />

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

          const maxDist = hasFocus
            ? Math.max(distMap.get(parentId) ?? 12, distMap.get(node.id) ?? 12)
            : 0;
          const edgeOpacity = hasFocus
            ? Math.max(0.03, falloff(maxDist).opacity * 0.45)
            : 0.18;

          return (
            <line
              key={`edge-${node.id}`}
              x1={p.x}
              y1={p.y}
              x2={c.x}
              y2={c.y}
              stroke="rgba(139, 92, 246, 1)"
              strokeWidth={1}
              opacity={edgeOpacity}
            />
          );
        })}

        {nodes.map((node) => {
          const pos = posMap.get(node.id);
          if (!pos) return null;

          const isCurrent = node.id === currentNodeId;
          const isSelected = node.id === selectedNodeId;
          const isVisited = visitedSet.has(node.id);
          const isHovered = hoveredNode?.id === node.id;
          const dist = distMap.get(node.id) ?? 0;
          const baseR = BASE_RADIUS[node.depth] ?? 3;

          let r: number;
          let fill: string;
          let stroke: string;
          let sw: number;
          let opacity: number;

          if (isCurrent) {
            r = baseR * 1.8;
            fill = '#7c3aed';
            stroke = '#ffffff';
            sw = 2;
            opacity = 1;
          } else {
            const f = hasFocus ? falloff(dist) : { opacity: 1, scale: 1 };
            r = baseR * f.scale;
            fill = INTENSITY_FILL[node.intensity];
            stroke = 'rgba(0,0,0,0.12)';
            sw = 0.5;
            opacity = isVisited ? f.opacity * 0.55 : f.opacity;
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
            <p className="font-semibold text-xs">
              {formatBiomeName(hoveredNode.biomeType)}
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
