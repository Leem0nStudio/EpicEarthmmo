# EpicEarthMMO AI Agent Guide

Use this file to help coding agents understand the repository, run the app, and focus on the current unfinished work.

## Project overview
- Web-based mobile MMORPG prototype built with **Next.js 15 App Router**, **React Three Fiber**, **Three.js**, **Rapier**, **Socket.IO**, and **Supabase**.
- Frontend client and dedicated authoritative game server are separate but share schemas and game logic in `shared/`.
- Current state: core gameplay systems are implemented, but polish, content, server-authoritative validation, and online robustness remain incomplete.

## Primary run commands
- `npm install`
- `npm run dev` — client frontend on localhost:3000
- `npm run dev:game` — dedicated game server on localhost:3001
- `npm run dev:all` — both client and game server concurrently
- `npm run build` — bundle server and build Next.js app
- `npm run lint` — lint the codebase

## Key directories
- `app/` — Next.js app router, layout, page entrypoints
- `components/game/` — Three.js scene, gameplay systems, HUD, map components
- `components/ui/` — reusable UI primitives and controls
- `lib/` — client-side game logic modules and helpers
- `shared/` — shared data, Zod schemas, loaders, formulas, and types
- `game-server/` — authoritative game loop, world state, AI, skills, buffs
- `docs/DEVELOPMENT_GUIDE.md` — project agent roles, rules, and priorities
- `TODOS.md` — most recent open tasks, regressions, and technical debt

## Important conventions
- The server is authoritative for movement, pathfinding, skills, combat, trades, and warp validation.
- Shared Zod validation is the source of truth for client/server contracts.
- Keep changes aligned with the existing MMORPG design: simple, extensible, maintainable.
- Prefer incremental fixes and polish over adding large new systems.

## Current priorities and unfinished work
Focus on tasks already tracked in `TODOS.md` and the current project scope:
- network lag/RTT measurement and compensation
- hit/flee feedback and combat messaging
- warp validation and map transition safety
- respawn/fade polish and UI feedback
- loot, item/zeny drops, inventory sorting/filtering
- equipment slots, buff/debuff tooltips, and UI polish
- audio placeholders, performance profiling, and error handling

## Recommended references
- `README.md` — architecture, stack, and overall status
- `docs/DEVELOPMENT_GUIDE.md` — agent roles, project philosophy, and rules
- `TODOS.md` — latest incomplete work and bug/tech-debt list
- `package.json` — available scripts and project dependencies

