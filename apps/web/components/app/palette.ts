const COLORS = ["#e4e4e7", "#8fb8a3", "#a1a1aa", "#b9a98a", "#9aa7c7", "#71717a", "#c4b5c9", "#d4d4d8"];
/** Stable colour per maker, by order of first appearance. */
export const makerColors = (owners: string[]) => {
  const seen = [...new Set(owners)];
  return (owner: string) => COLORS[seen.indexOf(owner) % COLORS.length]!;
};
