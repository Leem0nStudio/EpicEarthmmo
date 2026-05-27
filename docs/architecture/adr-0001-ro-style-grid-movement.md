# ADR-0001: RO-Style Grid Movement System

## Status
Accepted

## Date
2026-05-27

## Context

### Problem Statement
The current movement system is a hybrid of velocity-based WASD movement and click-to-move pathfinding. Neither mode behaves like Ragnarok Online (RO), which is the target reference for this MMO. Players move with smooth acceleration/friction rather than grid-snapped tick-based movement, making the game feel unlike RO. The server's path-following in target mode uses continuous-speed movement between waypoints instead of per-cell timing with diagonal cost.

### Why Change Now
The terrain was just converted to grid-based heightmapped 3D with orthogonal isometric camera. With grid infrastructure in place (navGrid, getCellAtWorld, worldToGrid), the movement system is the last piece to make the game feel authentically RO. Waiting longer creates more code to refactor.

### Constraints
- **Server-authoritative**: Server must validate every step — no client can teleport or move at invalid speeds
- **20 tps tick rate**: Server runs at 50ms/tick; movement must work within this constraint
- **Existing balance config**: `balance.movement.playerSpeed = 8` (currently units/sec); needs reinterpretation
- **Existing navGrid**: Grid cells of varying size (current balance `pathfindingGridSize: 0.5`); must work with actual per-map cell sizes
- **Coexistence with WASD**: Direct keyboard input should exist but cancel click-to-move paths
- **Combat integration**: Attack range checks, auto-follow, kiting all depend on movement

### Requirements
- Click-to-move snaps player to grid cells, moving one cell at a time
- Walk speed defined as **ms per straight cell** (RO default: 150ms)
- Diagonal movement costs 1.4× a straight cell (√2)
- Server uses tick-based timers to advance path; client interpolates smoothly between cells
- Path is stored as a list of grid coordinates + cumulative timing
- Server validates every cell transition (walkability, speed, cooldown)
- Client shows smooth interpolation between current and next cell position
- WASD input cancels current path and immediately moves in the pressed direction
- Movement state machine (idle → walking → arriving) drives animation

## Decision

### Architecture Overview

Replace the current velocity-based movement with **RO-style grid movement**:

1. **Walk Speed**: Interpreted as **ms per straight cell step**. Default 150ms. Configurable via `balance.movement.walkSpeedMs` or derived from player stats (AGI influences move speed in RO).

2. **Path Representation**: Each path is an array of `{gx, gz, cumulativeTimeMs}`. The server pre-computes cumulative timing for the entire path:
   - Straight step: `+walkSpeedMs`
   - Diagonal step: `+walkSpeedMs * MOVE_DIAGONAL_COST / MOVE_COST` (e.g., 210ms for 150ms base × 1.4)

3. **Server Tick Processing**: Each tick, the server checks which path segment the player should be on based on elapsed time since path start, advancing them to the correct cell. This is simpler than per-step timers.

4. **Client Interpolation**: Server sends the full path with cumulative timing. Client knows exactly where the player should be at any given time and interpolates between cell centers.

5. **No WASD Click-to-Move Mixing**: WASD input always clears the current path. Click-to-move always clears WASD velocity.

### Key Formulas

```
walkSpeedMs = baseWalkSpeed (default 150ms per straight cell)
MOVE_DIAGONAL_COST = 14  (arbitrary unit)
MOVE_COST = 10

cellTime(cell) = walkSpeedMs * (isDiagonal(cell) ? MOVE_DIAGONAL_COST / MOVE_COST : 1)

totalTime(path) = Σ cellTime(cell_i) for i = 0..n-1
```

For a path with `dx=5, dz=-10`:
- min=5 diagonal cells, straight=5 cells
- Total: `5 × 150ms + 5 × 210ms = 1800ms`

### Architecture Diagram

