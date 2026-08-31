# 10 — Tile art: what WorldBox actually draws, measured

Written after the owner said: *"I am not liking the map, it doesn't look real —
when you zoom in it looks like square boxes. WorldBox looks amazing."*

That complaint was exact, and this document is the answer to it. Everything
below is **measured from decoded sprites**, not read from a wiki table — because
the wiki's own palette table disagrees with the art in 53% of cases (38 of 72
checked). Sample the art, never the table.

## Method

`WebFetch` is blocked on this wiki (HTTP 402), so assets came through the
MediaWiki API with curl. The wiki serves **lossless WebP** regardless of the
`.png` extension, which matters: colours are bit-exact, not re-encoded.
Converted with `sips`, then decoded with a hand-written PNG decoder (zlib plus
all five filter types).

- **256 tile files fetched, 256 decoded, zero failures.**
- Every file is 80×80. Every 10×10 block within them is a **single uniform
  colour** — the upload is pure nearest-neighbour, so the native grid is exactly
  **8×8** and every hex below is the exact game pixel.
- Also decoded: wall sheets, border/seam tiles, and a creature icon.

---

## 1. The shape — this is the "square boxes" answer

**230 of 255 8×8 tiles share one identical alpha mask, pixel for pixel:**

```
........      row 0: empty
..####..      row 1: x=2..5
.######.      row 2: x=1..6
.######.      row 3: x=1..6
.######.      row 4: x=1..6
.######.      row 5: x=1..6
..####..      row 6: x=2..5
........      row 7: empty
```

32 opaque pixels of 64 — **exactly 50%**. An octagonal blob: a 6-wide core with
a 4-wide cap top and bottom. **Rows 0 and 7 and columns 0 and 7 are never
painted.** WorldBox never draws a full square. Not once, in 230 tiles.

**Anti-aliasing: none, anywhere.** Alpha is binary `{0, 255}` across all 256
files, with two exceptions that are both hard drop shadows.

**Outlines: none, ever.** Zero of 89 fully-decoded sprites has an outline.
Silhouettes read from the blob shape and the internal ramp alone.

**Tiling.** Stamping the mask on a lattice and counting holes:

| pitch | holes |
|---|---|
| 4 px | **0 / 64** |
| 5 px | 4 / 100 |
| 6 px | 16 / 144 |
| 8 px | 128 / 256 |

The only hole-free pitch is 4 px — the sprite is drawn oversize and overlaps its
neighbours by 2 px a side. *(A base-colour fill layer underneath with an 8 px
pitch is also consistent with the mask alone; I could not distinguish the two.)*
Either way **the transparent ring is an interlock allowance, not decoration.**

### What we did about it

Our tiles are opaque 3D boxes, so we cannot interlock or leave holes. Two
changes carried the intent instead:

1. **Flattened the relief.** Ours was 0.6 on a 0.5-unit tile — a field stood
   0.44 tall, very nearly a cube. Now `height^1.9 × 0.55`, so plains sit at 0.16
   and peaks still reach 0.65. A uniform reduction would have flattened the
   mountains too.
2. **Cut the corners and darkened the sides** in the fragment shader, so a tile
   reads as a slab rather than a block.

---

## 2. Colour inside one tile

| Rule | Measured |
|---|---|
| Colours per tile | median **4** — 3 interior shades + 1 edge |
| Step between adjacent shades | median **5.6%** luminance (p25 3.4%, p75 9.5%) |
| Total interior spread | median **6.9%**, never past ~12% |
| Shade distribution | **11 / 11 / 6** of 28 interior pixels — *not* an even third each |
| Bottom edge | **13% darker** than the dominant shade (p25 5.9%, p75 17.2%) |
| Edge exclusivity | that shade appears nowhere else, in 71% of clean tiles |

Shades are derived by **dropping V about 3.5% per step**, not by multiplying
RGB, with hue drift up to 10° and saturation moving ±8%. Measured examples:
Grass High `dH −1.8, dS −0.9, dV −10.2` top to bottom; Savanna High `dH +1.3,
dS +8.6, dV −22.7`. Pure-neutral steps only for grey rock.

**Grass High and Grass Low are the same noise arrangement, letter for letter,
in all three variants** — only the palette is swapped. Variants are re-dithers,
never re-shapes.

