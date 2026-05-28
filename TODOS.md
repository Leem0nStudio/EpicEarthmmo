# TODOS — EpicEarthMMO

## Movement / Interaction
- [x] **Movement redesign**: 2 clean modes (Direct Input + Target Movement) that never conflict
- [x] **Client prediction + server reconciliation**: Direct Input uses velocity-based prediction with periodic reconciliation
- [x] **Server-authoritative pathfinding**: A* 8-dir + string-pull smoothing moved to `shared/pathfinding.ts`, server computes paths
- [x] **Server-authoritative interactions**: client sends target → server walks player → server emits `interactionReady`
- [x] **ServerPlayer state machine**: path-following in game loop with `moveTarget`, `path`, `pathIndex`, `pendingInteraction`
- [ ] **Cancel movement edge cases**: verify behavior when target moves out of bounds mid-path

## Map System
- [x] **Map system redesign**: monolithic `Map.tsx` (341 lines) split into 10 modular components in `components/game/map/`
- [x] **Component breakdown**: MapScene (orchestrator), MapTerrain, MapDecorations (LOD + layers), MapLighting, MapEntities, MapClickHandler, MapColliders, MapWarps, MapSafeZones, MapGrass
- [x] **Bug fixes**: safe zones depthWrite=false, colliders with explicit colliders="cuboid", click handler separated from physics, LOD centralized
- [ ] **Performance profiling**: verify instanced terrain + decoration LOD works within budget on all 3 maps

## Network Engineer
- [x] **RTT measurement**: ping/pong socket events, RTT tracked per player on server, lag-compensated attack range and client reconciliation
- [x] **saveProgress Zod validation**: server acepta `any` JSON sin schema — FIXED con SaveDataSchema
- [x] **Trade fix**: `acceptTrade` solo emite `success` — FIXED con transferencia real items/zeny + rollback
- [ ] **Hit/Flee feedback**: MISS flotante + texto de daño para habilitar hit/flee evasion
- [ ] **Warp validation**: server valida cooldown pero no chequea que el warp exista en el mapa
- [ ] **Map transitions**: validate target map exists before warping
- [ ] **Player respawn animation**: current respawn is instant teleport, should have fade/cooldown

## Combat / Classes
- [x] **Auto-attack range check on server**: FIXED — ahora usa skillDef.range y emite feedback al cliente
- [x] **Skill cooldown server enforcement**: FIXED — cooldowns validados server-side por skill ID en attack + skillCast
- [x] **Class-specific passives**: Novice, Swordsman, Mage, Archer, Thief, Acolyte — FIXED vía shared/loader/passiveEngine.ts con 7 effect types
- [x] **Level-up bonuses per class**: each class grants different HP/SP/stat gains — FIXED server-side con processServerLevelUp + jobs.json levelUpBonuses
- [ ] **Zeny drops from enemies**: Merchant zeny_drop_pct passive defined but no zeny drops implemented yet

## Content
- [ ] **Savage, Drainliar, Elder Wolf, Mummy sprites**: enemies defined but no visual assets
- [ ] **More Prontera NPCs**: tool dealer, armorer, kafra
- [ ] **Monster loot tables**: each enemy should drop specific items with drop rates
- [ ] **More maps**: Morocc, geffen, payon field maps

## UI / UX
- [ ] **Buff/debuff tooltips**: show remaining time and description on hover
- [ ] **Inventory sorting/filtering**: sort by type, name, rarity
- [ ] **Equipment slots**: head, body, weapon, shield, garment, shoes, accessory
- [ ] **Mini-map**: show player position, NPCs, warps on a corner minimap
- [ ] **Settings menu**: volume, keybinds, graphics options

## Polish
- [ ] **Fade transitions**: between maps, on death/respawn
- [ ] **Footstep SFX**: per terrain type
- [ ] **Ambient sounds**: per region/map
- [ ] **Screen shake on hit**: currently only triggers on enemy damage, not player receiving damage

## Tech Debt
- [ ] **Extract hardcoded strings**: all client toast/log messages should be in a locale file
- [ ] **Unify types**: `ServerPlayer` in game-server/types.ts vs client types — confirm alignment
- [ ] **Error boundaries**: add React error boundaries around game canvas and HUD components
- [ ] **Performance**: profile draw calls, texture memory usage on Prontera