```
Player clicks tile
       │
       ▼
  [Client] sendMoveToTarget(targetX, targetZ)
       │
       ▼
  [Server] validate target cell walkable
       │  findPath from player cell to target cell
       │  compute cumulative timings
       │  store path + pathStartTime on player
       │  emit 'moveAccepted' with path data + startTime
       │
  ┌─────┴──────┐
  │            │
  ▼            ▼
[Client]    [Every tick: Server]
interpolate  advance position by
cell→cell    checking elapsed time
lerp z+16ms  against cumulative path times
             validate each cell is walkable
             cancel if blocked/changed
             emit snapshot of current cell

When path fully consumed:
  emit 'moveCompleted'
  set player state to idle
  execute pending interaction
```

### Comparison: RO Server (rAthena) vs Our Implementation

| Feature | rAthena | Our Implementation |
|---------|---------|-------------------|
| Walk speed base | `DEFAULT_WALK_SPEED = 150` (ms/cell) | `balance.movement.walkSpeedMs = 150` |
| Diagonal cost | `MOVE_DIAGONAL_COST / MOVE_COST` | Same constant ratio |
| Tick mechanism | Per-step timer (`add_timer(tick + speed, ...)`) | Tick-based elapsed time check |
| Path storage | `walkpath` array of direction enums, max 32 steps | Path array of `{gx, gz}` with cumulative time |
| Move refresh | Resend move after 1s if damaged (`MOVE_REFRESH_TIME = 1000`) | Same |
| Max path length | 14 cells displayed client-side; server longer | Configurable (default 32) |
| Client movement | Smooth lerp between cells, render at 60fps | Same approach |

### Key Interfaces

#### ServerPlayer Additions
```typescript
// Replace current moveTarget/path/pathIndex with:
interface ServerPlayer {
  // ...existing fields...
  
  // New RO-style movement
  gridPath: Array<{ gx: number; gz: number; cumTimeMs: number }> | null;
  pathStartTime: number; // Date.now() when path was accepted
  walkSpeedMs: number;   // current effective speed (may vary by AGI/equip)
  lastMoveRefreshTime: number; // for MOVE_REFRESH check
  
  // Keep vx/vz for WASD mode only, remove from target mode
}
```

#### Server → Client Messages
```typescript
// Existing: moveToTarget (client → server) — keep as-is
// Existing: moveCompleted (server → client) — keep as-is

// New: moveAccepted (server → client)
interface MoveAcceptedData {
  path: Array<{ gx: number; gz: number; cumTimeMs: number }>;
  startTime: number; // server time (Date.now())
  walkSpeedMs: number;
}
```

#### Client State Machine
```typescript
type MovementMode = 'idle' | 'followingPath' | 'wasdMoving';
```

## Alternatives Considered

### Alternative 1: Keep Current Velocity System (Status Quo)
- **Description**: Keep smooth WASD + path-following as-is
- **Pros**: Already works, less code churn
- **Cons**: Doesn't feel like RO; server position snaps create visual jarring; diagonal movement has no cost differentiation; combat range checks against continuous positions can be inaccurate
- **Rejection Reason**: Fails the requirement of feeling like RO

### Alternative 2: Per-Step Server Timer (rAthena Clone)
- **Description**: Server fires a timer every `walkSpeedMs` to advance one cell, exactly like rAthena's `unit_walktoxy_timer`
- **Pros**: Most faithful to RO server architecture
- **Cons**: Creates N timers per moving unit; complex timer management; harder to reconcile with 50ms tick loop
- **Rejection Reason**: Tick-based elapsed time check achieves same result with simpler code

### Alternative 3: Send Only Destination, Let Client Predict Path
- **Description**: Client computes path, server only validates destination
- **Pros**: Less server work
- **Cons**: Client could manipulate path; desync on obstacles; violates server-authoritative principle
- **Rejection Reason**: Must be server-authoritative

