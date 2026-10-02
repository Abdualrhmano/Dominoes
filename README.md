# Dominoes

A browser-based dominoes game with a polished UI, round/match scoring, and a configurable computer opponent. The project runs fully on the client side and stores AI/model and gameplay settings locally in the browser.

## Purpose

This repository implements a complete front-end dominoes experience focused on:

- classic 0–6 tile gameplay
- human vs computer rounds and match progression
- interactive, responsive game presentation
- local AI behavior persistence in the browser (no backend required)

## Highlights

- **Client-only gameplay engine** in modular JavaScript (`js/engine.js`, `js/ui.js`, `js/ai.js`)
- **Multiple AI modes** (`easy`, `hard`, `learned`) in the main app
- **Learning model persistence** via `localStorage`
- **Model controls** in the main interface (export/import/reset/sync)
- **Accessible UI elements** including ARIA labels, live regions, and keyboard activation for player tiles
- **Responsive layout** with mobile-focused CSS rules
- **Additional standalone builds/prototypes** included as `Down.html` and `index1.html`

## Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES modules)
- Browser APIs:
  - `localStorage`
  - Canvas 2D
  - DOM events and accessibility attributes

## Local Development / Running

No build step or package installation is required.

1. Clone/download this repository.
2. Open `/home/runner/work/Dominoes/Dominoes/index.html` in a modern browser, or serve the folder with any static file server and open `index.html`.
3. Start the game from the landing screen.

## Project Structure

```text
Dominoes/
├── index.html              # Main entry (landing + game app)
├── css/
│   └── styles.css          # Main styling and responsive rules
├── js/
│   ├── main.js             # App bootstrap and UI event wiring
│   ├── engine.js           # Game rules, turn flow, scoring, match logic
│   ├── ai.js               # AI move selection + local learning model
│   ├── ui.js               # Rendering, modals, announcements, confetti
│   ├── tile.js             # Tile model
│   └── utils.js            # Utility helpers
├── worker/
│   └── ai-worker.js        # Worker-side AI message handler (included)
├── Down.html               # Standalone Arabic canvas-based variant
└── index1.html             # Standalone polished edition variant
```

## Customization Guide

- **Target match score**: update `targetScore` in `js/main.js` (currently set to `101`).
- **AI defaults and learning behavior**: edit `js/ai.js` (weights, learning rates, model metadata).
- **Visual theme/layout**: adjust CSS variables and component styles in `css/styles.css`.
- **Main gameplay flow**: update state/turn/round logic in `js/engine.js`.

## Accessibility & Browser Notes

- The main app includes ARIA labels and a live announcer region for status updates.
- Player tiles can be activated by keyboard (`Enter` or `Space`) in the primary UI.
- The app relies on modern browser features (ES modules, Canvas, `localStorage`).
- Because state is stored in-browser, clearing site data removes saved model/settings.

## Contributing

Contributions are welcome through pull requests.

Suggested workflow:

1. Fork the repository.
2. Create a focused branch.
3. Make minimal, targeted changes.
4. Validate behavior in the browser.
5. Open a pull request with a clear summary of what changed and why.

## License

A license file is not currently present in this repository. Until a license is added, reuse/redistribution terms are not explicitly defined.
