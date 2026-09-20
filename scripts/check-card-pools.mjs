// Quality gate for server/data/categories/*.json. Prints only counts, never card text, so the
// pools can be checked without spoiling them.
//
// Usage: node scripts/check-card-pools.mjs [--fix]
// --fix removes cards that fail a check and rewrites the files.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server/data/categories");
const FIX = process.argv.includes("--fix");

const BLOCKED = new RegExp(
  "\\b(sex|sexual|sexy|porn|porno|erotic|xxx|nude|naked|rape|rapist|incest|nazi|nazis|hitler|genocide|holocaust|" +
    "massacre|terrorist|terrorism|suicide|slave|slavery|pedophile|fuck|fucking|shit|bitch|cunt|dick|cock|pussy|whore|" +
    "slut|nigger|nigga|faggot|retard|kill|killer|murder|torture|abortion|cocaine|heroin|meth|orgy|fetish|bdsm|hentai|gore)\\b",
  "i",
);

const checks = {
  "too long (over 40 chars)": (c) => c.length > 40,
  "too short": (c) => c.length < 2,
  "blocked word": (c) => BLOCKED.test(c.replace(/killer whale/i, "")),
  "odd characters": (c) => /[()\[\]{}<>@#%^*=_|\\/"`~;]/.test(c),
  "leading or trailing punctuation": (c) => /^[\-–.,:'’!?&]|[\-–,:&]$/.test(c),
  "mostly digits": (c) => (c.match(/\d/g) ?? []).length > c.replace(/\s/g, "").length / 2,
  "looks like a code": (c) => /^[A-Z0-9\-]{6,}$/.test(c),
  "too many words": (c) => c.split(/\s+/).length > 6,
  "starts lowercase": (c) => /^[a-z]/.test(c) && !/^(iPhone|iPad|iPod|eBay|iTunes|iCloud|iOS)/.test(c),
};

const files = (await readdir(DIR)).filter((f) => f.endsWith(".json")).sort();
const totals = Object.fromEntries(Object.keys(checks).map((k) => [k, 0]));
const perCategory = [];
const seenAcross = new Map();
let allCards = 0;

for (const file of files) {
  const data = JSON.parse(await readFile(path.join(DIR, file), "utf8"));
  const kept = [];
  for (let card of data.cards) {
    // Wikidata labels for common nouns are lowercase; capitalize rather than drop them.
    if (FIX && checks["starts lowercase"](card)) card = card.charAt(0).toUpperCase() + card.slice(1);
    const failed = Object.entries(checks).filter(([, test]) => test(card)).map(([name]) => name);
    if (failed.length > 0) {
      for (const name of failed) totals[name]++;
      continue;
    }
    kept.push(card);
    seenAcross.set(card.toLowerCase(), (seenAcross.get(card.toLowerCase()) ?? 0) + 1);
  }
  const removed = data.cards.length - kept.length;
  const changed = kept.some((c, i) => c !== data.cards[i]);
  allCards += kept.length;
  perCategory.push({ id: data.id, count: kept.length, removed, source: data.source });
  if (FIX && (removed > 0 || changed)) {
    data.cards = kept;
    await writeFile(path.join(DIR, file), JSON.stringify(data) + "\n");
  }
}

const counts = perCategory.map((c) => c.count).sort((a, b) => a - b);
console.log(`categories: ${files.length}`);
console.log(`cards (kept): ${allCards}`);
console.log(`smallest: ${counts[0]}, median: ${counts[Math.floor(counts.length / 2)]}, largest: ${counts.at(-1)}`);
console.log(`by source: ${JSON.stringify(perCategory.reduce((a, c) => ({ ...a, [c.source]: (a[c.source] ?? 0) + 1 }), {}))}`);
console.log(`cards that appear in more than one category: ${[...seenAcross.values()].filter((n) => n > 1).length} (fine, categories are independent)`);
console.log(`flagged cards ${FIX ? "removed" : "found"}: ${perCategory.reduce((a, c) => a + c.removed, 0)}`);
for (const [name, n] of Object.entries(totals)) if (n > 0) console.log(`  ${name}: ${n}`);
console.log(`categories under 60 cards: ${perCategory.filter((c) => c.count < 60).map((c) => `${c.id}(${c.count})`).join(", ") || "none"}`);
