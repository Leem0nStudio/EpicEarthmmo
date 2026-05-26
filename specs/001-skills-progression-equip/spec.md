# Feature Specification: Skills, Progression & Equipment Overhaul

**Feature Branch**: `001-skills-progression-equip`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "mejorar o cambiar el sistema actual de skills y habilidades, progreso del personaje y equipamiento. usando la ui actual"

## User Scenarios & Testing

### User Story 1 - Equip and Unequip Items (Priority: P1)

As a player, I want to equip weapons, armor, shields, headgear, shoes, and
accessories from my inventory into dedicated slots, and unequip them back, so
that my character's stats and appearance reflect my gear choices.

**Why this priority**: Equipment is completely non-functional (equip/unequip are
no-ops, server ignores all gear except a basic weapon ATK lookup). This is the
foundation that everything else builds on.

**Independent Test**: A player with an `iron_sword` in inventory can equip it to
the weapon slot, see their ATK increase in the stats panel, and unequip it back
to inventory.

**Acceptance Scenarios**:

1. **Given** a player has an `iron_sword` in inventory, **When** they click the
   item and select "Equip", **Then** the sword appears in the weapon slot and
   is removed from the inventory list.
2. **Given** a player has a weapon equipped, **When** they click the equipped
   slot and select "Unequip", **Then** the weapon returns to inventory and the
   slot shows empty.
3. **Given** a player equips an item requiring level 30, **When** they are level
   15, **Then** the game prevents equipping and shows a "Requires Level 30"
   message.

---

### User Story 2 - Equipment Stats Affect Character (Priority: P1)

As a player, I want equipped gear to actually change my stats (ATK from weapons,
DEF from armor, MATK from staves, stat bonuses from accessories) so that gear
choices matter for combat effectiveness.

**Why this priority**: Currently only the highest weapon ATK is used in damage
calculations. Armor DEF, shield DEF, headgear MDEF, and stat bonuses from
accessories are ignored. Without this, the equipment system has no gameplay
purpose.

**Independent Test**: A player wearing `chain_mail` (DEF:20) takes less damage
from the same enemy than when wearing `cotton_shirt` (DEF:5).

**Acceptance Scenarios**:

1. **Given** a player wears `iron_sword` (ATK:12), **When** they attack an
   enemy, **Then** the damage formula includes the weapon's ATK value.
2. **Given** a player wears `chain_mail` (DEF:20), **When** they are hit by an
   enemy, **Then** the damage formula reduces incoming damage by DEF.
3. **Given** a player wears `gold_ring` (+3 LUK), **When** they view their
   stats panel, **Then** LUK shows the bonus included.

---

### User Story 3 - Job Change Grants Class Skills (Priority: P1)

As a player, when I change jobs from Novice to Swordsman, I want to
automatically receive the class's starting skills (bash, provoke) so that I can
immediately play as my chosen class.

**Why this priority**: `autoLearnSkills` exists in the job data but is never
applied. New Swordmen have zero skills and cannot play their class until
manually unlocking skills — which is incorrect for class identity.

**Independent Test**: A Novice at job level 10+ changes to Swordsman and
immediately sees `bash` and `provoke` in their unlocked skills without spending
skill points.

**Acceptance Scenarios**:

1. **Given** a Novice with jobLevel >= 10, **When** they change to Swordsman,
   **Then** their unlocked skills include `bash` and `provoke`.
2. **Given** a player changes job, **When** the server processes the change,
   **Then** `autoLearnSkills` from the new job definition are granted in
   addition to any existing skills.
3. **Given** a Mage with `lightning_bolt` unlocked, **When** they change to
   Wizard (future job), **Then** they retain `lightning_bolt` plus gain the new
   job's auto-learn skills.

---

### User Story 4 - Skill Level Scaling (Priority: P2)

As a player, I want to invest multiple skill points into a single skill to
increase its power, so that specializing in a skill is rewarding.

**Why this priority**: Skills have `maxLevel` up to 10 and `levelScaling`
schemas exist, but all skills are single-unlock only. This adds meaningful
progression within each skill.

**Independent Test**: A player with `bash` at level 1 deals less damage than
after investing 3 more points to reach level 3.

