export const CRITICAL_READING_MARKER = "[[critical-reading]]";

export function splitArticleBody(body: string[]) {
  const markerIndex = body.indexOf(CRITICAL_READING_MARKER);
  if (markerIndex < 0 || markerIndex === body.length - 1) {
    return { narrative: body, criticalReading: [] as string[] };
  }

  return {
    narrative: body.slice(0, markerIndex),
    criticalReading: body.slice(markerIndex + 1),
  };
}
