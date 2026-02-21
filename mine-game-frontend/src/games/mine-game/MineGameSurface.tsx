import { useEffect, useMemo, useState } from 'react';
import type {
  ExploreViewState,
  LoadoutCategory,
  MineGameSurfaceProps,
  PartTier,
  PlanetNodeView,
  ResistancePartTier,
} from './GameSurface.types';
import { ATTACHMENT_POINTS } from './ProbeBlueprint';
import { BiomeTree } from './BiomeTree';

type TierChoice = PartTier | ResistancePartTier;

interface TierOption {
  tier: TierChoice;
  label: string;
  effect: string;
  weight: number;
}

const FUEL_BY_TIER: Record<PartTier, number> = {
  standard: 6,
  enhanced: 8,
  advanced: 10,
};

const CARGO_BY_TIER: Record<PartTier, number> = {
  standard: 100,
  enhanced: 175,
  advanced: 225,
};

const EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER: Record<PartTier, string> = {
  standard: '1.0',
  enhanced: '1.2',
  advanced: '1.5',
};

function getTierOptions(category: LoadoutCategory): TierOption[] {
  if (
    category === 'thermal_shielding' ||
    category === 'cryo_insulation' ||
    category === 'bio_filter' ||
    category === 'rad_hardening'
  ) {
    return [
      { tier: 'standard', label: 'Standard', effect: 'Resistance +0', weight: 0 },
      { tier: 'enhanced', label: 'Enhanced', effect: 'Resistance +1', weight: 2 },
    ];
  }
  if (category === 'fuel_tank') {
    return [
      { tier: 'standard', label: 'Standard', effect: 'Fuel 6', weight: 0 },
      { tier: 'enhanced', label: 'Enhanced', effect: 'Fuel 8', weight: 2 },
      { tier: 'advanced', label: 'Advanced', effect: 'Fuel 10', weight: 5 },
    ];
  }
  if (category === 'cargo_hold') {
    return [
      { tier: 'standard', label: 'Standard', effect: 'Cargo 100', weight: 0 },
      { tier: 'enhanced', label: 'Enhanced', effect: 'Cargo 175', weight: 2 },
      { tier: 'advanced', label: 'Advanced', effect: 'Cargo 225', weight: 5 },
    ];
  }
  return [
    { tier: 'standard', label: 'Standard', effect: 'Multiplier x1.0', weight: 0 },
    { tier: 'enhanced', label: 'Enhanced', effect: 'Multiplier x1.2', weight: 2 },
    { tier: 'advanced', label: 'Advanced', effect: 'Multiplier x1.5', weight: 5 },
  ];
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

const HAZARD_LABEL: Record<string, string> = {
  heat: 'Heat',
  cold: 'Cold',
  bio: 'Bio',
  rad: 'Rad',
};

const RESOURCE_BASE: Record<number, number> = { 1: 1, 2: 3, 3: 5 };
const BASE_DAMAGE = 1;

interface MovePreview {
  hullBefore: number;
  hullAfter: number;
  fuelBefore: number;
  fuelAfter: number;
  damageByType: { type: string; damage: number }[];
  totalDamage: number;
  resourcesAvailable: number;
  isVisited: boolean;
  isStartNode: boolean;
  isCurrent: boolean;
}

function computeMovePreview(
  node: PlanetNodeView,
  explore: ExploreViewState,
): MovePreview {
  const isCurrent = node.id === explore.currentNodeId;
  const isVisited = explore.visitedNodeIds.includes(node.id);
  const isStartNode = node.id === (explore.visitedNodeIds[0] ?? 1);

  const grouped: Record<string, number> = {};
  for (const h of node.hazards) {
    const dmg = isStartNode
      ? 0
      : Math.max(0, BASE_DAMAGE + (node.intensity - 1) - (explore.resistances[h] ?? 0));
    grouped[h] = (grouped[h] ?? 0) + dmg;
  }
  const damageByType = Object.entries(grouped).map(([type, damage]) => ({ type, damage }));
  const totalDamage = damageByType.reduce((s, d) => s + d.damage, 0);

  let resourcesAvailable = 0;
  if (!isVisited) {
    const base = RESOURCE_BASE[node.intensity] ?? 0;
    const ext0 = explore.extractors[node.hazards[0]] ?? 10;
    const ext1 = explore.extractors[node.hazards[1]] ?? 10;
    resourcesAvailable = base * ext0 + base * ext1;
    if (node.hazards[0] === node.hazards[1]) resourcesAvailable *= 2;
  }

  return {
    hullBefore: explore.hull,
    hullAfter: Math.max(0, explore.hull - totalDamage),
    fuelBefore: explore.fuel,
    fuelAfter: Math.max(0, explore.fuel - 1),
    damageByType,
    totalDamage,
    resourcesAvailable,
    isVisited,
    isStartNode,
    isCurrent,
  };
}

export function MineGameSurface(props: MineGameSurfaceProps) {
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LoadoutCategory>('fuel_tank');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const { phase, loading } = props.state;
  const buildState = props.state.build;
  const explore = props.state.explore;

  useEffect(() => {
    if (phase !== 'build') {
      setSelectedCategory('fuel_tank');
    }
  }, [phase]);

  useEffect(() => {
    if (explore?.currentNodeId != null) {
      setSelectedNodeId(explore.currentNodeId);
    }
  }, [explore?.currentNodeId]);

  const selectedNode = useMemo(() => {
    if (selectedNodeId == null || !props.state.planetNodes) return null;
    return props.state.planetNodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, props.state.planetNodes]);

  const movePreview = useMemo(() => {
    if (!selectedNode || !explore) return null;
    return computeMovePreview(selectedNode, explore);
  }, [selectedNode, explore]);

  const phaseTitle =
    phase === 'build'
      ? 'BUILD'
      : phase === 'explore'
        ? 'EXPLORE'
        : phase === 'prove'
          ? 'PROVE'
          : 'DONE';

  const phaseDescription =
    phase === 'build'
      ? 'Select a category on the left, then choose a part on the right.'
      : phase === 'explore'
        ? 'Explore Planet Alpha here. This is a placeholder view for now.'
        : phase === 'prove'
          ? 'Generate and submit your ZK proof from this screen. Placeholder for now.'
          : 'Run complete. Return to build to start another placeholder flow.';

  const nextButtonLabel =
    phase === 'build'
      ? 'Confirm Loadout → Explore'
      : phase === 'explore'
        ? 'End Run → Prove'
        : phase === 'prove'
          ? 'Submit Proof → Done'
          : null;

  return (
    <div className="relative h-full w-full bg-white/70 backdrop-blur-xl rounded-none p-0 shadow-xl border-2 border-purple-200 flex items-center justify-center">
      {props.debugText ? (
        <button
          type="button"
          className="absolute top-2 left-2 z-50 h-[24px] px-2 rounded text-[11px] leading-none bg-black/80 text-white border border-white/20"
          onClick={() => setIsDebugVisible((current) => !current)}
        >
          {isDebugVisible ? 'Hide Debug' : 'Show Debug'}
        </button>
      ) : null}

      {props.debugText && isDebugVisible ? (
        <div
          className="absolute top-2 right-2 z-40 w-[420px] max-w-[calc(100%-1rem)] rounded px-3 py-2 text-[10px] leading-tight font-mono text-white bg-black/75 backdrop-blur-sm whitespace-pre-wrap pointer-events-none select-text"
          aria-live="off"
        >
          {props.debugText}
        </div>
      ) : null}
      <div className="!rounded-none relative overflow-hidden min-h-[500px] min-w-[500px] max-h-full max-w-full aspect-square h-full w-full">
        <div className="h-full w-full flex flex-col">
          <div className="flex-1 bg-green-500/70 border-b border-green-700/40 flex items-center justify-center px-6">
            {phase === 'build' && buildState ? (
              <div className="w-full h-full py-3 min-h-0">
                <div className="h-full min-h-0 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-green-900/30 bg-white/70 p-2 min-h-0 flex flex-col">
                    <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">CATEGORY</p>
                    <div className="mt-2 space-y-1 overflow-auto min-h-0">
                      {ATTACHMENT_POINTS.map((point) => {
                        const active = selectedCategory === point.category;
                        const tier = buildState.loadout[point.category];
                        return (
                          <button
                            key={point.category}
                            type="button"
                            onClick={() => setSelectedCategory(point.category)}
                            className={`w-full text-left rounded border px-2 py-1.5 text-xs ${
                              active
                                ? 'border-purple-700 bg-purple-50 text-purple-950'
                                : 'border-green-900/20 bg-white/70 text-green-950 hover:bg-green-50'
                            }`}
                          >
                            <div className="font-semibold">{point.label}</div>
                            <div className="text-[11px] opacity-80">Selected: {tier}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-green-900/30 bg-white/70 p-2 min-h-0 flex flex-col">
                    <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">PART</p>
                    <p className="text-xs text-green-950/80 mt-1">
                      {ATTACHMENT_POINTS.find((point) => point.category === selectedCategory)?.label}
                    </p>
                    <div className="mt-2 min-h-0 flex-1 overflow-auto space-y-1 pr-1">
                      {getTierOptions(selectedCategory).map((option) => {
                        const currentTier = buildState.loadout[selectedCategory];
                        const active = currentTier === option.tier;
                        return (
                          <button
                            key={option.tier}
                            type="button"
                            onClick={() => props.actions.setPartTier(selectedCategory, option.tier)}
                            className={`w-full text-left rounded border px-2 py-1.5 ${
                              active
                                ? 'border-purple-700 bg-purple-50 text-purple-950'
                                : 'border-green-900/20 bg-white/70 text-green-950 hover:bg-green-50'
                            }`}
                          >
                            <div className="font-semibold text-xs">{option.label}</div>
                            <div className="text-[11px] opacity-85">Effect: {option.effect}</div>
                            <div className="text-[11px] opacity-85">Weight: {option.weight}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-green-900/30 bg-green-50/75 p-2 min-h-0 flex flex-col text-green-950">
                    <p className="text-xs tracking-[0.2em] font-semibold">PROBE STATS</p>
                    <p className="mt-1 text-[10px] opacity-70">Viewing: {toTitleCase(selectedCategory)}</p>
                    <div className="mt-2 min-h-0 overflow-auto">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <p>Weight</p>
                        <p className="text-right font-semibold">
                          {buildState.totalWeight} / {buildState.maxWeight}
                        </p>
                        <p>Fuel</p>
                        <p className="text-right font-semibold">
                          {FUEL_BY_TIER[buildState.loadout.fuel_tank]}
                        </p>
                        <p>Cargo</p>
                        <p className="text-right font-semibold">
                          {CARGO_BY_TIER[buildState.loadout.cargo_hold]}
                        </p>
                        <p>Resist Heat</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.thermal_shielding === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist Cold</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.cryo_insulation === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist Bio</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.bio_filter === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist Rad</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.rad_hardening === 'enhanced' ? 1 : 0}
                        </p>
                      </div>
                      <div className="mt-2 border-t border-green-900/15 pt-1 text-[11px]">
                        <p className="font-semibold">Extractor Multipliers</p>
                        <p>Heat: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.thermal_extractor]}</p>
                        <p>Cold: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.cryo_extractor]}</p>
                        <p>Bio: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.bio_extractor]}</p>
                        <p>Rad: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.rad_extractor]}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : phase === 'explore' && props.state.planetNodes && explore ? (
              <div className="w-full h-full py-1.5 px-3 min-h-0 flex flex-col gap-1.5">
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <BiomeTree
                    nodes={props.state.planetNodes}
                    currentNodeId={explore.currentNodeId}
                    visitedNodeIds={explore.visitedNodeIds}
                    selectedNodeId={selectedNodeId ?? undefined}
                    onSelectNode={setSelectedNodeId}
                  />
                </div>

                {selectedNode && movePreview && (
                  <div className="shrink-0 grid grid-cols-3 gap-1.5">
                    <div className="rounded border border-green-900/30 bg-white/70 px-2 py-1.5 text-green-950">
                      <p className="text-[10px] tracking-[0.15em] font-semibold opacity-60">SELECTED BIOME</p>
                      <p className="text-xs font-bold mt-0.5">{toTitleCase(selectedNode.biomeType)}</p>
                      <p className="text-[11px] opacity-75">
                        Depth {selectedNode.depth} &middot; Intensity {selectedNode.intensity}
                      </p>
                      <p className="text-[11px] opacity-75">
                        Hazards: {selectedNode.hazards.map((h) => HAZARD_LABEL[h] ?? h).join(', ')}
                      </p>
                      {movePreview.isCurrent && (
                        <p className="text-[10px] font-semibold text-purple-700 mt-0.5">You are here</p>
                      )}
                      {movePreview.isVisited && !movePreview.isCurrent && (
                        <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Already visited</p>
                      )}
                    </div>

                    <div className="rounded border border-green-900/30 bg-white/70 px-2 py-1.5 text-green-950 flex flex-col overflow-hidden">
                      <p className="text-[10px] tracking-[0.15em] font-semibold opacity-60 shrink-0">
                        {movePreview.isCurrent ? 'CURRENT STATS' : 'MOVE PREVIEW'}
                      </p>
                      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0 text-[11px] min-h-0 overflow-auto">
                        <span>Hull</span>
                        {movePreview.isCurrent ? (
                          <span className="text-right font-semibold">{movePreview.hullBefore}</span>
                        ) : (
                          <span className="text-right font-semibold">
                            {movePreview.hullBefore}
                            <span className={movePreview.totalDamage > 0 ? ' text-red-600' : ''}>
                              {' → '}{movePreview.hullAfter}
                            </span>
                          </span>
                        )}

                        <span>Fuel</span>
                        {movePreview.isCurrent ? (
                          <span className="text-right font-semibold">{movePreview.fuelBefore}</span>
                        ) : (
                          <span className="text-right font-semibold">
                            {movePreview.fuelBefore}
                            <span className=" text-red-600">{' → '}{movePreview.fuelAfter}</span>
                          </span>
                        )}

                        {!movePreview.isCurrent && movePreview.damageByType.map((d) => (
                          <span key={d.type} className="contents">
                            <span className="text-red-700/80">Dmg {HAZARD_LABEL[d.type] ?? d.type}</span>
                            <span className="text-right font-semibold text-red-700/80">{d.damage}</span>
                          </span>
                        ))}

                        {!movePreview.isCurrent && movePreview.resourcesAvailable > 0 && (
                          <span className="contents">
                            <span className="text-emerald-700">Resources</span>
                            <span className="text-right font-semibold text-emerald-700">
                              +{movePreview.resourcesAvailable}
                            </span>
                          </span>
                        )}

                        {movePreview.isCurrent && (
                          <>
                            <span>Cargo</span>
                            <span className="text-right font-semibold">
                              {explore.cargo} / {explore.maxCargo}
                            </span>
                            <span>Resources</span>
                            <span className="text-right font-semibold">{explore.resources}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const noFuel = explore.fuel <= 0;
                      const currentNode = props.state.planetNodes?.find(
                        (node) => node.id === explore.currentNodeId,
                      );
                      const isSafeReturn = currentNode?.depth === 6;
                      const isAdj = selectedNodeId != null
                        && selectedNodeId !== explore.currentNodeId
                        && (selectedNodeId === explore.currentNodeId * 2
                          || selectedNodeId === explore.currentNodeId * 2 + 1
                          || (selectedNodeId === Math.floor(explore.currentNodeId / 2) && explore.currentNodeId > 1));
                      const moveDisabled = movePreview.isCurrent || noFuel || !isAdj || loading;
                      const evacDisabled = noFuel || loading;

                      return (
                        <div className="rounded border border-green-900/30 bg-white/70 px-2 py-1.5 text-green-950 flex flex-col">
                          <p className="text-[10px] tracking-[0.15em] font-semibold opacity-60">ACTIONS</p>
                          <div className="mt-1 flex-1 min-h-0 flex flex-col gap-1">
                            <button
                              type="button"
                              className="w-full h-[20px] rounded text-[10px] leading-none font-semibold border border-red-400/60 bg-red-50 text-red-700 px-1 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed"
                              disabled={evacDisabled}
                              onClick={() => props.actions.evacuate()}
                            >
                              {isSafeReturn ? 'Return Safely' : 'Ditch Probe'}
                            </button>
                            <button
                              type="button"
                              className="w-full h-[20px] rounded text-[10px] leading-none font-semibold border border-purple-400/60 bg-purple-50 text-purple-700 px-1 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed"
                              disabled={moveDisabled}
                              onClick={() => selectedNodeId != null && props.actions.moveToNode(selectedNodeId, false)}
                            >
                              Move Only
                            </button>
                            <button
                              type="button"
                              className="w-full h-[20px] rounded text-[10px] leading-none font-semibold border border-emerald-400/60 bg-emerald-50 text-emerald-700 px-1 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed"
                              disabled={moveDisabled}
                              onClick={() => selectedNodeId != null && props.actions.moveToNode(selectedNodeId, true)}
                            >
                              Move & Extract
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center max-w-xl">
                <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">STELLAR EXPLORER</p>
                <h2 className="mt-2 text-3xl font-black text-green-950">{phaseTitle} SCREEN</h2>
                <p className="text-sm text-green-950/85 mt-3">{phaseDescription}</p>
              </div>
            )}
          </div>

          <div
            className="bg-orange-500/90 border-t border-orange-700/60 flex items-center justify-center gap-2 px-2"
            style={{ height: '25px' }}
          >
            {nextButtonLabel ? (
              <button
                type="button"
                className="h-[20px] px-2 rounded text-[11px] leading-none bg-purple-700 text-white font-semibold disabled:opacity-60"
                onClick={props.actions.goToNextPhase}
                disabled={loading}
              >
                {loading ? 'Working...' : nextButtonLabel}
              </button>
            ) : null}

            {phase === 'done' ? (
              <button
                type="button"
                className="h-[20px] px-2 rounded text-[11px] leading-none bg-gray-900 text-white font-semibold disabled:opacity-60"
                onClick={props.actions.resetScreens}
                disabled={loading}
              >
                Back To Build
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