**Acceptance Scenarios**:

1. **Given** a player has `bash` unlocked at level 1, **When** they spend an
   additional skill point on it, **Then** `bash` becomes level 2 and its damage
   increases per the scaling formula.
2. **Given** a skill at max level, **When** the player tries to invest more
   points, **Then** the UI shows "MAX LEVEL" and prevents further investment.
3. **Given** the `skillPointCost` is 1 per level for `bash`, **When** the
   player levels it from 1 to 2, **Then** they spend 1 skill point.

---

### User Story 5 - Class-Restricted Skills (Priority: P2)

As a player, I want skills to be restricted to appropriate classes so that each
class has a unique identity and balance is maintained.

**Why this priority**: Currently any player can learn any skill regardless of
class. An Archer could learn `meteor` or a Mage could learn `bowling_bash`.
This breaks class identity.

**Independent Test**: A Mage cannot see or learn Swordsman-only skills in the
skill tree.

**Acceptance Scenarios**:

1. **Given** a Mage opens the skill tree, **When** they view available skills,
   **Then** Swordsman-only skills (bash, provoke, magnum_break, etc.) are not
   shown or are shown as locked with a class requirement indicator.
2. **Given** a Swordsman tries to learn `lightning_bolt`, **When** the server
   validates the request, **Then** it rejects with "Class cannot learn this
   skill".
3. **Given** the skill definition has an `allowedClasses` field, **When** it is
   empty or missing, **Then** the skill is available to all classes
   (basic_attack, teleport).

---

### User Story 6 - Stat Allocation Sync and Milestone Bonuses (Priority: P2)

As a player, I want stat points I allocate to be consistent between client and
server, and receive bonus stat points at milestone levels.

**Why this priority**: Client does optimistic stat allocation but server doesn't
authoritatively validate. Milestone bonuses exist in balance.json but are never
awarded.

**Independent Test**: A player at level 10 receives 2 bonus points per stat and
the server enforces the stat cap of 99.

**Acceptance Scenarios**:

1. **Given** a player reaches base level 10, **When** they level up, **Then**
   they receive an additional 2 points to each stat (milestone bonus).
2. **Given** a player has 99 STR, **When** they try to allocate more, **Then**
   the UI shows the stat as capped and the server rejects any attempt.
3. **Given** a player allocates stat points, **When** the server snapshot
   arrives, **Then** the client stats match the server-authoritative values.

---

### User Story 7 - Proper Equipment Slot Assignment (Priority: P3)

As a player, I want items to automatically go to the correct equipment slot so
that equipping is intuitive and predictable.

**Why this priority**: Currently slot assignment is heuristic based on
description text keywords, which is fragile. `silver_tiara` would be
misidentified as armor instead of headgear.

**Independent Test**: Equipping `silver_tiara` places it in the headgear slot,
not armor.

**Acceptance Scenarios**:

1. **Given** a player equips `silver_tiara`, **When** the item is equipped,
   **Then** it goes to the `headTop` slot (not `armor`).
2. **Given** a player equips `leather_boots`, **When** the item is equipped,
   **Then** it goes to the `shoes` slot.
3. **Given** an item's `type` is `equip` but has no explicit slot mapping,
   **When** the player tries to equip it, **Then** the UI prompts the player
   to choose a slot.

---

### User Story 8 - Level-Up HP/SP Correctly Computed (Priority: P2)

As a player, I want to receive the correct amount of HP and SP when leveling up
based on my class and VIT/INT stats, so that tank characters feel tankier.

**Why this priority**: `processServerLevelUp` passes `player.stats?.base ?? {}`
which doesn't exist — the field is `player.stats` directly. This means VIT/INT
bonuses never apply, and HP/SP gains are always the base class values.

**Independent Test**: A Swordsman with 50 VIT gains more HP on level-up than a
Swordsman with 10 VIT.

**Acceptance Scenarios**:

1. **Given** a Swordsman with 50 VIT levels up, **When** the server processes
   the level-up, **Then** the HP gain includes VIT-based bonus.
2. **Given** a Mage with 50 INT levels up, **When** the server processes the
   level-up, **Then** the SP gain includes INT-based bonus.
