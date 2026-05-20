## 2026-05-20 - Decoration render subscription bottleneck
**Learning:** Static map decoration components were subscribing individually to game position state, causing a large number of unnecessary re-renders as the player moved.
**Action:** Keep decoration state derived from parent props and cull visibility in the parent LOD pass to reduce per-deco render overhead.
