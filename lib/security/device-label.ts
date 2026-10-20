export function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Navegador";
  const platform = /iPhone|iPad/i.test(userAgent)
    ? "Apple móvel"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh|Mac OS/i.test(userAgent)
          ? "Mac"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Dispositivo";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Navegador";
  return `${platform} · ${browser}`;
}
