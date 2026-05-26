---

description: "Task list for Skills, Progression & Equipment Overhaul"
---

# Tasks: Skills, Progression & Equipment Overhaul

**Input**: Design documents from `specs/001-skills-progression-equip/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Schema & Data Updates (Shared Infrastructure)

**Purpose**: Update data definitions that both client and server depend on

- [ ] T001 [P] Add `equipSlot` field to ItemSchema in `shared/schemas/items.ts`
- [ ] T002 [P] Add `allowedClasses` field to SkillDefinitionSchema in `shared/schemas/skills.ts`
- [ ] T003 [P] Add `skillLevels` map to PlayerStateSchema in `shared/schemas/gameState.ts`
- [ ] T004 [P] Add `equipStats` (str/agi/vit/int/dex/luk) to ItemSchema in `shared/schemas/items.ts`
- [ ] T005 [P] Add `equipSlot` values to all equip items in `shared/data/items.json`
- [ ] T006 [P] Add `allowedClasses` values to all skills in `shared/data/skills.json`

**Checkpoint**: Schemas and data updated — build must pass

---

## Phase 2: Foundational Bug Fixes (Blocking Prerequisites)

**Purpose**: Fix broken code that blocks correct behavior

- [ ] T007 Fix `processServerLevelUp` to read `player.stats` (not `player.stats?.base`) in `game-server/index.ts`
- [ ] T008 Fix client `handleLevelUp` to write `statPoints` (not `points`) in `store/useNetworkStore.ts`
- [ ] T009 Fix `changeJob` handler — accept `{ jobId }` matching client send OR fix client to send `{ newJob }` in `game-server/index.ts` and `store/useNetworkStore.ts`

**Checkpoint**: Core bugs fixed — fundamental calculations work correctly

---

## Phase 3: User Story 1 — Equip & Unequip Items (Priority: P1) 🎯 MVP

**Goal**: Players can equip/unequip items from inventory into 6 gear slots

**Independent Test**: A player with an `iron_sword` equips it to weapon slot,
sees it in the slot, and unequips it back to inventory.

- [ ] T010 [US1] Implement `equipItem` socket handler on server in `game-server/index.ts` (validate item exists in inventory, slot is valid, level requirement met)
- [ ] T011 [US1] Implement `unequipItem` socket handler on server in `game-server/index.ts` (move item back to inventory, clear slot)
- [ ] T012 [US1] Add socket event emitters for `equipItem`/`unequipItem` in `store/useNetworkStore.ts`
- [ ] T013 [US1] Fix `equipItem`/`unequipItem` in `store/useGameStore.ts` — replace stubs with actual state mutations
- [ ] T014 [US1] Fix slot assignment in `components/game/ui/EquipmentWindow.tsx` — use `item.equipSlot` instead of description heuristics

**Checkpoint**: Players can equip and unequip items with server validation

---

## Phase 4: User Story 2 — Equipment Stats Affect Character (Priority: P1)

**Goal**: Equipped gear changes combat stats and character sheet

**Independent Test**: A player with `chain_mail` (DEF:20) takes less damage
than with `cotton_shirt` (DEF:5) from the same enemy.

- [ ] T015 [US2] Compute total equipped stats (ATK, MATK, DEF, MDEF, stat bonuses) on server in `game-server/index.ts` and broadcast in snapshots
- [ ] T016 [US2] Apply equipment DEF/MDEF in damage formula in `game-server/index.ts` combat code (lines ~430-436)
- [ ] T017 [P] [US2] Fix `getEquippedStats` in `store/useGameStore.ts` to actually sum equipment bonuses (not just return bare `player.stats`)
- [ ] T018 [P] [US2] Update `components/game/ui/EquipmentWindow.tsx` to show real stat changes when equipping/unequipping
- [ ] T019 [P] [US2] Update `components/game/hud/PlayerFrame.tsx` to react to stat changes from equipment

**Checkpoint**: Gear choices materially affect gameplay

---

## Phase 5: User Story 3 — Job Change Grants Class Skills (Priority: P1)

**Goal**: Changing jobs gives the class starting skills automatically

**Independent Test**: Novice at job level 10 changes to Swordsman and
immediately has `bash` and `provoke` unlocked.

- [ ] T020 [US3] Update `changeJob` handler in `game-server/index.ts` to iterate `job.autoLearnSkills` and add to `player.unlockedSkills`
- [ ] T021 [US3] Add milestone stat bonuses — on level-up, check `baseLevel` against `milestoneLevels[]` and award `milestoneBonusPerStat` in `game-server/index.ts`

**Checkpoint**: Job change is meaningful — new class comes with identity and
bonuses

---

## Phase 6: User Story 4 — Skill Level Scaling (Priority: P2)

**Goal**: Players can invest multiple points in a skill for increased power

**Independent Test**: Player spends 2 more points on `bash` (level 1→3) and
deals more damage.

- [ ] T022 [US4] Track `skillLevels: Record<string, number>` on server — update on `unlockSkill` handler in `game-server/index.ts`
- [ ] T023 [US4] Modify `applyEffect` in `game-server/SkillEngine.ts` to scale effects by skill level using `levelScaling` formula
- [ ] T024 [US4] Update `SkillsWindow.tsx` in `components/game/ui/` to show current skill level and "MAX LEVEL" indicator
- [ ] T025 [US4] Add per-level skill point cost display in `components/game/ui/SkillsWindow.tsx`

**Checkpoint**: Specializing in a skill is rewarding — higher levels hit harder

---

## Phase 7: User Story 5 — Class-Restricted Skills (Priority: P2)

**Goal**: Skills are restricted to appropriate classes

**Independent Test**: A Mage cannot see or learn `bash` in the skill tree.

- [ ] T026 [US5] Validate `allowedClasses` in unlock handler on server in `game-server/index.ts`
- [ ] T027 [US5] Validate `allowedClasses` in `skillCast` handler on server in `game-server/index.ts`
- [ ] T028 [US5] Filter skill tree display in `components/game/ui/SkillsWindow.tsx` — show locked skills with class requirement badge

**Checkpoint**: Class identity is preserved — Mages can't sword-bash

---

## Phase 8: User Story 6 — Stat Allocation Sync (Priority: P2)

**Goal**: Stat allocation is server-authoritative with milestone bonuses

**Independent Test**: Player at level 10 receives 2 bonus stat points per stat.

- [ ] T029 [US6] Add server-side validation for `allocateStat` handler in `game-server/index.ts` — check `statPoints > 0` and `stat < 99`
- [ ] T030 [US6] Add milestone level-up bonus logic in `game-server/index.ts` (using `balance.json` milestone data)

**Checkpoint**: Stats are consistent between client and server

---

## Phase 9: Polish & Verification

**Purpose**: End-to-end validation that everything works together

- [ ] T031 Run `npm run build` and verify zero errors
- [ ] T032 Verify combat still works with new equipment stat calculations
- [ ] T033 Verify skill unlock flow with class restrictions + level scaling
- [ ] T034 Verify job change auto-learn + milestone bonuses

---

## Implementation Strategy

### MVP First (Phases 1-4)

1. Phase 1: Schema & data updates (no behavior change — build safe)
2. Phase 2: Bug fixes (critical — fixes broken calculations)
3. Phase 3: Equip/unequip (US1) — first playable gear system
4. Phase 4: Equipment stats (US2) — gear matters in combat
5. **STOP**: Validate — equip items, see stats change, fight enemies

### Incremental Delivery

1. Phases 1-4 → Equipment is functional (MVP)
2. Phase 5 → Job change is complete (auto-learn skills + milestone bonuses)
3. Phases 6-7 → Skills have depth (scaling + class restrictions)
4. Phase 8 → Stats are fully synced
5. Phase 9 → Polish and verify

### Parallel Opportunities

- All Phase 1 tasks (T001-T006) marked [P] can run in parallel
- Phase 6 (T022-T025) and Phase 3 (T010-T014) touch different files — can be parallelized if needed
- T017 and T018 in Phase 4 are independent UI tasks

---

## Dependencies

- **Phase 1**: No dependencies — start here
- **Phase 2**: Depends on Phase 1
- **Phase 3 (US1)**: Depends on Phase 1+2
- **Phase 4 (US2)**: Depends on Phase 3 (items must be equippable before stats apply)
- **Phase 5 (US3)**: Depends on Phase 1+2 (mostly independent of US1/US2)
- **Phase 6 (US4)**: Depends on Phase 1+2
- **Phase 7 (US5)**: Depends on Phase 6 (class restrictions need level scaling)
- **Phase 8 (US6)**: Depends on Phase 1+2
- **Phase 9 (Polish)**: Depends on all phases
