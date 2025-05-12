# Entity Sprite System

This directory contains sprite images for the entity system in Project Aetheria.

## File Structure

- `/human.png` - Human character sprites (WIP)
- `/elf.png` - Elf character sprites (WIP)
- `/wolf.png` - Wolf character sprites (WIP)
- `/deer.png` - Deer character sprites (WIP)
- `/rabbit.png` - Rabbit character sprites (WIP)

## Sprite Sheet Format

Each entity sprite sheet is organized as follows:

- **Grid Format**: 4x4 grid (16 frames total)
- **Resolution**: Each frame is 16x16 pixels
- **Pixel Scale**: 1 pixel = 1 unit in the game world
- **Animation Row Layout**:
  - Row 1: Idle animation (frames 0-3)
  - Row 2: Movement animation (frames 4-7)
  - Row 3: Action animation (attacking/gathering) (frames 8-11)
  - Row 4: Status animation (hurt/dying) (frames 12-15)

## Implementation Notes

1. All sprites should use a consistent color palette for the pixelated aesthetic.
2. Transparent background is required (PNG format with alpha channel).
3. Sprites are currently loaded as base64-encoded strings in `entitySprites.ts` but will be replaced with actual PNG files in this directory.
4. Billboard rendering ensures sprites always face the camera.

## Usage

Sprites are automatically assigned to entities based on their type in the `createEntityMesh()` function.

The `spriteHandler.ts` utility manages:
- Loading sprite textures
- Animating sprite frames
- Flipping sprites based on movement direction
- Visual effects for entity states (wounded, attacking, etc.)

## Future Improvements

- Add more animation frames for smoother movement
- Create variations for different seasons/biomes
- Implement equipment and clothing variations
- Add particle effects for status conditions
