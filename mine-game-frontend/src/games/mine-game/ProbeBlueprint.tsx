import type { ReactNode } from 'react';
import type { LoadoutCategory, PartTier, ResistancePartTier } from './GameSurface.types';
import probeCoreImage from './assets/probe.png';

type TierChoice = PartTier | ResistancePartTier;

export interface AttachmentPoint {
  category: LoadoutCategory;
  label: string;
  top: string;
  left: string;
}

export const ATTACHMENT_POINTS: AttachmentPoint[] = [
  { category: 'fuel_tank', label: 'Fuel Tank', top: '26%', left: '20%' },
  { category: 'cargo_hold', label: 'Cargo Hold', top: '80%', left: '18%' },
  { category: 'thermal_shielding', label: 'Thermal Shielding', top: '36%', left: '50%' },
  { category: 'cryo_insulation', label: 'Cryo Insulation', top: '54%', left: '50%' },
  { category: 'bio_filter', label: 'Bio Filter', top: '67%', left: '50%' },
  { category: 'rad_hardening', label: 'Rad Hardening', top: '80%', left: '50%' },
  { category: 'thermal_extractor', label: 'Thermal Extractor', top: '30%', left: '82%' },
  { category: 'cryo_extractor', label: 'Cryo Extractor', top: '48%', left: '82%' },
  { category: 'bio_extractor', label: 'Bio Extractor', top: '67%', left: '82%' },
  { category: 'rad_extractor', label: 'Rad Extractor', top: '84%', left: '82%' },
];

export const TIER_LABEL: Record<TierChoice, string> = {
  standard: 'Standard',
  enhanced: 'Enhanced',
  advanced: 'Advanced',
};

interface ProbeBlueprintProps {
  children?: ReactNode;
}

export function ProbeBlueprint({ children }: ProbeBlueprintProps) {
  return (
    <div className="relative h-full w-full min-h-[360px] overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end pr-[8%]">
        <div className="relative w-[74%] max-w-[880px]">
          <img
            src={probeCoreImage}
            alt="Probe core"
            className="block w-full h-auto object-contain opacity-90"
            draggable={false}
          />
          <div className="absolute inset-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface ProbePartStripProps {
  loadout: Record<LoadoutCategory, TierChoice>;
}

const PART_SHORT_LABEL: Record<LoadoutCategory, string> = {
  fuel_tank: 'Fuel',
  cargo_hold: 'Cargo',
  thermal_shielding: 'Therm',
  cryo_insulation: 'Cryo',
  bio_filter: 'Bio',
  rad_hardening: 'Rad',
  thermal_extractor: 'T-Ext',
  cryo_extractor: 'C-Ext',
  bio_extractor: 'B-Ext',
  rad_extractor: 'R-Ext',
};

export function ProbePartStrip({ loadout }: ProbePartStripProps) {
  return (
    <div className="absolute bottom-[3%] left-1/2 z-10 w-[92%] -translate-x-1/2 rounded-md border border-green-900/25 bg-white/70 p-1">
      <div className="grid grid-cols-5 gap-1">
        {ATTACHMENT_POINTS.map((point) => {
          const tier = loadout[point.category];
          const activeClass =
            tier === 'standard'
              ? 'bg-white text-green-900 border-green-900/30'
              : 'bg-emerald-200 text-emerald-950 border-emerald-800/35';
          return (
            <div
              key={point.category}
              className={`rounded border px-1 py-[2px] text-[9px] font-semibold text-center whitespace-nowrap ${activeClass}`}
            >
              {PART_SHORT_LABEL[point.category]} {tier.charAt(0).toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