```
=== TileGrassHigh10x0        === TileGrassHigh10x1        === TileGrassHigh10x2
    ........                     ........                     ........
    ..DBCC..                     ..BDBB..                     ..CCBC..
    .CBDCBD.                     .DCBCCD.                     .DDCDCD.
    .DBCBCB.                     .BCBCDB.                     .BDCCCB.
    .CCCBCB.                     .CBDCBD.                     .CDDCCD.
    .BBCDDB.                     .DDDBCD.                     .DBCBDD.
    ..EEEE..                     ..EEEE..                     ..EEEE..
    ........                     ........                     ........
    B #589038  C #558733  D #527e33  E #4b762f   (identical palette, all three)
```

**Detail falls away with depth**, which is the single most transferable rule
here:

| | shades | mottled pixels | bottom edge |
|---|---|---|---|
| Shallow water | 4 | 22 of 28 | yes |
| Close ocean | 4 | 2 of 28 | yes |
| Deep ocean | **1** | 0 | **none** |

**Emissive tiles invert the edge** — Lava0's bottom strip is 73% *brighter* than
its body (`#F62D14` body, `#FFAC00` strip).

**About one ground tile in four** carries 2–4 off-hue pixels. Their flower tiles
are literally the plain tile with pixels stamped over it:
`TileLightFlower10x0`'s base shades are byte-identical to `TileGrassLow10x0`'s.

---

## 3. Coastlines

Their coast is **a whole-tile depth ramp, not a set of transition sprites**:
land → sand → shallow `#55AEF0` → close `#4084E2` → deep `#3370CC`, enforced
monotonic. Measured **28 deep/shallow contacts against 355 close/shallow and
323 close/deep**.

**Sand is 45% of all land/water contacts** — the single most common adjacency on
the sampled map.

They ship exactly **one** foam sprite and **one** run-up sprite — not 16, not
47. Both are the blob minus its top row, a single flat colour, zero mottle.

---

## 4. Elevation

Encoded as **silhouette height inside the same 8×8 box**, not as a drawn cube:

| | rows |
|---|---|
| Flat | 1–6 (6 px) |
| Hills | 1–7 or 2–7 (7 px) |
| Mountains, summits | 0–7 (8 px), overhanging into the cells above and below |

Summits get a **ragged, non-convex** outline with one or two holes. Snow reuses
rock colours verbatim — `TileSnowHills` rows 5–7 are byte-identical to
`TileHills`'s two darkest shades. Only the top face is repainted.

---

## 5. Palette budget

92 distinct base hexes for ~27 biome pairs:

> 21 greens · 17 oranges/browns · 14 greys · 10 reds · 9 blues · 7 yellows ·
> 6 violets · 5 cyans · 4 pinks

Greens span hue 71°–158°. That is the axis to subdivide finely.

Shadows are pure `#000000` at **39–47% alpha**, hard-edged, offset +1px.

---

## 6. What we implemented, and what we deliberately did not

**Done** (`29bc806`, `1c9a99f`):

- Flattened relief through a power curve.
- 8×8 procedural grain, three shades ~3% apart, distributed 39/39/22.
- Cut corners; sides darkened to read as thickness.
- Grain scaled by water depth — deep ocean is flat.
- Off-hue pixels on ~1 tile in 4.
- The monotonic coastline ramp, verified at 0 deep/land and 0 deep/shallow
  contacts.
- Waterline-only edge, from a per-instance bitfield of which sides face sea.

**Deliberately not done:**

- **The universal dark bottom edge on every tile.** It is right for their
  geometry, where overlapping sprites hide most of it. On adjacent opaque boxes
  viewed at an angle it draws a visible line under every tile — a grid. Our
  darkened box *sides* already carry the slab read.
- **A texture atlas.** The grain is generated per fragment, so there is no atlas
  to author or manage and it covers all 28 biomes automatically.
- **Going 2D.** The 3D camera is doing real work — it is how the map reads as a
  place you are above. The box-ness was relief and flat colour, both fixable
  without abandoning it.

**Still open:** hue drift within the shade steps (we multiply RGB, they step V
with hue drift); the ragged summit outline; emissive inverted edges for lava.
