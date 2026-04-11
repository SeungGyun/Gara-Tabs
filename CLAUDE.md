# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

코드 변경 작업을 시작하기 전에 반드시 새 브랜치를 생성한 뒤 작업한다. master에 직접 커밋하지 않는다.

```bash
git checkout -b feat/기능-설명    # 기능 추가
git checkout -b fix/버그-설명     # 버그 수정
git checkout -b ui/개선-설명      # UI 개선
```

작업 완료 후 master에 머지하고 푸시하는 것은 사용자가 명시적으로 요청할 때만 한다.

## Build & Dev Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc -b && vite build → outputs to dist/
npm run test         # vitest run
npm run test:watch   # vitest watch mode
```

To load in Chrome: `chrome://extensions` → Developer Mode → Load unpacked → select `dist/`

Icons regeneration: `node scripts/generate-icons.mjs`

## Architecture

Chrome Extension (Manifest V3) with **three isolated execution contexts**:

```
Background Service Worker (src/background/index.ts)
  ├── Side Panel (src/sidepanel/)  — 400px panel for daily use
  └── Editor (src/editor/)         — full tab page for profile editing
```

### Communication

- **Side Panel/Editor → Background**: `chrome.runtime.sendMessage({ type: 'ACTION', ... })` with typed `MessageType` union
- **Background → caller**: async `sendResponse` (handler returns `true` to keep channel open)
- **Cross-context state sync**: Zustand stores listen to `chrome.storage.onChanged` — any context writing to storage automatically triggers updates in all other contexts

### Zustand Stores (src/shared/store/)

- **profileStore** — Profile CRUD, persisted to `chrome.storage.local`. Includes profile version history (2-day retention). All mutations auto-push previous state to history.
- **settingsStore** — Subdomain modes, custom domain rules, auto-group rules, exclude patterns
- **tabStore** — Editor-only in-memory state. Has its own undo/redo history stack (max 50). Changes only persist to storage on explicit "Save".

All Chrome API calls (tabs, tabGroups, windows) go through the Background service worker. Side Panel and Editor never call Chrome APIs directly — they send messages to Background.

### Key Data Flow

Profile save: Side Panel → `captureCurrentTabs()` → reads Chrome tabs/groups → builds `Profile` object → writes to `chrome.storage.local` → all contexts auto-sync

Profile load: Side Panel → message to Background → Background creates tabs via `chrome.tabs.create()` → groups via `chrome.tabs.group()` → sets colors/titles via `chrome.tabGroups.update()`

### Shared Utilities (src/shared/)

- `utils/domain.ts` — URL → domain extraction with merge/split/custom subdomain modes. Custom rules match against hostname, hostname-without-www, and base domain (fallback chain).
- `utils/dedup.ts` — `normalizeUrl()` strips protocol, www, trailing slash, sorts query params. Used for duplicate detection and profile-to-tab name matching.
- `utils/colors.ts` — `COLOR_MAP` / `COLOR_MAP_LIGHT` map `ChromeTabGroupColor` enum to hex values
- `components/InlineEditText.tsx` — Double-click-to-edit text component, used across editor and side panel
- `components/ContextMenu.tsx` — Right-click positioned dropdown menu

## Conventions

- UI language is Korean (constants like `'미분류'`, `'📌 고정 탭'`, `'기존 탭'`)
- Chrome tab group colors use `chrome.tabGroups.ColorEnum` type (cast required)
- Background message handlers return `{ success: boolean, ... }` objects
- Chrome API calls are wrapped in try-catch with silent failure (tabs may close mid-operation)
- IDs use `crypto.randomUUID()` via `generateId()` wrapper
- Tailwind CSS with `dark:` media-query dark mode
- CRXJS Vite plugin handles manifest processing — source paths in manifest.json reference TypeScript/HTML directly
