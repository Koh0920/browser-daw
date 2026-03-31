import { X } from "lucide-react";

interface QwertyMidiKeyboardDialogProps {
  activeKeys: string[];
  armedTrackName?: string | null;
  open: boolean;
  onNoteEnd: (key: string) => void;
  onNoteStart: (key: string) => void;
  onOpenChange: (open: boolean) => void;
}

type PianoKey = {
  key: string;
  note: string;
  sharp: boolean;
  boundaryIndex?: number;
  whiteIndex?: number;
};

const TOP_ROW: PianoKey[] = [
  { key: "Q", note: "C4", sharp: false, whiteIndex: 0 },
  { key: "2", note: "C#4", sharp: true, boundaryIndex: 1 },
  { key: "W", note: "D4", sharp: false, whiteIndex: 1 },
  { key: "3", note: "D#4", sharp: true, boundaryIndex: 2 },
  { key: "E", note: "E4", sharp: false, whiteIndex: 2 },
  { key: "R", note: "F4", sharp: false, whiteIndex: 3 },
  { key: "5", note: "F#4", sharp: true, boundaryIndex: 4 },
  { key: "T", note: "G4", sharp: false, whiteIndex: 4 },
  { key: "6", note: "G#4", sharp: true, boundaryIndex: 5 },
  { key: "Y", note: "A4", sharp: false, whiteIndex: 5 },
  { key: "7", note: "A#4", sharp: true, boundaryIndex: 6 },
  { key: "U", note: "B4", sharp: false, whiteIndex: 6 },
  { key: "I", note: "C5", sharp: false, whiteIndex: 7 },
  { key: "9", note: "C#5", sharp: true, boundaryIndex: 8 },
  { key: "O", note: "D5", sharp: false, whiteIndex: 8 },
  { key: "0", note: "D#5", sharp: true, boundaryIndex: 9 },
  { key: "P", note: "E5", sharp: false, whiteIndex: 9 },
];

const BOTTOM_ROW: PianoKey[] = [
  { key: "Z", note: "C3", sharp: false, whiteIndex: 0 },
  { key: "S", note: "C#3", sharp: true, boundaryIndex: 1 },
  { key: "X", note: "D3", sharp: false, whiteIndex: 1 },
  { key: "D", note: "D#3", sharp: true, boundaryIndex: 2 },
  { key: "C", note: "E3", sharp: false, whiteIndex: 2 },
  { key: "V", note: "F3", sharp: false, whiteIndex: 3 },
  { key: "G", note: "F#3", sharp: true, boundaryIndex: 4 },
  { key: "B", note: "G3", sharp: false, whiteIndex: 4 },
  { key: "H", note: "G#3", sharp: true, boundaryIndex: 5 },
  { key: "N", note: "A3", sharp: false, whiteIndex: 5 },
  { key: "J", note: "A#3", sharp: true, boundaryIndex: 6 },
  { key: "M", note: "B3", sharp: false, whiteIndex: 6 },
  { key: ",", note: "C4", sharp: false, whiteIndex: 7 },
  { key: "L", note: "C#4", sharp: true, boundaryIndex: 8 },
  { key: ".", note: "D4", sharp: false, whiteIndex: 8 },
  { key: ";", note: "D#4", sharp: true, boundaryIndex: 9 },
  { key: "/", note: "E4", sharp: false, whiteIndex: 9 },
];

const WHITE_KEY_WIDTH = 72;
const BLACK_KEY_WIDTH = 44;

