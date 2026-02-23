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
import spaceTexture from './assets/space.jpg';
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

const RESISTANCE_ICON_BY_CATEGORY: Partial<Record<LoadoutCategory, string>> = {
  thermal_shielding: '🔥',
  cryo_insulation: '❄️',
  bio_filter: '🐛',
  rad_hardening: '☢️',
};

const EXTRACTOR_ICON_BY_CATEGORY: Partial<Record<LoadoutCategory, string>> = {
  thermal_extractor: '🔥',
  cryo_extractor: '❄️',
  bio_extractor: '🐛',
  rad_extractor: '☢️',
};

function getTierOptions(category: LoadoutCategory): TierOption[] {
  if (
    category === 'thermal_shielding' ||
    category === 'cryo_insulation' ||
    category === 'bio_filter' ||
    category === 'rad_hardening'
  ) {
    const hazardIcon = RESISTANCE_ICON_BY_CATEGORY[category] ?? '';
    const resistanceLabel = hazardIcon ? `${hazardIcon} Resistance` : 'Resistance';
    return [
      { tier: 'standard', label: 'Standard', effect: `${resistanceLabel} +0`, weight: 0 },
      { tier: 'enhanced', label: 'Enhanced', effect: `${resistanceLabel} +1`, weight: 2 },
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

  const extractorIcon = EXTRACTOR_ICON_BY_CATEGORY[category] ?? '';
  const multiplierLabel = extractorIcon ? `${extractorIcon} Multiplier` : 'Multiplier';
  return [
    { tier: 'standard', label: 'Standard', effect: `${multiplierLabel} x1.0`, weight: 0 },
    { tier: 'enhanced', label: 'Enhanced', effect: `${multiplierLabel} x1.2`, weight: 2 },
    { tier: 'advanced', label: 'Advanced', effect: `${multiplierLabel} x1.5`, weight: 5 },
  ];
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function tierTextClass(tier: TierChoice): string {
  if (tier === 'standard') return 'text-slate-700';
  if (tier === 'enhanced') return 'text-blue-700';
  return 'text-purple-700';
}

const HAZARD_EMOJI: Record<string, string> = {
  heat: '🔥',
  cold: '❄️',
  bio: '🐛',
  rad: '☢️',
};

const HAZARD_BADGE: Record<string, { background: string; border: string }> = {
  heat: { background: 'rgba(254, 226, 226, 0.95)', border: 'rgba(248, 113, 113, 0.55)' },
  cold: { background: 'rgba(224, 242, 254, 0.95)', border: 'rgba(56, 189, 248, 0.55)' },
  bio: { background: 'rgba(220, 252, 231, 0.95)', border: 'rgba(74, 222, 128, 0.55)' },
  rad: { background: 'rgba(243, 232, 255, 0.95)', border: 'rgba(168, 85, 247, 0.55)' },
};

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

function renderHazardBadge(hazard: string, key?: string) {
  const style = HAZARD_BADGE[hazard] ?? {
    background: 'rgba(243, 244, 246, 0.95)',
    border: 'rgba(107, 114, 128, 0.4)',
  };
  const emoji = HAZARD_EMOJI[hazard] ?? hazard;
  return (
    <span
      key={key ?? `${hazard}-badge`}
      className="inline-flex items-center justify-center rounded px-1 py-[1px] text-[10px] leading-none border"
      style={{
        backgroundColor: style.background,
        borderColor: style.border,
      }}
      title={hazard}
      aria-label={hazard}
    >
      {emoji}
    </span>
  );
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

  const nodeById = useMemo(() => {
    const m = new Map<number, PlanetNodeView>();
    for (const node of props.state.planetNodes ?? []) m.set(node.id, node);
    return m;
  }, [props.state.planetNodes]);

  const movePreview = useMemo(() => {
    if (!selectedNode || !explore) return null;
    return computeMovePreview(selectedNode, explore);
  }, [selectedNode, explore]);

  const runSummary = useMemo(() => {
    if (!explore) return null;
    const visitedCount = explore.visitedNodeIds.length;
    const maxDepth = explore.visitedNodeIds.reduce(
      (max, nodeId) => Math.max(max, nodeById.get(nodeId)?.depth ?? 0),
      0,
    );
    const currentNodeDepth = nodeById.get(explore.currentNodeId)?.depth ?? 0;
    return {
      visitedCount,
      maxDepth,
      currentNodeDepth,
      moveCount: explore.moveCount,
      resources: explore.resources,
      hull: explore.hull,
      fuel: explore.fuel,
      cargo: explore.cargo,
      maxCargo: explore.maxCargo,
      outcome: explore.outcome,
    };
  }, [explore, nodeById]);

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
    phase === 'prove' ? 'Submit Proof → Done' : null;

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
          <div
            className="flex-1 border-b border-green-700/40 flex items-center justify-center px-6"
            style={phase === 'explore' || phase === 'build' || phase === 'prove' || phase === 'done'
              ? {
                  backgroundImage: `url(${spaceTexture})`,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                }
              : { backgroundImage: `url(${spaceTexture})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
          >
            {phase === 'build' && buildState ? (
              <div className="w-full h-full py-3 min-h-0">
                <div className="h-full min-h-0 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-green-900/30 bg-white/70 p-2 min-h-0 flex flex-col">
                    <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">CATEGORY</p>
                    <div className="mt-2 space-y-1 overflow-auto min-h-0">
                      {ATTACHMENT_POINTS.map((point) => {
                        const active = selectedCategory === point.category;
                        const tier = buildState.loadout[point.category];
                        const equippedOption = getTierOptions(point.category).find((option) => option.tier === tier);
                        return (
                          <button
                            key={point.category}
                            type="button"
                            onClick={() => setSelectedCategory(point.category)}
                            className={`w-full text-left rounded border px-2 py-1.5 text-xs ${
                              active
                                ? 'border-purple-700 bg-purple-50 text-purple-950'
                                : 'border-green-900/20 bg-white/70 text-green-950 hover:bg-white/90'
                            }`}
                          >
                            <div className="font-semibold">
                              {point.label}:{' '}
                              <span className={tierTextClass(tier)}>{toTitleCase(tier)}</span>
                            </div>
                            <div className="text-[11px] opacity-80">Effect: {equippedOption?.effect ?? '-'}</div>
                            <div className="text-[11px] opacity-80">Weight: {equippedOption?.weight ?? '-'}</div>
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
                      {(() => {
                        const tierOptions = getTierOptions(selectedCategory);
                        const currentTier = buildState.loadout[selectedCategory];
                        const currentOption = tierOptions.find((option) => option.tier === currentTier);
                        const currentWeight = currentOption?.weight ?? 0;

                        return tierOptions.map((option) => {
                        const currentTier = buildState.loadout[selectedCategory];
                        const active = currentTier === option.tier;
                        const projectedWeight = buildState.totalWeight - currentWeight + option.weight;
                        const overBudget = projectedWeight > buildState.maxWeight;
                        return (
                          <button
                            key={option.tier}
                            type="button"
                            onClick={() => props.actions.setPartTier(selectedCategory, option.tier)}
                            disabled={overBudget}
                            className={`w-full text-left rounded border px-2 py-1.5 ${
                              active
                                ? 'border-purple-700 bg-purple-50 text-purple-950'
                                : 'border-green-900/20 bg-white/70 text-green-950 hover:bg-white/90'
                            } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/70`}
                          >
                            <div className={`font-semibold text-xs ${tierTextClass(option.tier)}`}>
                              {option.label}
                            </div>
                            <div className="text-[11px] opacity-85">Effect: {option.effect}</div>
                            <div className="text-[11px] opacity-85">Weight: {option.weight}</div>
                          </button>
                        );
                        });
                      })()}
                    </div>
                  </div>

                  <div className="rounded-lg border border-green-900/30 bg-white/75 p-2 min-h-0 flex flex-col text-green-950">
                    <p className="text-xs tracking-[0.2em] font-semibold">PROBE STATS</p>
                    <p className="mt-1 text-[10px] opacity-70">Viewing: {toTitleCase(selectedCategory)}</p>
                    <div className="mt-2 min-h-0 flex-1 overflow-auto">
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
                        <p>Resist 🔥</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.thermal_shielding === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist ❄️</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.cryo_insulation === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist 🐛</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.bio_filter === 'enhanced' ? 1 : 0}
                        </p>
                        <p>Resist ☢️</p>
                        <p className="text-right font-semibold">
                          {buildState.loadout.rad_hardening === 'enhanced' ? 1 : 0}
                        </p>
                      </div>
                      <div className="mt-2 border-t border-green-900/15 pt-1 text-[11px]">
                        <p className="font-semibold">Extractor Multipliers</p>
                        <p>🔥: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.thermal_extractor]}</p>
                        <p>❄️: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.cryo_extractor]}</p>
                        <p>🐛: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.bio_extractor]}</p>
                        <p>☢️: x{EXTRACTOR_DISPLAY_MULTIPLIER_BY_TIER[buildState.loadout.rad_extractor]}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-2 h-[24px] rounded text-[11px] leading-none bg-purple-700 text-white font-semibold disabled:opacity-60"
                      onClick={props.actions.goToNextPhase}
                      disabled={loading}
                    >
                      {loading ? 'Working...' : 'Confirm Loadout → Explore'}
                    </button>
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
                    traversedEdges={explore.traversedEdges}
                    selectedNodeId={selectedNodeId ?? undefined}
                    onSelectNode={setSelectedNodeId}
                  />
                </div>

                {selectedNode && movePreview && (
                  <div className="shrink-0 grid grid-cols-3 gap-1.5">
                    <div
                      className="rounded border border-green-900/30 px-2 py-1.5 text-green-950"
                      style={{
                        backgroundImage: BIOME_TEXTURE[selectedNode.biomeType]
                          ? `linear-gradient(to bottom, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.35) 52%, rgba(255, 255, 255, 0.05) 100%), url(${BIOME_TEXTURE[selectedNode.biomeType]})`
                          : 'linear-gradient(to bottom, rgba(255,255,255,0.92), rgba(255,255,255,0.35) 52%, rgba(255,255,255,0.05) 100%)',
                        backgroundPosition: 'center',
                        backgroundSize: 'cover',
                      }}
                    >
                      <p className="text-[10px] tracking-[0.15em] font-semibold opacity-60">SELECTED BIOME</p>
                      <p className="text-xs font-bold mt-0.5">{toTitleCase(selectedNode.biomeType)}</p>
                      <p className="text-[11px] opacity-75">
                        Depth {selectedNode.depth} &middot; Intensity {selectedNode.intensity}
                      </p>
                      <p className="text-[11px] opacity-75 flex items-center gap-1.5">
                        <span>Hazards:</span>
                        <span className="inline-flex items-center gap-1">
                          {selectedNode.hazards.map((h, idx) => renderHazardBadge(h, `${h}-${idx}`))}
                        </span>
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
                            <span className="text-red-700/80 inline-flex items-center gap-1">
                              <span>Dmg</span>
                              {renderHazardBadge(d.type, `dmg-${d.type}`)}
                            </span>
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
            ) : phase === 'prove' && runSummary ? (
              <div className="w-full max-w-[560px] rounded-xl border border-purple-300/50 bg-white/85 backdrop-blur-sm p-5 text-slate-900 shadow-xl">
                <p className="text-xs tracking-[0.2em] text-purple-900 font-semibold">PROOF PHASE</p>
                <h2 className="mt-2 text-2xl font-black">Finalize This Run</h2>
                <p className="mt-2 text-sm text-slate-800/85">
                  Your run is complete. Submit the proof to lock in results on-chain.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  <p>Outcome</p>
                  <p className="text-right font-semibold">
                    {runSummary.outcome === 'evacuated'
                      ? 'Evacuated'
                      : runSummary.outcome === 'jettisoned'
                        ? 'Ditched Probe'
                        : 'In Progress'}
                  </p>
                  <p>Resources</p>
                  <p className="text-right font-semibold">{runSummary.resources}</p>
                  <p>Moves</p>
                  <p className="text-right font-semibold">{runSummary.moveCount}</p>
                  <p>Nodes Visited</p>
                  <p className="text-right font-semibold">{runSummary.visitedCount}</p>
                  <p>Peak Depth</p>
                  <p className="text-right font-semibold">{runSummary.maxDepth}</p>
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-[30px] px-4 rounded text-[12px] leading-none bg-purple-700 text-white font-semibold disabled:opacity-60"
                    onClick={props.actions.goToNextPhase}
                    disabled={loading}
                  >
                    {loading ? 'Submitting Proof...' : 'Submit Proof → Done'}
                  </button>
                </div>
              </div>
            ) : phase === 'done' && runSummary ? (
              <div className="w-full max-w-[620px] rounded-xl border border-emerald-300/55 bg-white/85 backdrop-blur-sm p-5 text-slate-900 shadow-xl">
                <p className="text-xs tracking-[0.2em] text-emerald-900 font-semibold">RUN COMPLETE</p>
                <h2 className="mt-2 text-2xl font-black">Expedition Summary</h2>
                <p className="mt-2 text-sm text-slate-800/85">
                  Here&apos;s how your latest Planet Alpha run ended.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                  <div className="rounded border border-slate-300/60 bg-white/80 px-3 py-2">
                    <p className="text-[10px] tracking-[0.15em] text-slate-600 font-semibold">OUTCOME</p>
                    <p className="mt-1 text-base font-bold">
                      {runSummary.outcome === 'evacuated'
                        ? 'Evacuated'
                        : runSummary.outcome === 'jettisoned'
                          ? 'Ditched Probe'
                          : 'In Progress'}
                    </p>
                  </div>
                  <div className="rounded border border-slate-300/60 bg-white/80 px-3 py-2">
                    <p className="text-[10px] tracking-[0.15em] text-slate-600 font-semibold">RESOURCES KEPT</p>
                    <p className="mt-1 text-base font-bold">{runSummary.resources}</p>
                  </div>
                  <div className="rounded border border-slate-300/60 bg-white/80 px-3 py-2">
                    <p className="text-[10px] tracking-[0.15em] text-slate-600 font-semibold">ROUTE</p>
                    <p className="mt-1 text-sm font-semibold">
                      {runSummary.moveCount} moves · {runSummary.visitedCount} nodes · depth {runSummary.maxDepth}
                    </p>
                  </div>
                  <div className="rounded border border-slate-300/60 bg-white/80 px-3 py-2">
                    <p className="text-[10px] tracking-[0.15em] text-slate-600 font-semibold">FINAL STATUS</p>
                    <p className="mt-1 text-sm font-semibold">
                      Hull {runSummary.hull} · Fuel {runSummary.fuel} · Cargo {runSummary.cargo}/{runSummary.maxCargo}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end">
                  <button
                    type="button"
                    className="h-[30px] px-4 rounded text-[12px] leading-none bg-gray-900 text-white font-semibold disabled:opacity-60"
                    onClick={props.actions.resetScreens}
                    disabled={loading}
                  >
                    Back To Menu
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center max-w-xl">
                <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">STELLAR EXPLORER</p>
                <h2 className="mt-2 text-3xl font-black text-green-950">{phaseTitle} SCREEN</h2>
                <p className="text-sm text-green-950/85 mt-3">{phaseDescription}</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  {nextButtonLabel ? (
                    <button
                      type="button"
                      className="h-[28px] px-3 rounded text-[12px] leading-none bg-purple-700 text-white font-semibold disabled:opacity-60"
                      onClick={props.actions.goToNextPhase}
                      disabled={loading}
                    >
                      {loading ? 'Working...' : nextButtonLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
