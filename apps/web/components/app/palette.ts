const COLORS = ["#55ffb0", "#5cc8ff", "#ffc83d", "#ff8a6a", "#c19bff", "#ff7ac6", "#9be564", "#ffffff"];
/** Stable colour per maker, by order of first appearance. */
export const makerColors = (owners: string[]) => {
  const seen = [...new Set(owners)];
  return (owner: string) => COLORS[seen.indexOf(owner) % COLORS.length]!;
};
