# Shiyu Defense — Inter-Knot Brief

This repository builds a small, static brief for the current *Zenless Zone Zero* Shiyu Defense cycle. It shows what is active and what the player can exploit. Cycle-to-cycle comparisons are deferred until the site has enough reviewed history.

The first release shows the current cycle window, five frontiers, room affinities, enemy waves, calculated enemy HP, and the three current buffs. It does not include scoring advice, team recommendations, images, analytics, a client framework, or runtime plug-ins.

## Data status

The detailed encounter data comes from the community-maintained GPL-3.0 project [`spiritfxxxx/buhflipexplode`](https://github.com/spiritfxxxx/buhflipexplode). `data/current.json` records the exact source commit and paths. Enemy HP is calculated from that source. It is not an official published value.

The update script reads a local checkout. It does not fetch data at page load:

```bash
npm run update -- --source-root /path/to/buhflipexplode
```

The deployed workflow should check for a new record after the displayed cycle ends. Repeated checks during an active cycle are unnecessary.

## Local checks

```bash
npm install
npm run check
```

The asset check warns when the static shell exceeds 16 KiB raw or the complete transfer exceeds 10 KiB compressed. It fails at 24 KiB raw for the shell, 48 KiB raw for current data, or 16 KiB compressed in total. These limits protect fast mobile loading without forcing unclear abbreviations.

## Product boundary

`Inter-Knot Brief` is the planned parent entrypoint. Shiyu Defense and Deadly Assault are separate surfaces. This repository owns Shiyu Defense only and does not share its encounter schema or update logic with Deadly Assault.
