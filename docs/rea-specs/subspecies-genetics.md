# Subspecies, Evolution and Genetics: Behaviour Spec

Clean-room behaviour description for re-implementation in TypeScript. Describes observable rules, formulas, thresholds and constants only. Ids (trait ids, gene ids) are kept verbatim; no source code and no in-game text are reproduced. Where the source is unclear this is stated as "UNCLEAR".

Conventions: "tick" = one simulation update; "world time" = in-game seconds; "month"/"year" as the game's calendar units (1 year = 12 months; see section 14 for how time units are used). "Rate" values are weights in a weighted draw (an item with weight 10 appears 10 times in a draw bag).

## Contents
1. Concepts and data model
2. Subspecies lifecycle (create, name, extinction, caps)
3. Evolution, mutation and uplift triggers
4. Trait system mechanics (add/remove, opposites, rarity, mutation pots)
5. Subspecies trait catalogue (every trait)
6. Genes, chromosomes, nucleus (structure, generation, synergy, stats)
7. Gene catalogue (every gene)
8. Gene mutation, unstable genome, gene editing
9. Phenotypes
10. Reproduction strategies and modes
11. Diet
12. How subspecies traits change creature behaviour
13. Sapience, uplift, loyalty / opinion effects
14. Open questions / UNCLEAR items
