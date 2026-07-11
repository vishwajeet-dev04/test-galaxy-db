/**
 * Employee profile picture resolver.
 * Photos live in /public/avatars (copied from files/employee_profile_pics).
 */

const AVATAR_FILES = [
  "ajay-patodia",
  "ajit-kumar-gupta",
  "akash-dhuri",
  "amar-kanade",
  "anil-zachariah",
  "arun-roongta",
  "dipesh-yadhav",
  "ganesh-chowdhary",
  "girish-lokhande",
  "ishwari-kadam",
  "jay-rushi",
  "jimesh-s",
  "mukesh-choithani",
  "nishant-jalan",
  "nivas-patil",
  "nusrat-fatima",
  "prashant-devanageri",
  "prashant-dudugu",
  "pushkaraj-sohoni",
  "ramakrishna-koparapu",
  "renu-puntambekar",
  "richard-tiwari",
  "rima-ingle",
  "rohit-deshmukh",
  "samrath-kakade",
  "simran-chavri",
  "tasneem-ansari",
  "vineet-gadia",
  "yashaswi-intwala",
  "yogesh-awate",
  "yogesh-bhatia",
] as const;

/** Explicit aliases: dashboard employee name → avatar slug */
const ALIASES: Record<string, string> = {
  "ajay patodia": "ajay-patodia",
  "ishwari santosh kadam": "ishwari-kadam",
  "ishwari kadam": "ishwari-kadam",
  "vineet gadia": "vineet-gadia",
  "yogesh bhatia": "yogesh-bhatia",
  "jay rushi": "jay-rushi",
  "jimesh shah": "jimesh-s",
  "jimesh  shah - team lead": "jimesh-s",
  "jimesh s": "jimesh-s",
  "richa tiwari": "richard-tiwari",
  "richard tiwari": "richard-tiwari",
  "rima kamalakar ingle": "rima-ingle",
  "rima kamalakar ingle - cloud specialist": "rima-ingle",
  "rima ingle": "rima-ingle",
  "rohit deshmukh": "rohit-deshmukh",
  "rohit  deshmukh": "rohit-deshmukh",
  "tasneem k": "tasneem-ansari",
  "tasneem  khatri": "tasneem-ansari",
  "tasneem ansari": "tasneem-ansari",
  "prashant ddugu": "prashant-dudugu",
  "prashant dudugu": "prashant-dudugu",
  "prashant ramchandra dudugu - team lead": "prashant-dudugu",
  "ramakrishna koparapu": "ramakrishna-koparapu",
  "samarth kakade": "samrath-kakade",
  "samrath kakade": "samrath-kakade",
};

const AVATAR_SET = new Set<string>(AVATAR_FILES);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function initialsFromName(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resolve avatar public URL for an employee name, or null if none. */
export function getAvatarUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = normalize(name);

  const alias = ALIASES[key];
  if (alias && AVATAR_SET.has(alias)) return `/avatars/${alias}.jpg?v=2`;

  const slug = slugify(name);
  if (AVATAR_SET.has(slug)) return `/avatars/${slug}.jpg?v=2`;

  // First + last name match against known slugs
  const parts = key.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const fl = `${parts[0]}-${parts[parts.length - 1]}`;
    if (AVATAR_SET.has(fl)) return `/avatars/${fl}.jpg?v=2`;

    for (const file of AVATAR_FILES) {
      const fp = file.split("-");
      if (fp.length >= 2 && fp[0] === parts[0] && fp[fp.length - 1] === parts[parts.length - 1]) {
        return `/avatars/${file}.jpg?v=2`;
      }
    }
  }

  // Unique first-name match
  if (parts.length >= 1) {
    const first = parts[0];
    const cands = AVATAR_FILES.filter((f) => f.startsWith(`${first}-`) || f === first);
    if (cands.length === 1) return `/avatars/${cands[0]}.jpg?v=2`;
  }

  return null;
}

export function getInitials(name: string | null | undefined): string {
  return initialsFromName(name ?? "");
}
