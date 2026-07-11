/**
 * Resolve company logos from public web sources.
 * Prefer high-res brand marks; favicons are last resort.
 */

const DOMAIN_MAP: Record<string, string> = {
  "bank of baroda": "bankofbaroda.in",
  "yes bank limited": "yesbank.in",
  "jsw steel": "jswsteel.com",
  "tata power company ltd": "tatapower.com",
  "godrej industries ltd": "godrej.com",
  "godrej industries limited": "godrej.com",
  "mirae asset investment manager": "miraeassetmf.co.in",
  "sun pharmaceuticals limited": "sunpharma.com",
  "sun pharma laboratories ltd.": "sunpharma.com",
  "sun pharma advancedresearch co ltd": "sunpharma.com",
  "future generali india life insurance co ltd": "futuregenerali.in",
  "lyseis technologies pvt. ltd.": "lyseis.com",
  "aditya birla financial services ltd": "adityabirlacapital.com",
  "aditya birla capital": "adityabirlacapital.com",
  "aditya birla health insurance co": "adityabirlahealth.com",
  "aditya birla sun life insurance company limited": "adityabirlasunlifeinsurance.com",
  "aditya birla - grasim - paints division": "birlapaints.com",
  "gigamon solutions india pvt. ltd": "gigamon.com",
  "astra microwave product limited": "astramwp.com",
  "esyasoft smart service private limited": "esyasoft.com",
  "esyasoft technologies pvt.ltd.": "esyasoft.com",
  "esyasoft smart research private limited": "esyasoft.com",
  "eit services india private limited c/o dxc technology": "dxc.com",
  "indira ivf fertility centre": "indiraivf.com",
  "chanakya university": "chanakyauniversity.edu.in",
  "au small finance bank limited": "aubank.in",
  "tata advance systems ltd": "tataadvancedsystems.com",
  "central bank of india": "centralbankofindia.co.in",
  "axis bank ltd": "axisbank.com",
  "tata consulting engineers limited": "tce.co.in",
  "hdb financial services limited": "hdbfs.com",
  "tata power renewables energy ltd": "tatapower.com",
  "tata power solar.": "tatapower.com",
  "tata motors limited": "tatamotors.com",
  "yes securities (india) ltd": "yesbank.in",
  "esds software solutions limited": "esds.co.in",
  "icici bank ltd": "icicibank.com",
  "icici bank limited": "icicibank.com",
  "provilac dairy farms": "provilac.com",
  "tata communications ltd.": "tatacommunications.com",
  "uco bank": "ucobank.com",
  "national payments corporation of india": "npci.org.in",
  "tata aia life insurance company limited": "tataaia.com",
  "tilaknagar industries ltd": "tilind.com",
  "sterling wilson": "sterlingandwilson.com",
  "larsen & toubro technology services limited": "ltts.com",
  "larsen & toubro limited": "larsentoubro.com",
  "chubb systems pvt ltd": "chubb.com",
  "bnb security & automation solutions (p) ltd": "bnbsecurity.com",
  "wns global services (p) ltd.": "wns.com",
  "parle products": "parleproducts.com",
  "accelya kale solutions limited": "accelya.com",
  "ajanta pharma limited": "ajantapharma.com",
  "schneider electric india private limited": "se.com",
  "omnenest technologies pvt. ltd": "omnenest.com",
  "godrej consumer  products ltd": "godrejcp.com",
  "lupin ltd": "lupin.com",
  "lupin digital health limited": "lupin.com",
  "bharat petroleum corporation limited": "bharatpetroleum.in",
  "tata chemicals limited": "tatachemicals.com",
  "tata chemicals ltd": "tatachemicals.com",
  "punjab national bank": "pnbindia.in",
  "punjab and sindh bank": "punjabandsindbank.co.in",
  "mcx india ltd": "mcxindia.com",
  "hdfc asset management company limited": "hdfcfund.com",
  "sbi life insurance co. ltd": "sbilife.co.in",
  "ncdex e markets ltd. (neml)": "neml.in",
  "crisil limited": "crisil.com",
  "newtap finance private limited": "newtap.in",
  "air india sats pvt ltd": "airindiasats.com",
  "mahindra & mahindra limited": "mahindra.com",
  "bennett, coleman & co. ltd": "timesgroup.com",
  "paisabazaar": "paisabazaar.com",
  "dp world": "dpworld.com",
  "kotak securities ltd": "kotak.com",
  "great eastern shipping company ltd.": "greatship.com",
  "bse ltd(bombay stock exchange)": "bseindia.com",
  "bank of india": "bankofindia.co.in",
  "medgenome labs private ltd": "medgenome.com",
  "vmware software india pvt ltd": "vmware.com",
  "sharekhan limited": "sharekhan.com",
  "lokmat media pvt ltd": "lokmat.com",
  "prince pipes and fittings ltd.": "princepipes.com",
  "indostar capital finance ltd": "indostarcapital.com",
  "alkem laboratories limited": "alkemlabs.com",
  "juspay technologies private limited": "juspay.in",
  "metropolis healthcare pvt ltd": "metropolisindia.com",
  "gennova biopharmaceuticals limited": "gennova.co.in",
  "emcure pharmaceuticals ltd": "emcure.com",
  "kohler india corp. pvt.ltd.": "kohler.com",
  "merck life science private limited": "merckgroup.com",
  "tata international limited": "tatainternational.com",
  "sbm bank": "sbmbank.co.in",
  "birla carbon": "birlacarbon.com",
  "hilti technology solutions india private limited": "hilti.com",
  "ribbon communication": "ribboncommunications.com",
  "national investment and infrastructure fund limited (niifl)": "niifindia.in",
  "infobahn technical solutions (i) pvt ltd.": "infobahntech.com",
};

