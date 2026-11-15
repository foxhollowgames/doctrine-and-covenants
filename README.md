# D&C Wayfinder

D&C Wayfinder is a local, map-first study guide to the Doctrine and Covenants of The Church of Jesus Christ of Latter-day Saints. It is built from the Bible Wayfinder reader and keeps its design: the text on one side, a real map on the other, and separate **Historical** and **LDS** study perspectives.

## Run it

Node.js is required. Nothing needs installing.

- Double-click **Start DC Wayfinder.cmd**, or run `npm start` in this folder.
- Open <http://127.0.0.1:4173> and keep the server window open.

## What is in it

- **All 138 sections** (3,654 verses). The home page lists them by number or by date, with a search box.
- For each section:
  - **Setting:** who, when, where, and why, from the official section heading and the Joseph Smith Papers historical introduction, in our own words.
  - **Summary** of what the section says, in order.
  - **Close reading** of one key verse, with verse references.
  - **LDS lens** (LDS mode): the matching 2025 *Come, Follow Me* lesson and a study question.
  - **Map:** where it was received and the places it names, plus any journey tied to it.
- **114 people** with short profiles. Names in the text link to them.
- **45 glossary terms**, such as Zion, stake, keys, and consecration. These words link from the text.
- **17 journeys**, including the Lamanite mission, Zion's Camp, Liberty Jail, and the trek west.
- **12 historical areas** in the Nations layer: states, territories, Upper Canada, and Mexico.
- **6 guided studies**. Open them from the menu.
- **Map mode** has a month-by-month timeline from 1823 to 1847.
- **Official Declarations 1 and 2** open from the home page as summaries, with links to the official text.

## Sources and rights

- **Verse text:** [Scriptures in JSON](https://github.com/bcbooks/scriptures-json) (public domain dedication; 2013 edition wording). Section headings, footnotes, and introductions belong to Intellectual Reserve, Inc. They are linked, not copied.
- **History:** official section pages and the *Chronological Order of Contents* on churchofjesuschrist.org. Also the [Joseph Smith Papers](https://www.josephsmithpapers.org/) historical introductions. 134 of 138 sections link their JSP document.
- **LDS lens:** *Come, Follow Me — For Home and Church: Doctrine and Covenants 2025*.
- **Map:** Natural Earth 1:10m land, lakes, rivers, and state outlines (public domain). Place coordinates were compiled for this guide and are approximate.

## How the content was made and checked

Each section was written against its full text, its official heading, and its JSP introduction. Then a separate fact-check pass reviewed every section against the same sources. Logs are in `content/review/`. That pass changed 64 of the 140 items it reviewed (138 sections plus the two declarations), counting minor wording fixes. The fixes were mostly wrong verse citations, overstated history, supernatural claims not attributed to the text, and loose descriptions of *Come, Follow Me* lessons. Each file's `reviewNote` records what was read and changed. This is careful work, but it is not a published scholarly edition; see "Known gaps."

## Edit and rebuild

| What | Where |
| --- | --- |
| Section studies | `content/sections/NNN.json` (and `od1.json`, `od2.json`) |
| People | `content/people/<id>.json` |
| Places | `content/places-base.json`, `content/places-extra.json` |
| Journeys | `content/routes.json` |
| Glossary | `content/glossary.json` |
| Guides | `content/guides.json` |
| Lessons | `content/cfm-2025.json` |

Rules for writers are in `content/WRITER-BRIEF.md`.

After editing:

```text
python3 scripts/build.py      # writes dist/data/... and dist/doctrine-and-covenants.html
npm run check                 # section checker + data integrity check
```

`scripts/prepare_geo.py` rebuilds rivers and state outlines from a Natural Earth download.

## Changes to the shared reader

The reader (`dist/app.js` and friends) is the Bible Wayfinder reader. Differences between books live in data, not in code. The new book settings are listed in `DATA-CONTRACT.md`. They are unit label, map area, month timeline, scripture link template, water labels, relief on/off, a hidden Hebrew/Greek panel, and a portrait note. The reader also gained:

- a **Setting** paragraph;
- case-sensitive glossary links;
- per-name link scopes for shared first names;
- extra label positions on the map;
- new journey kinds;
- a **study guides** button in the menu.

The Bible books still work with this reader unchanged.

## Known gaps

- **Portraits for 54 of 114 people.** They are public-domain images from Wikimedia Commons, listed with credits in `content/art.json`. The other people show as initials. `scripts/fetch_art.py` downloads the images.
- **No map relief yet.** The terrain shading layer is off.
- **Approximate places and journeys.** Coordinates are approximate, and journeys join named stops with straight lines.
- **People profiles were checked against JSP person pages** where they loaded. Some minor figures have uncertain dates, and their `reviewNote` says so.
- **Jerusalem is not mapped.** It is named in sections 45, 77, and 133, but it is outside the map.
- **No public URL yet.** A GitHub Pages workflow is included, matching Bible Wayfinder. It publishes `dist` on push to `main` once a repository exists.

## Optional analytics

The consent-gated analytics source is in the hub repository at viewer/analytics.js. Run npm run sync-analytics there to update the module and persistent HTML templates. Run this volume's HTML generator after changing book.html. Analytics choices lets visitors accept, decline, or withdraw. Only broad site sections are reported, not chapter or search state. See the hub README for privacy settings and verification instructions.
