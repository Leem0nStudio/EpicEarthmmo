# ADR-0003: AGI-Based Walk Speed and Auto-Follow Path Cancellation

## Status
Accepted

## Date
2026-05-28

## Context

### Problem Statement
Two movement-related improvements were needed:

1. **Walk speed should scale with AGI**: In Ragnarok Online, AGI (Agility) reduces movement animation timing, making characters move faster. Our system had a hardcoded `walkSpeedMs: 150` per cell with no stat scaling. Additionally, the `walkSpeedMs`, `moveDiagonalCost`, and `moveCost` fields were missing from the Zod `BalanceSchema`, causing them to be stripped at parse time and leaving `walkSpeedMs` as `undefined` on the `ServerPlayer`.

2. **Auto-follow should cancel grid path on the server**: When auto-follow kicks in (player selects a target while following a click-to-move path), the client cancelled the grid path locally but only sent `cancelMove` to the server for **keyboard** input, not for auto-follow. This created a 50ms window where the server still had the old grid path active.

### Constraints
- Formula must use the same pattern as existing `attackCooldownFormula` (`baseMs - AGI * perAgi`, capped at `minMs`)
- Server sends `walkSpeedMs` to client inside `MoveAcceptedData` — client doesn't need its own formula
- Auto-follow cancel must not introduce visual stutter or server desync
- All balance fields must survive Zod parsing (must be declared in the schema)

### Requirements
- `walkSpeedMs = max(minMs, baseMs - AGI * perAgi)`, where `baseMs = 150`, `perAgi = 1`, `minMs = 75`
- Formula applied on server when building grid path in `moveToTarget` handler
- Formula applied on initial player creation
- Auto-follow sends `cancelMove` to server on path cancellation (same as keyboard)
- All movement fields preserved through Zod schema parsing

## Decision

### Decision 1: AGI Walk Speed Formula
Add `walkSpeedFormula` to the movement section of `BalanceSchema` and `balance.json`, following the same pattern as `attackCooldownFormula` in the combat section. Add `calculateWalkSpeedMs(agi, balance)` to `formulaEngine.ts`. The server uses this function both at player creation and at each `moveToTarget` to populate `walkSpeedMs`.

### Decision 2: Auto-Follow Sends cancelMove
Remove the `inputSource === 'keyboard'` guard so `cancelMove` is emitted for ALL input sources (keyboard AND auto-follow) when a grid path is cancelled locally.

### Architecture Diagram

```
Player.tsx (client)                          game-server/index.ts
┌────────────────────────┐                   ┌────────────────────────────┐
│ auto-follow kicks in   │  ───cancelMove──> │ clears gridPath            │
│ → effectiveInput set   │                   │                            │
│ → mode='followingPath' │                   │                            │
│ → cancelPath()         │                   │                            │
│   (was: only keyboard  │                   │                            │
│    now: ALL sources)   │                   │                            │
└──────────┬─────────────┘                   └────────────────────────────┘
           │
           │  ───input──────>                ┌────────────────────────────┐
           │  (throttled 50ms)               │ processes velocity movement│
           │                                 │ from inputQueue            │
           │                                 └────────────────────────────┘
```

```
Server moveToTarget handler:
  walkSpeedMs = calculateWalkSpeedMs(player.stats.agi, balance)
             = max(minMs, round(baseMs - agi * perAgi))
             = max(75, round(150 - agi * 1))

  Examples:
    AGI  5 → 145 ms/cell (3.4% faster)
    AGI 25 → 125 ms/cell (16.7% faster)
    AGI 50 → 100 ms/cell (33.3% faster)
    AGI 75 →  75 ms/cell (50% faster, capped)
```

### Key Interfaces

#### `calculateWalkSpeedMs` (formulaEngine.ts)
```typescript
function calculateWalkSpeedMs(agi: number, balance: BalanceConfig): number {
  const safeAgi = isNaN(agi) ? 0 : Math.max(0, agi);
  const cfg = balance.movement.walkSpeedFormula;
  if (!cfg) return balance.movement.walkSpeedMs;
  return Math.max(cfg.minMs, Math.round(cfg.baseMs - safeAgi * cfg.perAgi));
}
```

