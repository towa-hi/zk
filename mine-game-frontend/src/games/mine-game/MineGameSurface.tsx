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
  const activeNotice = props.notice
    ? props.renderNotice
      ? props.renderNotice(props.notice)
      : <DefaultNotice notice={props.notice} />
    : null;

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-none p-2 shadow-xl border-2 border-purple-200">
      <div className="card !rounded-none min-h-[420px] relative flex items-center justify-center">
        {activeNotice}
        <div className="text-center">
          <p className="text-base font-semibold text-gray-700">Clean canvas ready.</p>
          <p className="text-sm text-gray-500 mt-2">
            Build your custom game UI here and keep using `.notice` for feedback messages.
          </p>
        </div>
      </div>
    </div>
  );
}
