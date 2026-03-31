# Browser DAW

A browser-based Digital Audio Workstation built with React, TypeScript, and the Web Audio API. The current target is a browser-first prototype that can create, import, edit, play back, export, and locally persist projects end to end.

## Status

### Done

- Project creation and local persistence
- MIDI / AAF / DAWPROJECT import
- Arrangement / Piano Roll / Audio editor workflows
- Web Audio based playback and live MIDI input
- Export to master / stems / DAWPROJECT
- Local audio asset storage with Dexie + OPFS

### Prototype

- The audio engine is functional but still evolving. Scheduler and voice-planning responsibilities are separated, but more cleanup is expected.
- The share flow is still being rebuilt. SharedProjectPage remains a provisional UI.
- Browsers without OPFS support fall back to IndexedDB-backed audio persistence.

### Planned

- Reintroduce installable PWA and offline caching
- Redesign project sharing flow
- Expand store / utility test coverage

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Development

```bash
git clone https://github.com/Koh0920/browser-daw.git
cd browser-daw
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
pnpm build
pnpm preview
```

## Quality Gates

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Project Structure

```text
browser-daw/
├── public/
├── scripts/
├── src/
│   ├── audio/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── projects/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── utils/
├── index.html
├── package.json
└── vite.config.ts
```

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS + Radix UI |
| State management | Zustand + Immer |
| Audio | Web Audio API |
| MIDI | @tonejs/midi |
| Storage | Dexie + OPFS fallback |

## Notes

- The supported runtime is Vite. There is no active Next.js setup in this repository.
- public/manifest.json is currently a placeholder asset for a future PWA reintroduction and is not wired into an install flow yet.

## License

MIT © Koh0920