#### Updated movement schema (balance.ts)
```typescript
movement: z.object({
  playerSpeed: z.number().positive(),
  walkSpeedMs: z.number().positive().default(150),
  moveDiagonalCost: z.number().positive().default(14),
  moveCost: z.number().positive().default(10),
  clickMoveRange: z.number().positive().optional().default(30),
  interactRange: z.number().positive().optional().default(2.5),
  npcTalkRange: z.number().positive().optional().default(2),
  pathfindingGridSize: z.number().positive().optional().default(0.5),
  pathfindingUpdateMs: z.number().positive().optional().default(200),
  stuckTimeoutMs: z.number().positive().optional().default(3000),
  walkSpeedFormula: z.object({
    baseMs: z.number().positive().default(150),
    perAgi: z.number().nonnegative().default(1),
    minMs: z.number().positive().default(75),
  }).optional(),
})
```

## Alternatives Considered

### Alternative 1: Client-side formula only
- **Description**: Let both client and server independently calculate walk speed from AGI
- **Pros**: No need to pass `walkSpeedMs` in `MoveAcceptedData`
- **Cons**: Duplication of formula logic; risk of desync if formulas diverge; requires sending AGI in snapshots
- **Rejection Reason**: Server already sends `walkSpeedMs` inside `MoveAcceptedData` — the client already uses the server value. Adding a client-side formula adds maintenance burden with zero benefit

### Alternative 2: Keep hardcoded 150ms default in client idle state
- **Description**: Leave `walkSpeedMs: 150` as the idle fallback in Player.tsx
- **Pros**: No client changes needed
- **Cons**: Inconsistent default if base balance changes
- **Acceptance Reason**: Acceptable trade-off — the idle fallback is only used when no path exists; the correct value arrives with the next `moveAccepted` event. Marked in code as a known potential drift point

## Consequences

### Positive
- Walk speed now scales meaningfully with AGI (5 base AGI = 145ms/cell, high AGI builds move noticeably faster)
- Server-side formula ensures authority over walk speed
- Zod schema now preserves all movement fields (`walkSpeedMs`, `moveDiagonalCost`, `moveCost`) instead of stripping them
- Auto-follow immediately cancels grid path on server, eliminating the 50ms desync window
- Formula format matches existing `attackCooldownFormula` pattern for consistency
- Calling `cancelMove` for all input sources is safe because the server handles idempotent cancellation

### Negative
- Player.tsx still has `walkSpeedMs: 150` hardcoded as idle fallback — if base balance changes, the idle value could briefly drift. Impact is cosmetic and self-corrects on next path
- AGI formula is recalculated on each `moveToTarget` call but NOT mid-path if AGI changes due to buffs/equipment — path timing is fixed at creation time

### Risks
- **Formula change**: If `walkSpeedFormula` is removed from `balance.json`, the server falls back to `balance.movement.walkSpeedMs` (150) — same as before. Safe default
- **NaN AGI**: `calculateWalkSpeedMs` guards with `isNaN(agi) ? 0 : Math.max(0, agi)`. Any stat value produces a valid result
- **Schema strictness**: Adding `walkSpeedFormula` as `.optional()` means old balance files without the field still work (defaults apply)

## Performance Implications
- **CPU**: One `calculateWalkSpeedMs` call per `moveToTarget` (negligible — integer math, no allocations)
- **Memory**: No change
- **Network**: No change — `walkSpeedMs` was already in `MoveAcceptedData`

## Migration Plan
**Already applied** — changes are backward-compatible via Zod `.default()`.

## Validation Criteria
- [x] Server builds with new formula (163.3kb)
- [x] Zod schema preserves `walkSpeedMs`, `moveDiagonalCost`, `moveCost` through parse
- [x] `calculateWalkSpeedMs` returns correct values for edge cases (AGI=0, AGI=99, AGI=NaN)
- [x] Auto-follow sends `cancelMove` to server immediately on path cancellation
- [x] No new lint errors (all errors pre-existing)

## Related Decisions
- [ADR-0001: RO-Style Grid-Based Movement System](adr-0001-ro-style-grid-movement.md)
- [ADR-0002: RO-Style 2D Sprite Rendering in 3D](adr-0002-ro-style-sprite-rendering.md)
