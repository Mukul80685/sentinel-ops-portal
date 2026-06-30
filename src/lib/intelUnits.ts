/**
 * INT unit roster — lightweight constants shared across modules.
 * Kept separate from intelRepository so SSR/root layout does not load spreadsheet utilities.
 */

export interface IntelUnit {
  id: string;
  code: string;
  name: string;
  location: string;
}

export const INT_UNITS: IntelUnit[] = [
  { id: "alpha",   code: "A", name: "Unit A", location: "Northern Sector" },
  { id: "bravo",   code: "B", name: "Unit B", location: "Eastern Sector" },
  { id: "charlie", code: "C", name: "Unit C", location: "Western Sector" },
  { id: "delta",   code: "D", name: "Unit D", location: "Southern Sector" },
  { id: "echo",    code: "E", name: "Unit E", location: "Central Sector" },
  { id: "foxtrot", code: "F", name: "Unit F", location: "Forward Sector" },
  { id: "golf",    code: "G", name: "Unit G", location: "Rear Sector" },
  { id: "hotel",   code: "H", name: "Unit H", location: "Coastal Sector" },
];

export const UNIT_LABELS = INT_UNITS.map((u) => u.name);
