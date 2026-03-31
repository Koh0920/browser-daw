export const GRID_DIVISIONS = ["1/4", "1/8", "1/16", "1/32"] as const;

export type GridDivision = (typeof GRID_DIVISIONS)[number];

const DEFAULT_GRID_DIVISION: GridDivision = "1/16";

export const getGridStepSeconds = (
  bpm: number,
  division: GridDivision = DEFAULT_GRID_DIVISION,
) => {
  const safeBpm = Math.max(bpm, 1);
  const beatDuration = 60 / safeBpm;
  const denominator = Number(division.split("/")[1] ?? 16);

  return beatDuration * (4 / Math.max(denominator, 1));
};

export const snapTimeToGrid = (
  time: number,
  bpm: number,
  division: GridDivision = DEFAULT_GRID_DIVISION,
  disableSnap = false,
) => {
  const safeTime = Math.max(0, time);

  if (disableSnap) {
    return safeTime;
  }

  const step = getGridStepSeconds(bpm, division);
  return Math.max(0, Math.round(safeTime / step) * step);
};