const PianoManual = ({
  activeKeys,
  keys,
  label,
  onNoteEnd,
  onNoteStart,
}: {
  activeKeys: Set<string>;
  keys: PianoKey[];
  label: string;
  onNoteEnd: (key: string) => void;
  onNoteStart: (key: string) => void;
}) => {
  const whiteKeys = keys.filter((key) => !key.sharp);
  const blackKeys = keys.filter((key) => key.sharp);
  const keyboardWidth = WHITE_KEY_WIDTH * whiteKeys.length;

  const bindPointerEvents = (key: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onNoteStart(key);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onNoteEnd(key);
    },
    onPointerCancel: () => onNoteEnd(key),
    onLostPointerCapture: () => onNoteEnd(key),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }

      event.preventDefault();
      onNoteStart(key);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onNoteEnd(key);
    },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#95a1b7]">
          {label}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6a7487]">
          Live QWERTY map
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[28px] border border-[rgba(205,173,132,0.18)] p-3 shadow-[0_28px_42px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(109,75,47,0.96),rgba(54,34,21,0.98)),repeating-linear-gradient(90deg,rgba(255,255,255,0.03) 0,rgba(255,255,255,0.03) 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 8px)",
        }}
      >
        <div className="rounded-[22px] border border-black/35 bg-[linear-gradient(180deg,rgba(25,15,10,0.96),rgba(71,45,26,0.98))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="h-3 rounded-full bg-[linear-gradient(180deg,rgba(22,12,8,0.98),rgba(68,43,24,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
        </div>

        <div
          className="relative mx-auto mt-3"
          style={{ width: `${keyboardWidth + 28}px`, height: "258px" }}
        >
          <div className="absolute inset-x-0 top-0 h-[26px] rounded-t-[24px] bg-[linear-gradient(180deg,rgba(77,52,33,0.98),rgba(40,25,16,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
          <div className="absolute inset-x-4 top-[18px] h-[5px] rounded-full bg-[linear-gradient(180deg,rgba(115,21,31,0.95),rgba(58,10,16,0.88))] shadow-[0_1px_0_rgba(255,255,255,0.08)]" />
          <div className="absolute inset-x-3 top-[23px] bottom-0 rounded-[22px] bg-[linear-gradient(180deg,rgba(18,15,14,0.7),rgba(8,8,11,0.96)_18%,rgba(20,18,18,0.92)_24%,rgba(8,8,10,0.96))] shadow-[inset_0_10px_20px_rgba(0,0,0,0.32)]" />
          <div className="absolute left-3 top-[26px] bottom-0 w-[14px] rounded-l-[20px] bg-[linear-gradient(180deg,rgba(69,45,29,0.96),rgba(27,16,11,0.96))]" />
          <div className="absolute right-3 top-[26px] bottom-0 w-[14px] rounded-r-[20px] bg-[linear-gradient(180deg,rgba(69,45,29,0.96),rgba(27,16,11,0.96))]" />
          <div className="absolute left-[14px] right-[14px] top-[28px] bottom-[16px] overflow-hidden rounded-[14px] border border-black/35">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(33,28,27,0.88),rgba(8,8,11,0.98)_16%,rgba(0,0,0,0.98))]" />
          </div>

          {whiteKeys.map((item) => {
            const isActive = activeKeys.has(item.key.toLowerCase());
            const left = 14 + (item.whiteIndex ?? 0) * WHITE_KEY_WIDTH;

            return (
              <button
                key={`${label}-${item.key}`}
                type="button"
                aria-label={`${item.note} (${item.key})`}
                aria-pressed={isActive}
                className={`absolute top-[28px] overflow-hidden rounded-b-[18px] border transition-all duration-75 ${isActive ? "border-cyan-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(223,249,255,0.99)_34%,rgba(188,236,249,0.96)_64%,rgba(145,198,218,0.94)_86%,rgba(118,145,165,0.95))] shadow-[0_22px_28px_rgba(14,165,233,0.24),inset_0_0_0_1px_rgba(255,255,255,0.82)]" : "border-[#afb2b8] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(250,248,244,0.995)_22%,rgba(230,233,238,0.96)_60%,rgba(196,200,209,0.96)_84%,rgba(156,160,170,0.98))] shadow-[0_18px_24px_rgba(0,0,0,0.26),inset_0_0_0_1px_rgba(255,255,255,0.82)]"}`}
                style={{
                  left: `${left}px`,
                  width: `${WHITE_KEY_WIDTH - 2}px`,
                  height: "214px",
                }}
                {...bindPointerEvents(item.key)}
              >
                <div className="absolute inset-x-0 top-0 h-9 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.12))] opacity-85" />
                <div className="absolute inset-x-2 bottom-[18px] h-5 rounded-t-[12px] bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(255,255,255,0.2))] opacity-85" />
                <div className="absolute inset-x-1 bottom-0 h-[18px] rounded-t-[10px] bg-[linear-gradient(180deg,rgba(120,126,136,0.92),rgba(71,76,84,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]" />
                <div className="absolute inset-x-3 bottom-[24px] rounded-[14px] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))] px-2 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <div
                    className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-2xl border font-mono text-sm font-black ${isActive ? "border-cyan-400/45 bg-cyan-400/15 text-cyan-800" : "border-slate-300/80 bg-white/86 text-slate-700"}`}
                  >
                    {item.key}
                  </div>
                  <p className="font-mono text-[11px] font-bold tracking-[0.16em] text-slate-700">
                    {item.note}
                  </p>
                </div>
                <div className="absolute right-[6px] top-[16px] bottom-[38px] w-px bg-black/10" />
                <div className="absolute inset-x-3 bottom-0 h-4 rounded-t-full bg-black/18 blur-[4px]" />
              </button>
            );
          })}

          {blackKeys.map((item) => {
            const isActive = activeKeys.has(item.key.toLowerCase());
            const left =
              14 +
              (item.boundaryIndex ?? 0) * WHITE_KEY_WIDTH -
              BLACK_KEY_WIDTH / 2;

            return (
              <button
                key={`${label}-${item.key}`}
                type="button"
                aria-label={`${item.note} (${item.key})`}
                aria-pressed={isActive}
                className={`absolute top-[28px] z-10 overflow-hidden rounded-b-[12px] border transition-all duration-75 ${isActive ? "border-cyan-300/60 bg-[linear-gradient(180deg,rgba(18,51,64,0.98),rgba(19,76,92,0.96)_26%,rgba(10,19,29,0.98)_68%,rgba(7,11,17,1))] shadow-[0_20px_30px_rgba(34,211,238,0.22),inset_0_1px_0_rgba(165,243,252,0.22)]" : "border-[#171a21] bg-[linear-gradient(180deg,rgba(58,63,75,0.98),rgba(17,20,28,0.99)_24%,rgba(8,10,15,1)_72%,rgba(3,4,8,1))] shadow-[0_22px_28px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.09)]"}`}
                style={{
                  left: `${left}px`,
                  width: `${BLACK_KEY_WIDTH}px`,
                  height: "132px",
                }}
                {...bindPointerEvents(item.key)}
              >
                <div
                  className={`absolute inset-x-[3px] top-[3px] h-7 rounded-b-[10px] ${isActive ? "bg-[linear-gradient(180deg,rgba(125,239,255,0.24),rgba(125,239,255,0.02))]" : "bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.01))]"}`}
                />
                <div className="absolute inset-x-2 bottom-[14px] rounded-xl bg-black/16 px-1 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div
                    className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs font-black ${isActive ? "border-cyan-300/50 bg-cyan-300/14 text-cyan-50" : "border-white/12 bg-white/6 text-slate-100"}`}
                  >
                    {item.key}
                  </div>
                  <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-slate-200">
                    {item.note}
                  </p>
                </div>
                <div className="absolute inset-x-1 bottom-0 h-[12px] rounded-t-[5px] bg-[linear-gradient(180deg,rgba(5,7,11,0.98),rgba(18,20,27,0.98))]" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const QwertyMidiKeyboardDialog = ({
  activeKeys,
  armedTrackName,
  open,
  onNoteEnd,
  onNoteStart,
  onOpenChange,
}: QwertyMidiKeyboardDialogProps) => {
  const activeKeySet = new Set(activeKeys.map((key) => key.toLowerCase()));

  if (!open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-3 sm:p-5">
      <aside
        className="pointer-events-auto w-[min(100%,980px)] overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,10,17,0.94),rgba(16,21,32,0.96))] text-slate-100 shadow-[0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl"
        role="dialog"
        aria-label="QWERTY MIDI keyboard"
      >
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.07),transparent_20%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.1),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)]" />
          <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100">
                    Cmd/Ctrl + K
                  </span>
                  <span className="rounded-full border border-amber-400/18 bg-amber-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-amber-200">
                    QWERTY Mode
                  </span>
                  {armedTrackName && (
                    <span className="rounded-full border border-rose-400/18 bg-rose-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-rose-100">
                      Armed: {armedTrackName}
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="font-display text-[clamp(1.2rem,1.6vw,2rem)] font-semibold tracking-[-0.04em] text-slate-50">
                    Computer Keyboard MIDI
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300/72">
                    Floating keyboard view for realtime performance and
                    recording. Keep it visible while working, and use Escape or
                    Cmd/Ctrl + K to dismiss it.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition-all hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100"
                onClick={() => onOpenChange(false)}
                aria-label="Close QWERTY MIDI keyboard"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4">
              <PianoManual
                activeKeys={activeKeySet}
                keys={TOP_ROW}
                label="Upper Manual"
                onNoteEnd={onNoteEnd}
                onNoteStart={onNoteStart}
              />
              <PianoManual
                activeKeys={activeKeySet}
                keys={BOTTOM_ROW}
                label="Lower Manual"
                onNoteEnd={onNoteEnd}
                onNoteStart={onNoteStart}
              />
            </div>

            <div className="mt-4 grid gap-3 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(35,25,19,0.42),rgba(17,13,10,0.3))] p-4 sm:grid-cols-3">
              <div className="rounded-[18px] border border-white/8 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#98a5bb]">
                  Trigger
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">
                  Play directly from the computer keyboard with no modal lock
                  over the arranger.
                </p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#98a5bb]">
                  Record
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">
                  {armedTrackName
                    ? `${armedTrackName} is ready. Press REC to capture your performance into a new clip.`
                    : "Open the panel to arm a MIDI track automatically, then press REC to capture a take."}
                </p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#98a5bb]">
                  Close
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">
                  Escape closes the panel. Cmd/Ctrl + K toggles it back into
                  view whenever needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default QwertyMidiKeyboardDialog;
