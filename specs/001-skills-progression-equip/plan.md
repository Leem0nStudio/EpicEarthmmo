# Implementation Plan: Skills, Progression & Equipment Overhaul

**Branch**: `main` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-skills-progression-equip/spec.md`

## Summary

Overhaul 3 interconnected systems: (1) make equipment functional (equip/unequip,
server-authoritative stat bonuses), (2) fix class progression (auto-learn skills,
correct HP/SP formulas, milestone bonuses, stat allocation sync), (3) add skill
depth (level scaling, class restrictions). All changes use existing UI patterns
and shared schemas.

## Technical Context

**Stack**: Next.js 15 (App Router) + TypeScript + Socket.IO + Zustand + Zod
(already established)

**Primary Dependencies**: Existing — no new dependencies needed. All changes use
current stack.

**Storage**: In-memory Map for prototype (no database change)

**Testing**: `npm run build` (type checking + webpack compilation)

**Target Platform**: Web (Vercel deployment)

**Project Type**: Full-stack game (Next.js frontend + Node.js game server)

**Performance Goals**: Equipment/stats changes reflected within 1 game tick
(50ms). No new network events — reuse existing snapshot/world update flow.

**Constraints**: Must not break existing combat, movement, or map rendering.
All data changes must maintain Zod schema backward compatibility.

**Scale/Scope**: ~15 files modified across shared schemas, game server, client
store, and UI components. No new UI screens — only modify existing windows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Server-Authoritative | ✅ PASS | Equip/unequip validated server-side, stats computed server-authoritatively |
| II. Shared Schema First | ✅ PASS | New fields in items, skills, jobs schemas with Zod validation |
| III. UI Consistency | ✅ PASS | Uses existing EquipmentWindow, SkillsWindow, StatsWindow patterns |
| IV. Data-Driven Design | ✅ PASS | All game content in JSON data files, no hardcoded values |
| V. Progressive Depth | ✅ PASS | P1 = foundational fixes, P2 = depth layers, P3 = polish |

## Project Structure

### Documentation (this feature)

```text
specs/001-skills-progression-equip/
├── plan.md              # This file
├── research.md          # Phase 0 - contextual analysis
├── data-model.md        # Phase 1 - data schema changes
├── tasks.md             # Phase 2 - task breakdown
```

### Source Code (changed files)

```text
shared/
├── schemas/
│   ├── items.ts         # ADD equipSlot field
│   ├── skills.ts        # ADD allowedClasses, skill levels
│   └── gameState.ts     # ADD skillLevels map to PlayerState
├── data/
│   ├── items.json       # ADD equipSlot to all equip items
│   └── skills.json      # ADD allowedClasses to all skills

game-server/
├── index.ts             # ADD equip/unequip handlers, fix processServerLevelUp
├── SkillEngine.ts       # ADD level scaling, class validation

store/
├── useGameStore.ts      # FIX equipItem/unequipItem, add skillLevels
└── useNetworkStore.ts   # ADD equip/unequip socket handlers

components/game/
├── ui/
│   ├── SkillsWindow.tsx # ADD level display, class restriction filter
│   ├── EquipmentWindow.tsx # FIX slot assignment, stat display
│   └── StatsWindow.tsx  # ADD milestone bonus display
└── hud/
    └── PlayerFrame.tsx  # ADD stat change reactivity
```

## Complexity Tracking

No constitution violations — this feature aligns with all principles.
