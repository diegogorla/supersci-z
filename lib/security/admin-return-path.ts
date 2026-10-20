const ADMIN_DASHBOARD = "/gestao/editorial";
const AGENT_CODES = new Set(["will_de_andrade", "fred_nilo", "luis_ignacio"]);

export function safeAdminReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 512 || /[\\\u0000-\u001f\u007f]/.test(value)) return "/conta";

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/conta";
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return "/conta";

  try {
    const parsed = new URL(decoded, "https://supersci-z.invalid");
    if (parsed.origin !== "https://supersci-z.invalid" || parsed.pathname !== ADMIN_DASHBOARD || parsed.hash || parsed.username || parsed.password) return "/conta";
    if ([...parsed.searchParams.keys()].some((key) => key !== "agente")) return "/conta";
    const agent = parsed.searchParams.get("agente");
    if (agent && !AGENT_CODES.has(agent)) return "/conta";
    return `${ADMIN_DASHBOARD}${agent ? `?agente=${agent}` : ""}`;
  } catch {
    return "/conta";
  }
}
