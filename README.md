# 🎹 Browser DAW

A browser-based Digital Audio Workstation (DAW) built with React, TypeScript, and the Web Audio API. Create, edit, and play back music projects entirely in your browser — no installation required.

## ✨ Features

- **Multi-track sequencer** — Arrange audio and MIDI clips on a timeline
- **MIDI editor** — Create and edit MIDI clips with a piano-roll interface
- **Web Audio engine** — Low-latency playback powered by the Web Audio API
- **Project management** — Save, load, and import projects (supports `.aaf` and other formats)
- **PWA support** — Installable as a Progressive Web App for offline use
- **Modern UI** — Built with Radix UI components and Tailwind CSS

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/Koh0920/browser-daw.git
cd browser-daw

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
pnpm build
pnpm start   # preview the production build
```

## 🗂 Project Structure

```
browser-daw/
├── public/          # Static assets & PWA icons
├── src/
│   ├── audio/       # Web Audio engine & scheduling logic
│   ├── components/  # Reusable UI components
│   ├── hooks/       # Custom React hooks
│   ├── lib/         # Utility libraries
│   ├── pages/       # Page-level components
│   ├── stores/      # Zustand state management
│   ├── styles/      # Global styles
│   ├── types/       # TypeScript type definitions
│   └── utils/       # Helper utilities
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

## 🛠 Tech Stack

| Category | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS + Radix UI |
| State management | Zustand + Immer |
| Audio | Web Audio API |
| MIDI | @tonejs/midi |
| Storage | Dexie (IndexedDB) |
| PWA | vite-plugin-pwa |

## 📄 License

MIT © [Koh0920](https://github.com/Koh0920)
