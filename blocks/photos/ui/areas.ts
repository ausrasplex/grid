// Area helpers shared by the photo screens.
export interface AreaOpt {
  buildingId: string;
  buildingName: string;
  levelId: string | null;
  levelName: string | null;
  shortName: string | null;
}

export const areaKey = (area: { buildingId: string | null; levelId: string | null }) => `${area.buildingId ?? ""}:${area.levelId ?? ""}`;

/** "Level 2", or "Building A · Level 2" on sites with more than one building. */
export function areaLabel(areas: AreaOpt[], buildingId: string | null, levelId: string | null): string | null {
  if (!buildingId) return null;
  const multi = new Set(areas.map((area) => area.buildingId)).size > 1;
  const area = areas.find((area) => area.buildingId === buildingId && (area.levelId ?? null) === (levelId ?? null)) ?? areas.find((area) => area.buildingId === buildingId);
  if (!area) return null;
  if (levelId && area.levelId === levelId) return multi ? `${area.buildingName} · ${area.levelName}` : area.levelName;
  return area.buildingName;
}
