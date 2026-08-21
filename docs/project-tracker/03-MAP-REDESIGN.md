# 03 — Map Redesign: From Heavy 3D Boxes to a Light WorldBox-Style Map

## The problem (user feedback: "the world map looks too heavy")

The current map is **16,384 individual `THREE.BoxGeometry` meshes** (128×128), each with its **own material**, tall extruded columns (height multiplier 3.0), casting/receiving real-time shadows from a 2048×2048 shadow map.

Why that's wrong for this game:

| Issue | Impact |
|---|---|
| 16k meshes = 16k draw calls (no instancing) | GPU-bound; large maps (256² = 65k meshes) would be unplayable |
| 16k materials | Memory waste; recoloring the world per time-of-day touches every material |
| Tall 3D columns | Visually noisy "cliff walls" everywhere; hides creatures behind terrain; reads as Minecraft-lite rather than a god-sim map |
| Real-time shadows on everything | Expensive and adds gloom without readability |
| Perspective camera at low angle | Emphasizes the walls; the player fights the camera to see the world |

WorldBox proves the genre wants the opposite: a **flat, top-down, readable pixel map** where color = biome, mountains are sprites/tiles not geometry, and the creatures are the stars.

## Target look

- Nearly-flat tiles: subtle height offsets only (water slightly sunken, mountains slightly raised — enough for depth cues, ~0.15–0.5 units max instead of 0–3).
- Camera default: high angle (~60–75° pitch) looking down; MapControls-style pan; zoom range tuned so the whole map fits at max zoom-out.
- Color does the work: 3–4 shade variations per biome so plains aren't uniform; beaches ring the water; mountains get a rocky cap color + snow tops.
- Details as sprites, not geometry: trees, rocks, structures drawn as small billboards on top of flat tiles (like creatures already are).
- Soft blob shadows or none; keep the directional light for tint only, `castShadow` off.

## The implementation plan (in order)

### Step 1 — Merge terrain into a handful of meshes (the big win)
Replace per-tile meshes with **one `THREE.InstancedMesh` per world** (or one per 64×64 chunk for partial updates):
- Shared `BoxGeometry(TILE_SIZE, 1, TILE_SIZE)`; per-instance matrix sets position + Y scale (height).
- Per-instance color via `instanceColor` (`setColorAt` + `needsUpdate`).
- Raycast: `intersectObject(instancedMesh)` returns `instanceId` → `tileX = id / mapSize | 0`, `tileY = id % mapSize`. Simpler and faster than 16k object raycasts.
- Tile mutations (terraform/fire/recolor): `setMatrixAt`/`setColorAt` for that instance only, flag `instanceMatrix.needsUpdate`.
- Expected result: 16,384 draw calls → **1–4 draw calls**; large maps become viable; time-of-day recolor = one buffer update loop.
- Files: `worldGenerator.ts` (return instanced mesh + tile data without per-tile `mesh` refs), `useGameEngine.ts` (raycast by instanceId; `updateTileHeight`/`updateTileAppearance` via setMatrixAt/setColorAt), `Tile` type (replace `mesh?` with `instanceId?`).

### Step 2 — Flatten the profile
- `BASE_TILE_SCALED_HEIGHT_MULTIPLIER`: 3.0 → **0.6**; water tiles sit at fixed low height; land ~0.3–0.5; mountains cap ~0.9.
- Keep raw `height` 0–1 untouched (simulation/pathfinding unaffected) — only the *visual* scale changes.
- Entities' Y position already reads `tile.scaledHeight`, so they follow automatically.

### Step 3 — Camera & controls for a map feel
- Default polar angle ~0.35 rad from vertical, `maxPolarAngle` ~65°, raise `minDistance`/`maxDistance` for map-scale zoom.
- Optional: switch OrbitControls → MapControls (drei) for pan-first behavior.

### Step 4 — Kill expensive lighting
- `castShadow`/`receiveShadow` off on terrain instances; remove the shadow ground plane; drop shadow map to 1024 or disable `Canvas shadows` entirely.
- Ambient + directional tint stays (day/night mood already lerps sky/fog).

### Step 5 — Tile color variation + biome detail sprites
- In `getBiomeColor`, jitter lightness ±4% seeded by tile coords (deterministic).
- Spawn tree/rock sprites (reuse pixel-sprite technique) on forest/mountain tiles at ~30% density, stored in one `THREE.Group` per world, disposed on reset.

### Step 6 — Minimap (borrowed straight from WorldBox)
- Render tile colors once into a `<canvas>` (1 px per tile) in a corner HUD panel; redraw only dirtied tiles (fires, terraform, curses).
- Click-to-jump camera. Later: overlay entity dots and kingdom borders.

## Acceptance criteria

- 128×128 world renders in ≤5 draw calls for terrain.
- Stable 60 fps with 200+ entities on a mid laptop.
- Whole map readable at max zoom-out; creatures visible against terrain at mid zoom.
- All existing tools (raise/lower/water/fire/meteor/…) still work through the instanced path.
- Tests stay green; add a test for instanceId ↔ tile coordinate mapping.
