// Builds large card pools from Wikidata (CC0), ranked by how many Wikipedia languages cover
// each item, so the most widely recognized things rise to the top without hand picking.
//
// Usage: node scripts/build-wikidata-pools.mjs [category-id ...]
// Writes server/data/categories/<id>.json. Run with no args to rebuild every category.
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server/data/categories");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "HeadbandsCardPoolBuilder/1.0 (https://github.com/Nathan-Carpenter-Git; hobby project)";

const MAX_CARDS = 500;
const MIN_CARDS = 60;
const FETCH_LIMIT = 1400;

// kind "label": use the item's English label. kind "taxon": use its English common name.
// Patterns bind ?item. Deep patterns walk subclasses and cost more, so they use a higher floor.
const CATEGORIES = [
  // Nature. Taxonomy walks (animals, plants) time out on the public endpoint, so those
  // categories are written by hand instead.
  { id: "dog-breeds", name: "Dog Breeds", kind: "label", where: "?item wdt:P31 wd:Q39367", floor: 8 },
  { id: "cat-breeds", name: "Cat Breeds", kind: "label", where: "?item wdt:P31 wd:Q43577", floor: 8 },
  { id: "fruits", name: "Fruits", kind: "label", where: "?item wdt:P31 wd:Q3314483", floor: 8 },
  { id: "vegetables", name: "Vegetables", kind: "label", where: "?item wdt:P31 wd:Q11004", floor: 8 },
  { id: "gemstones-and-minerals", name: "Gemstones & Minerals", kind: "label", where: "?item wdt:P31 ?t . VALUES ?t { wd:Q7946 wd:Q83437 }", floor: 15 },
  // Geography
  { id: "countries", name: "Countries", kind: "label", where: "?item wdt:P31 wd:Q6256", floor: 10 },
  { id: "us-states", name: "U.S. States", kind: "label", where: "?item wdt:P31 wd:Q35657", floor: 5 },
  { id: "world-cities", name: "World Cities", kind: "label", where: "?item wdt:P31 wd:Q515", floor: 60 },
  { id: "capital-cities", name: "Capital Cities", kind: "label", where: "?item wdt:P31 wd:Q5119", floor: 30 },
  { id: "rivers", name: "Rivers", kind: "label", where: "?item wdt:P31 wd:Q4022", floor: 40 },
  { id: "mountains", name: "Mountains", kind: "label", where: "?item wdt:P31 wd:Q8502", floor: 40 },
  { id: "islands", name: "Islands", kind: "label", where: "?item wdt:P31 wd:Q23442", floor: 40 },
  { id: "lakes", name: "Lakes", kind: "label", where: "?item wdt:P31 wd:Q23397", floor: 40 },
  { id: "deserts", name: "Deserts", kind: "label", where: "?item wdt:P31 wd:Q8514", floor: 15 },
  { id: "volcanoes", name: "Volcanoes", kind: "label", where: "?item wdt:P31 wd:Q8072", floor: 25 },
  { id: "waterfalls", name: "Waterfalls", kind: "label", where: "?item wdt:P31 wd:Q34038", floor: 12 },
  { id: "national-parks", name: "National Parks", kind: "label", where: "?item wdt:P31 wd:Q46169", floor: 12 },
  { id: "landmarks", name: "Famous Landmarks", kind: "label", where: "?item wdt:P31 ?t . VALUES ?t { wd:Q570116 wd:Q4989906 }", floor: 40 },
  { id: "castles", name: "Castles", kind: "label", where: "?item wdt:P31 wd:Q23413", floor: 30 },
  { id: "bridges", name: "Famous Bridges", kind: "label", where: "?item wdt:P31 wd:Q12280", floor: 30 },
  { id: "skyscrapers", name: "Skyscrapers", kind: "label", where: "?item wdt:P31 wd:Q11303", floor: 25 },
  { id: "stadiums", name: "Stadiums", kind: "label", where: "?item wdt:P31 wd:Q483110", floor: 25 },
  { id: "museums", name: "Museums", kind: "label", where: "?item wdt:P31 wd:Q33506", floor: 30 },
  // Entertainment and culture
  { id: "movies", name: "Movies", kind: "label", where: "?item wdt:P31 wd:Q11424", floor: 60 },
  { id: "animated-films", name: "Animated Films", kind: "label", where: "?item wdt:P31 wd:Q202866", floor: 25 },
  { id: "tv-shows", name: "TV Shows", kind: "label", where: "?item wdt:P31 wd:Q5398426", floor: 40 },
  { id: "video-games", name: "Video Games", kind: "label", where: "?item wdt:P31 wd:Q7889", floor: 40 },
  { id: "board-games", name: "Board Games", kind: "label", where: "?item wdt:P31 wd:Q131436", floor: 6 },
  { id: "novels", name: "Famous Novels", kind: "label", where: "?item wdt:P31 wd:Q8261", floor: 40 },
  { id: "fictional-characters", name: "Fictional Characters", kind: "label", where: "?item wdt:P31 wd:Q95074", floor: 60 },
  { id: "superheroes", name: "Superheroes", kind: "label", where: "?item wdt:P31 wd:Q188784", floor: 8 },
  { id: "video-game-characters", name: "Video Game Characters", kind: "label", where: "?item wdt:P31 wd:Q1569167", floor: 12 },
  { id: "mythical-creatures", name: "Mythical Creatures", kind: "label", where: "?item wdt:P31 wd:Q2239243", floor: 6 },
  { id: "gods-and-deities", name: "Gods & Deities", kind: "label", where: "?item wdt:P31 wd:Q178885", floor: 20 },
  { id: "music-genres", name: "Music Genres", kind: "label", where: "?item wdt:P31 wd:Q188451", floor: 12 },
  { id: "musical-instruments", name: "Musical Instruments", kind: "label", where: "?item wdt:P31 wd:Q34379", floor: 8 },
  // Food, things, and ideas
  { id: "dishes", name: "Famous Dishes", kind: "label", where: "?item wdt:P31 wd:Q746549", floor: 15 },
  { id: "drinks", name: "Drinks", kind: "label", where: "?item wdt:P31/wdt:P279* wd:Q40050", floor: 25 },
  { id: "toys", name: "Toys", kind: "label", where: "?item wdt:P31/wdt:P279* wd:Q11422", floor: 15 },
  { id: "clothing", name: "Clothing", kind: "label", where: "?item wdt:P31/wdt:P279* wd:Q11460", floor: 20 },
  { id: "tools", name: "Tools", kind: "label", where: "?item wdt:P31/wdt:P279* wd:Q39546", floor: 20 },
  { id: "furniture", name: "Furniture", kind: "label", where: "?item wdt:P31/wdt:P279* wd:Q14745", floor: 15 },
  { id: "car-models", name: "Car Models", kind: "label", where: "?item wdt:P31 wd:Q3231690", floor: 30 },
  { id: "airlines", name: "Airlines", kind: "label", where: "?item wdt:P31 wd:Q46970", floor: 30 },
  { id: "brands", name: "Famous Brands", kind: "label", where: "?item wdt:P31 wd:Q431289", floor: 30 },
  { id: "programming-languages", name: "Programming Languages", kind: "label", where: "?item wdt:P31 wd:Q9143", floor: 25 },
  { id: "websites-and-apps", name: "Websites & Apps", kind: "label", where: "?item wdt:P31 ?t . VALUES ?t { wd:Q35127 wd:Q620615 }", floor: 30 },
  { id: "currencies", name: "Currencies", kind: "label", where: "?item wdt:P31 wd:Q8142", floor: 20 },
  { id: "languages", name: "Languages", kind: "label", where: "?item wdt:P31 wd:Q34770", floor: 50 },
  { id: "sports", name: "Sports", kind: "label", where: "?item wdt:P31 wd:Q349", floor: 8 },
  { id: "holidays-and-celebrations", name: "Holidays & Celebrations", kind: "label", where: "?item wdt:P31 ?t . VALUES ?t { wd:Q1445650 wd:Q132241 }", floor: 25 },
  { id: "occupations", name: "Occupations", kind: "label", where: "?item wdt:P31 wd:Q28640", floor: 30 },
  { id: "constellations", name: "Constellations", kind: "label", where: "?item wdt:P31 wd:Q8928", floor: 10 },
  { id: "space-objects", name: "Planets & Moons", kind: "label", where: "?item wdt:P31 ?t . VALUES ?t { wd:Q634 wd:Q2537 }", floor: 12 },
  { id: "chemical-elements", name: "Chemical Elements", kind: "label", where: "?item wdt:P31 wd:Q11344", floor: 5 },
];

// Keeps the pool family friendly and guessable. Matched as whole words, case insensitive.
const BLOCKED_WORDS = [
  "sex", "sexual", "sexy", "porn", "porno", "erotic", "xxx", "nude", "naked", "rape", "rapist", "incest",
  "nazi", "nazis", "hitler", "genocide", "holocaust", "massacre", "terrorist", "terrorism", "suicide",
  "slave", "slavery", "pedophile", "fuck", "fucking", "shit", "bitch", "cunt", "dick", "cock", "pussy",
  "whore", "slut", "nigger", "nigga", "faggot", "retard", "kill", "killer", "murder", "torture", "abortion",
  "drug", "drugs", "cocaine", "heroin", "meth", "orgy", "fetish", "bdsm", "hentai", "gore", "lynching",
];
const BLOCKED = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "i");
const NOISE = /(\blist of\b|\bseason\b|\bepisodes?\b|\bfilm series\b|\bdisambiguation\b|\bcategory:|\bwikipedia\b)/i;
const LATIN_ONLY = /^[\p{Script=Latin}\d\s'’.,:&!?\-–]+$/u;

function titleCase(s) {
  const small = new Set(["of", "the", "and", "in", "on", "de", "la", "le", "van", "von", "a", "an", "to"]);
  return s
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

const KEEP_LOWERCASE = /^(iPhone|iPad|iPod|eBay|iTunes|iCloud|iOS)/;

function accept(raw, cat) {
  let s = raw.replace(/\s+/g, " ").trim();
  if (cat.title) s = titleCase(s);
  if (!KEEP_LOWERCASE.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length < 2 || s.length > 40) return null;
  if (s.split(" ").length > 6) return null;
  if (/^Q\d+$/.test(s) || /^\d+$/.test(s)) return null;
  if (!LATIN_ONLY.test(s)) return null;
  if (NOISE.test(s) || BLOCKED.test(s)) return null;
  return s;
}

function buildQuery(cat) {
  const label =
    cat.kind === "taxon"
      ? "?item wdt:P1843 ?label . FILTER(LANG(?label) = \"en\")"
      : "?item rdfs:label ?label . FILTER(LANG(?label) = \"en\")";
  return `SELECT ?item ?label ?n WHERE {
    ${cat.where} .
    ?item wikibase:sitelinks ?n . FILTER(?n >= ${cat.floor})
    ${label}
  } ORDER BY DESC(?n) LIMIT ${FETCH_LIMIT}`;
}

async function runQuery(query) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  for (let attempt = 1; attempt <= 1; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(50_000),
    }).catch(() => null);
    if (res?.ok) return (await res.json()).results.bindings;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function exists(file) {
  return access(file).then(() => true, () => false);
}

async function buildCategory(cat) {
  const rows = await runQuery(buildQuery(cat));
  if (!rows) return `${cat.id}: query failed`;
  const byItem = new Map();
  for (const r of rows) {
    const id = r.item.value;
    const n = Number(r.n.value);
    const label = accept(r.label.value, cat);
    if (!label) continue;
    const prev = byItem.get(id);
    // Several names per item: keep the shortest, which is usually the everyday one.
    if (!prev || label.length < prev.label.length) byItem.set(id, { label, n });
  }
  const seen = new Set();
  const cards = [];
  for (const { label } of [...byItem.values()].sort((a, b) => b.n - a.n)) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(label);
    if (cards.length >= MAX_CARDS) break;
  }
  if (cards.length < MIN_CARDS) return `${cat.id}: skipped, only ${cards.length} usable cards`;
  await writeFile(
    path.join(OUT_DIR, `${cat.id}.json`),
    JSON.stringify({ id: cat.id, name: cat.name, source: "wikidata", cards }) + "\n",
  );
  return `${cat.id}: ${cards.length} cards (${rows.length} fetched)`;
}

// Usage: node build-wikidata-pools.mjs [--force] [category-id ...]
// Existing pools are kept unless --force is given, so an interrupted run can be resumed.
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  await mkdir(OUT_DIR, { recursive: true });

  const queue = [];
  for (const cat of CATEGORIES) {
    if (only.size > 0 && !only.has(cat.id)) continue;
    if (!force && (await exists(path.join(OUT_DIR, `${cat.id}.json`)))) continue;
    queue.push(cat);
  }

  const CONCURRENCY = 3;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        console.log(await buildCategory(queue.shift()));
        await new Promise((r) => setTimeout(r, 1000));
      }
    }),
  );
}

main();
