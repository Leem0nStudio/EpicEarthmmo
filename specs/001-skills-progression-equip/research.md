# Research: Skills, Progression & Equipment Overhaul

## 1. Equipment Slot Assignment

**Decision**: Add `equipSlot` field to item schema instead of heuristic matching

**Rationale**: Current description-keyword heuristic is fragile (silver_tiara
→ armor instead of headTop). A deterministic field in the data is cleaner,
self-documenting, and validated by Zod.

**Slots**: `weapon | armor | shield | headTop | shoes | accessory1 | accessory2`

**Backward compatibility**: Items without `equipSlot` default to `null` and the
UI prompts for slot selection (edge case for custom items).

## 2. Skill Level Scaling

**Decision**: Store `skillLevels: Record<string, number>` in player state

**Rationale**: The existing `levelScaling` schema in skills.json has formula
types (flat, multiplier, stat_based) but was never wired. Adding the level map
to player state and `applyEffect` to scale by level is the minimal change.

**Formula resolution**: For each effect in the skill, multiply base values by
`1 + (level - 1) * scalingPerLevel` where `scalingPerLevel` is read from
`levelScaling` config.

## 3. Class Restrictions

**Decision**: Add `allowedClasses: string[]` (optional) to SkillDefinition

**Rationale**: Optional field — when absent, all classes can learn it
(basic_attack, teleport). When present, both client UI (filter display) and
server (validate unlock/cast) enforce it.

## 4. Job Change Auto-Learn

**Decision**: On `changeJob`, server iterates `job.autoLearnSkills` and adds to
`player.unlockedSkills`

**Rationale**: Data already exists in jobs.json. The server just needs to
apply it after clearing/merging existing skills.

## 5. Stat Allocation Fix

**Decision**: Server validates `player.stats.statPoints > 0` before allowing
allocation. Client uses server snapshot for reconciliation.

**Rationale**: Current client does optimistic allocation + separate server
handler. Adding server-side validation is straightforward. The snapshot already
broadcasts stats — client just needs to trust it.

**Bug fix required**: `processServerLevelUp` references `player.stats?.base`
which doesn't exist — should read `player.stats` directly. Client
`handleLevelUp` writes to `points` not `statPoints`.

## 6. Milestone Bonuses

**Decision**: On level-up, if `baseLevel` is in `milestoneLevels[]`, add
`milestoneBonusPerStat` to each stat.

**Rationale**: Data exists in balance.json. Minimal server-side check in the
level-up flow.