3. **Given** any player levels up, **When** the `levelUp` event fires,
   **Then** `statPoints` field is correctly incremented (not `points`).

### Edge Cases

- What happens when a player tries to equip an item already equipped in a
  different slot? (e.g., two `gold_ring`s for two accessory slots)
- How does the system handle a skill with no `allowedClasses` field? Should be
  available to all by default.
- What happens when skill points are spent on a skill that is later locked by a
  job change? Skills should be retained but the new job restrictions apply to
  new unlocks.
- What happens when stat allocation is attempted during combat? Should be
  allowed since it's out-of-combat by nature of the UI flow.
- What happens when both `baseLevel` and `jobLevel` cap are reached? EXP should
  still be tracked but not consumed, with a UI indicator.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow equipping items from inventory into 6 defined
  slots (weapon, armor, shield, headTop, shoes, accessory1) and unequipping
  them back.
- **FR-002**: Server MUST validate equipment changes authoritatively (item
  exists in inventory, no level requirement violation, slot is correct).
- **FR-003**: Equipment stat bonuses (ATK, MATK, DEF, MDEF, STR, AGI, VIT, INT,
  DEX, LUK) MUST be factored into server-side combat calculations.
- **FR-004**: Server MUST auto-grant `autoLearnSkills` from job definition when
  player changes job.
- **FR-005**: Skills MUST support level scaling (level 1 to maxLevel) with
  per-level stat increases via `levelScaling` formula.
- **FR-006**: Skills MUST have an `allowedClasses` field; server MUST validate
  class restriction before allowing unlock or cast.
- **FR-007**: Client MUST reflect the server's `skillLevels` (skill ID to level
  map) after any skill point investment.
- **FR-008**: Milestone stat bonuses (from balance.json milestoneLevels) MUST be
  awarded on reaching milestone base levels.
- **FR-009**: Server MUST authoritatively validate stat allocation (points
  available, stat cap 99) and reconcile any client mismatch via snapshots.
- **FR-010**: Items MUST have an `equipSlot` field in their schema to
  deterministically map to the correct equipment slot.
- **FR-011**: Server `processServerLevelUp` MUST correctly read `player.stats`
  (not `player.stats.base`) to compute VIT/INT bonuses for HP/SP.
- **FR-012**: Client `handleLevelUp` MUST write to `statPoints`, not `points`.
- **FR-013**: Server changeJob handler MUST accept `{ jobId }` matching what the
  client sends, or client MUST send `{ newJob }`.

### Key Entities

- **PlayerCharacter**: Has stats (STR/AGI/VIT/INT/DEX/LUK), levels (base/job),
  job class, unlocked skills with levels, inventory, equipped items, skill
  points, stat points.
- **Item**: Has type (usable/equip/misc), equipSlot (weapon/armor/shield/
  headTop/shoes/accessory1), stat bonuses, level requirement.
- **SkillDefinition**: Has allowedClasses, maxLevel, levelScaling formula,
  skillPointCost per level, requirements chain.
- **JobDefinition**: Has base stat modifiers, HP/SP per level, autoLearnSkills,
  passive ability.

## Assumptions

- The existing 6-slot equipment system is sufficient (no plans to add more
  slots in this iteration).
- Items without an `equipSlot` field default to a manual slot assignment
  through the UI.
- Skill point cost per level is equal to skillPointCost × targetLevel (or a
  flat cost per level as defined in the data).
- Class restrictions default to "all classes" when `allowedClasses` is not set.
- Milestone stat bonuses are awarded immediately on level-up, not retroactively.
- The existing socket event flow (client emit → server process → broadcast)
  remains unchanged.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Players can equip any item from inventory and see its stats
  reflected in combat within one game tick.
- **SC-002**: New job changers receive their class starting skills immediately
  without manual unlock.
- **SC-003**: Skill level scaling provides at least 10% power increase per level
  for damage skills.
- **SC-004**: Class restrictions prevent 100% of cross-class skill unlocks for
  restricted skills.
- **SC-005**: Server and client stat values match within 1 point 100% of the
  time after reconciliation.
