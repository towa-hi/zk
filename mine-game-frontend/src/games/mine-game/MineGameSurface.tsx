import { useState } from 'react';
import type { MineGameSurfaceProps, UiNotice } from './GameSurface.types';

function DefaultNotice({ notice }: { notice: UiNotice }) {
  const toneClass =
    notice.tone === 'error'
      ? 'text-red-800 border-red-300 bg-red-100/65'
      : notice.tone === 'success'
        ? 'text-emerald-800 border-emerald-300 bg-emerald-100/65'
        : 'text-blue-800 border-blue-300 bg-blue-100/65';

  return (
    <div
      className={`absolute top-3 left-3 right-3 z-10 rounded-md border px-3 py-2 text-xs font-medium backdrop-blur-sm ${toneClass}`}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  );
}

export function MineGameSurface(props: MineGameSurfaceProps) {
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  const activeNotice = props.notice
    ? props.renderNotice
      ? props.renderNotice(props.notice)
      : <DefaultNotice notice={props.notice} />
    : null;

  const { phase, loading } = props.state;

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
      ? 'Select your loadout in this screen. This is a placeholder view for now.'
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
        {activeNotice}
        <div className="h-full w-full flex flex-col">
          <div className="flex-1 bg-green-500/70 border-b border-green-700/40 flex items-center justify-center px-6">
            <div className="text-center max-w-xl">
              <p className="text-xs tracking-[0.2em] text-green-950 font-semibold">STELLAR EXPLORER</p>
              <h2 className="mt-2 text-3xl font-black text-green-950">{phaseTitle} SCREEN</h2>
              <p className="text-sm text-green-950/85 mt-3">{phaseDescription}</p>
            </div>
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
