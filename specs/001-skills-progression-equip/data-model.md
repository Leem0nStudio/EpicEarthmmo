# Data Model Changes

## Item Schema (`shared/schemas/items.ts`)

```typescript
// ADD to ItemSchema:
equipSlot: z.enum(['weapon','armor','shield','headTop','shoes','accessory1','accessory2']).optional(),
// ADD to equipStats:
equipStats: z.object({
  str: z.number().optional(),
  agi: z.number().optional(),
  vit: z.number().optional(),
  int: z.number().optional(),
  dex: z.number().optional(),
  luk: z.number().optional(),
}).optional(),
```

## Skill Schema (`shared/schemas/skills.ts`)

```typescript
// ADD to SkillDefinitionSchema:
allowedClasses: z.array(z.string()).optional(),
```

## PlayerState (`shared/schemas/gameState.ts`)

```typescript
// ADD to PlayerStateSchema:
skillLevels: z.record(z.string(), z.number()).optional().default({}),
```

## ServerPlayer (`game-server/types.ts`)

```typescript
// PlayerState already has skillLevels via shared schema
// No additional server-side type changes needed beyond what shared schema provides
```

## Item Data Changes (`shared/data/items.json`)

Every equip-type item gets an `equipSlot`:
- iron_sword, steel_sword → `weapon`
- magic_staff → `weapon`
- cotton_shirt, chain_mail → `armor`
- wooden_shield, iron_shield → `shield`
- silver_tiara → `headTop`
- leather_boots, steel_boots → `shoes`
- gold_ring → `accessory1`

## Skill Data Changes (`shared/data/skills.json`)

Every skill gets an `allowedClasses`:
- bash, provoke, magnum_break, bowling_bash, berserk, cone_attack, endure → `['swordsman']`
- lightning_bolt, chain_lightning, fire_bolt, cold_bolt, fire_wall → `['mage']`
- heal, increase_agi, blessing, safety_wall → `['acolyte']`
- poison, steal → `['thief']`
- arrow_shower, improved_concentration → ['archer']
- cart_revolution → ['merchant']
- basic_attack, teleport, frost_diver, meteor → no restriction (available to all)
