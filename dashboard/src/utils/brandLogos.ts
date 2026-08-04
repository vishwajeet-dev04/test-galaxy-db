/**
 * Brand logos via Logo.dev (publishable key) + domain map for OEM names in pipeline.
 */

const BRAND_DOMAINS: Record<string, string> = {
  dell: "dell.com",
  lenovo: "lenovo.com",
  aws: "aws.amazon.com",
  hp: "hp.com",
  cisco: "cisco.com",
  galaxy: "goapl.com",
  microsoft: "microsoft.com",
  samsung: "samsung.com",
  "d-link": "dlink.com",
  dlink: "dlink.com",
  checkpoint: "checkpoint.com",
  iraje: "iraje.com",
  apple: "apple.com",
  commvault: "commvault.com",
  arista: "arista.com",
  netapp: "netapp.com",
  paloalto: "paloaltonetworks.com",
  "palo alto": "paloaltonetworks.com",
  manageengine: "manageengine.com",
  thales: "thalesgroup.com",
  redhat: "redhat.com",
  "red hat": "redhat.com",
  "42gears": "42gears.com",
  seclore: "seclore.com",
  akamai: "akamai.com",
  accer: "acer.com",
  acer: "acer.com",
  sonicwall: "sonicwall.com",
  ibm: "ibm.com",
  vmware: "vmware.com",
  nutanix: "nutanix.com",
  fortinet: "fortinet.com",
  juniper: "juniper.net",
  hpe: "hpe.com",
};

function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getBrandDomain(brand: string): string | null {
  const key = normalizeBrand(brand);
  if (!key || key === "others" || key === "other" || key === "unknown") return null;
  if (BRAND_DOMAINS[key]) return BRAND_DOMAINS[key];
  // strip punctuation
  const compact = key.replace(/[^a-z0-9]+/g, "");
  for (const [k, domain] of Object.entries(BRAND_DOMAINS)) {
    if (k.replace(/[^a-z0-9]+/g, "") === compact) return domain;
  }
  // heuristic: brandname.com
  if (compact.length >= 2) return `${compact}.com`;
  return null;
}

export function getBrandLogoCandidates(brand: string): string[] {
  const domain = getBrandDomain(brand);
  if (!domain) return [];

  const urls: string[] = [];
  const token = (import.meta.env.VITE_LOGO_DEV_TOKEN as string | undefined)?.trim();

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

  urls.push(`https://unavatar.io/${domain}?fallback=false`);
  urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  return urls;
}

export function getBrandInitials(brand: string): string {
  const cleaned = brand.replace(/\(.*?\)/g, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function brandAccent(brand: string): { bg: string; fg: string } {
  const palette = [
    { bg: "bg-[#EEF1F8]", fg: "text-[#3c3f8e]" },
    { bg: "bg-[#E8F4FC]", fg: "text-[#0693e3]" },
    { bg: "bg-[#EAF7F1]", fg: "text-[#0f766e]" },
    { bg: "bg-[#F7EEF0]", fg: "text-[#e4143b]" },
    { bg: "bg-[#F3F0EA]", fg: "text-[#78716c]" },
    { bg: "bg-[#EEF0F7]", fg: "text-[#4338ca]" },
  ];
  let h = 0;
  for (let i = 0; i < brand.length; i++) h = (h * 31 + brand.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
