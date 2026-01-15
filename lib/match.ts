export type DetailedInterests = Record<string, string[]> | null | undefined;

/**
 * This mirrors the City tab logic in `app/(tabs)/feed.tsx`.
 * It intentionally caps at 4 "common interest" tokens and maps that count to a %.
 */
export function getCommonInterests(
  myInterests: DetailedInterests,
  userInterests: DetailedInterests,
): string[] {
  if (!myInterests || !userInterests) return [];
  const common: string[] = [];

  Object.keys(myInterests).forEach((cat) => {
    if (!(userInterests as any)[cat]) return;
    const myTags = (myInterests as any)[cat].map((t: string) => t.toLowerCase().trim());
    const theirTags = (userInterests as any)[cat].map((t: string) => t.toLowerCase().trim());
    const matchingTags = theirTags.filter((t: string) => myTags.includes(t));

    if (matchingTags.length > 0) {
      matchingTags.slice(0, 2).forEach((tag: string) => {
        const originalTag = (userInterests as any)[cat].find((t: string) => t.toLowerCase().trim() === tag);
        if (originalTag) common.push(`${cat}: ${originalTag}`);
      });
    } else {
      common.push(cat);
    }
  });

  return common.slice(0, 4);
}

export function calculateMatchPercentage(
  myInterests: DetailedInterests,
  userInterests: DetailedInterests,
): number {
  const matchCount = getCommonInterests(myInterests, userInterests).length;

  if (matchCount >= 4) return 98;
  if (matchCount === 3) return 95;
  if (matchCount === 2) return 80;
  if (matchCount === 1) return 60;
  return 0;
}