const LEGAL_SUFFIX =
  /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|corporation|company|co\.?|india|solutions|technologies|technology|systems|services|group|industries)\b/gi;

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getAccountDomain(account: string): string | null {
  const key = normalize(account);
  if (DOMAIN_MAP[key]) return DOMAIN_MAP[key];

  const keys = Object.keys(DOMAIN_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (key.includes(k) || k.includes(key)) return DOMAIN_MAP[k];
  }

  const cleaned = key
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1 && w !== "and");
  if (words.length === 0) return null;

  const slug = words.slice(0, 2).join("").replace(/&/g, "");
  if (slug.length < 3) return null;
  return `${slug}.com`;
}

/** High-quality logo URL candidates (Logo.dev first when token is set). */
export function getAccountLogoCandidates(account: string): string[] {
  const domain = getAccountDomain(account);
  if (!domain) return [];

  const urls: string[] = [];
  const token = (import.meta.env.VITE_LOGO_DEV_TOKEN as string | undefined)?.trim();

  // Logo.dev image CDN — requires publishable key (pk_…), not secret (sk_…)
  if (token && token.startsWith("pk_")) {
    const params = new URLSearchParams({
      token,
      size: "128",
      format: "png",
      theme: "light",
      retina: "true",
      fallback: "404",
    });
    urls.push(`https://img.logo.dev/${domain}?${params.toString()}`);
  }

  // Fallbacks if Logo.dev is unset / misses (Clearbit is unreliable; keep Unavatar + hi-res favicon)
  urls.push(`https://unavatar.io/${domain}?fallback=false`);
  urls.push(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
  );

  return urls;
}

export function getAccountInitials(account: string): string {
  const cleaned = account.replace(/\(.*?\)/g, "").replace(LEGAL_SUFFIX, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Soft monogram tint — used only when no logo loads. */
export function accountAccent(account: string): { bg: string; fg: string } {
  const palette = [
    { bg: "bg-[#EEF1F8]", fg: "text-[#3c3f8e]" },
    { bg: "bg-[#E8F4FC]", fg: "text-[#0693e3]" },
    { bg: "bg-[#EAF7F1]", fg: "text-[#0f766e]" },
    { bg: "bg-[#F7EEF0]", fg: "text-[#e4143b]" },
    { bg: "bg-[#F3F0EA]", fg: "text-[#78716c]" },
    { bg: "bg-[#EEF0F7]", fg: "text-[#4338ca]" },
  ];
  let h = 0;
  for (let i = 0; i < account.length; i++) h = (h * 31 + account.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