### Alternative 4: Full Client Prediction + Server Reconciliation (Modern Approach)
- **Description**: Client moves immediately on click, predicts position, server reconciles
- **Pros**: Zero perceived lag
- **Cons**: Much more complex; unnecessary for grid-based movement at 150ms/cell (per-step latency is 150ms, well within acceptable range)
- **Rejection Reason**: Grid movement at 150ms/cell doesn't need prediction — the delay between clicking and moving is the natural walk speed feel

## Consequences

### Positive
- Movement feels authentically RO — grid-snapped, diagonal cost, predictable timing
- Server-authoritative with simple validation (each cell checked individually)
- Client interpolation between cells at 60fps looks smooth despite 150ms/cell stepping
- Combat range checks are unambiguous (cell center vs cell center)
- Walk speed can be modified by AGI, equipment, buffs, status effects
- Path flickering eliminated (no velocity correction snaps)

### Negative
- WASD movement becomes less smooth (grid-snapped instead of velocity-based)
- Loses existing acceleration/deceleration feel
- Requires updating all movement-dependent systems: auto-follow, mob AI, attack range

### Risks
- **Risk**: Players find grid-snapped movement "stiff" compared to velocity-based smooth movement
  - **Mitigation**: Client interpolation between cell centers provides smooth visual movement; the grid snap is only on the server position
- **Risk**: 50ms tick rate combined with 150ms/cell walk speed causes positional "stutter" on other players
  - **Mitigation**: Use elapsed time on client to interpolate position independently of snapshot rate
- **Risk**: Path desync if server and client have slightly different cell timing calculations
  - **Mitigation**: Server sends cumulative times explicitly; client only interpolates between known cell positions

## Performance Implications
- **CPU**: Negligible — path timing is O(n) per path computation, checked once per tick per moving unit
- **Memory**: ~128 bytes per active path (32 cells × 3 ints), same as current system
- **Network**: Slightly more data per moveAccepted (sending path cells instead of single target), but still small (<500 bytes)
- **Load Time**: Unaffected

## Migration Plan

### Phase 1: Server Path Timing (game-server/index.ts)
1. Change `ServerPlayer.moveTarget/path/pathIndex` → `gridPath/pathStartTime/walkSpeedMs`
2. Replace path-following movement with elapsed-time-based cell advancement
3. Emit `moveAccepted` instead of relying on snapshot position for movement

### Phase 2: Client Path Interpolation (Player.tsx)
1. Add movement mode state machine: `idle | followingPath | wasdMoving`
2. On `moveAccepted`, store path and start interpolating cell → cell
3. On WASD input, clear path and switch to wasdMoving mode
4. Remove old velocity-based movement logic for target mode
5. Rewrite server reconciliation (no more velocity correction, just cell snap if desynced)

### Phase 3: Balance Config
1. Add `balance.movement.walkSpeedMs: 150` to balance.json
2. Change `playerSpeed` to represent WASD grid-step speed (same units, just snapped)
3. Ensure AGI formula reduces walkSpeedMs proportionally

### Phase 4: Auto-Follow & Combat Integration
1. Update auto-follow to use grid path (pathfind to cell adjacent to target)
2. Update attack range to check cell distance instead of continuous distance
3. Ensure enemy pursuit uses same grid movement timing

## Validation Criteria
1. Click to move: player steps one grid cell at a time, visible per-step movement, diagonal steps take visibly longer
2. Server validates: walkable cells, speed cap, cannot move through blocked tiles
3. Multiple clients see each other's movement correctly (grid-snapped positions in snapshots)
4. WASD input immediately cancels path and allows free movement
5. Auto-follow pathfinds to adjacent cell of target and stays in attack range
6. AGI buffs/reductions correctly modify walk speed (lower ms = faster)

## Related Decisions
- ADR-0002 (future): AGI-based walk speed formula
- ADR-0003 (future): Client-side move prediction for WASD mode
