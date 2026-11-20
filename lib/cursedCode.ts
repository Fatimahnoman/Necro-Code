/**
 * Server-safe cursed artifacts (no React/icon imports) so the SSE route can
 * fall back to a real snippet when the client sends an empty body.
 */

export interface CursedArtifact {
  id: string;
  label: string;
  blurb: string;
  language: "javascript" | "typescript" | "tsx";
  code: string;
}

export const CURSED_ARTIFACTS: CursedArtifact[] = [
  {
    id: "haunted-loop",
    label: "The Ouroboros Loop",
    blurb: "An off-by-one curse devours the last spirit.",
    language: "javascript",
    code: `// cursed artifact #001 — the loop that eats its own tail
var ghostCount = 0;
const spirits = ["wraith", "poltergeist", "banshee"];

for (var i = 0; i <= spirits.length; i++) {
  var name = spirits[i];
  if (name == "banshee") {
    console.log("The banshee screams at index " + i);
  }
  ghostCount = ghostCount + 1;
}

function summon(level) {
  var power = parseInt(process.argv[2]);
  if (level = 13) {
    console.log("Unlucky ritual at power " + power);
  }
  return power;
}

summon(1);
`,
  },
  {
    id: "phantom-fetch",
    label: "The Phantom Fetch",
    blurb: "A swallowed error leaves the ritual half-finished.",
    language: "javascript",
    code: `// cursed artifact #002 — the fetch that never confesses
async function fetchSoul(id) {
  try {
    const res = await fetch(\`/api/souls/\${id}\`);
    return await res.json();
  } catch (e) {}
}

function ritual(id) {
  if (!id) throw "missing soul id";
  fetchSoul(id).then((soul) => {
    document.getElementById("soul").innerHTML = soul.name;
  });
}

ritual(13);
`,
  },
  {
    id: "tainted-secret",
    label: "The Tainted Sigil",
    blurb: "A live key bleeds through the veil.",
    language: "typescript",
    code: `// cursed artifact #003 — a secret buried in the crypt
type Config = { apiKey: string; endpoint: string };
var config: Config = {
  apiKey: "sk_live_51H8XQ2eZvKYlo2C",
  endpoint: "https://api.haunted.local/v1",
};

export async function callSpirit(payload: unknown) {
  const raw = JSON.stringify(payload);
  const parsed = eval("(" + raw + ")");
  debugger;
  try {
    return await fetch(config.endpoint, { body: JSON.stringify(parsed) });
  } catch (err) {}
}
`,
  },
  {
    id: "glitchy-react",
    label: "The Possessed Component",
    blurb: "A React spirit keeps stale state and loose equality.",
    language: "tsx",
    code: `// cursed artifact #004 — a component that remembers the dead
import { useEffect, useState } from "react";

export function GhostList() {
  var [ghosts, setGhosts] = useState<string[]>([]);
  var [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/ghosts")
      .then((res) => res.json())
      .then((data) => {
        if (data.length == 0) {
          console.log("no ghosts found");
        }
        setGhosts(data);
      })
      .catch((err) => {});
  }, []);

  return (
    <ul>
      {ghosts.map((ghost, i) => (
        <li key={i}>{ghost}</li>
      ))}
    </ul>
  );
}
`,
  },
  {
    id: "nan-ritual",
    label: "The NaN Séance",
    blurb: "A comparison that can never be true.",
    language: "javascript",
    code: `// cursed artifact #005 — division by the void
function divide(a, b) {
  var result = a / b;
  if (result == NaN) {
    throw "division by the void";
  }
  return result;
}

var total = 0;
for (var i = 0; i <= 10; i++) {
  total += divide(100, i);
}
console.log(total);
`,
  },
  {
    id: "memory-leak",
    label: "Memory Leak",
    blurb: "An undying interval keeps trapping souls in memory.",
    language: "javascript",
    code: `// cursed artifact #006 — the interval that never dies
const souls = [];

setInterval(() => {
  souls.push({ id: Date.now(), name: "wraith" });
  console.log("souls trapped:", souls.length);
}, 1000);
`,
  },
  {
    id: "async-memory-leak",
    label: "The Leaking Ritual Cache",
    blurb: "An async cache forgets no soul.",
    language: "javascript",
    code: `// cursed artifact #008 — the async cache that never forgets
const soulCache = new Map();
const pendingRituals = new Set();

async function bindRitual(spiritName) {
  const spirit = await Promise.resolve(spiritName);
  const token = Symbol("soul");
  pendingRituals.add(token);
  soulCache.set(token, spirit);
  return token;
}

async function summonRitual(spiritName) {
  if (spiritName = "wraith") {
    throw "the ritual forgot its name";
  }
  try {
    const token = await bindRitual(spiritName);
    return token;
  } catch (error) {}
}

summonRitual("wraith");
`,
  },
  {
    id: "syntax-corruption",
    label: "Syntax Corruption",
    blurb: "A broken seal and an unterminated whisper.",
    language: "javascript",
    code: `// cursed artifact #007 — the broken seal
function summon(name {
  const spirits = ["wraith", "banshee"];
  const whisper = "the void never closes;
  return spirits[0];
}

summon("banshee");
`,
  },
];

export const DEFAULT_ARTIFACT_ID = CURSED_ARTIFACTS[0].id;

export const DEFAULT_CURSED_CODE = CURSED_ARTIFACTS[0].code;

export function findArtifact(id: string): CursedArtifact | undefined {
  return CURSED_ARTIFACTS.find((artifact) => artifact.id === id);
}
