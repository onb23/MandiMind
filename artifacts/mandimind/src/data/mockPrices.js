// Single source of truth for the 5 MVP crops — Maharashtra only.
// No mock/fake price data. All prices come from the live Agmarknet API.

export const CROP_DATA = {
  onion: {
    name: "Onion / कांदा",
    marathiName: "कांदा",
    varieties: ["Lal", "Safed", "N-53", "Export Quality"],
    mandis: ["Lasalgaon", "Pimpalgaon Baswant", "Yeola", "Sinnar", "Manmad"],
  },
  soybean: {
    name: "Soybean / सोयाबीन",
    marathiName: "सोयाबीन",
    varieties: ["JS-335", "MAUS-71"],
    mandis: ["Latur", "Akola", "Nanded", "Osmanabad"],
  },
  cotton: {
    name: "Cotton / कापूस",
    marathiName: "कापूस",
    varieties: ["Short Staple", "Medium Staple"],
    mandis: ["Akola", "Amravati", "Yavatmal", "Nagpur"],
  },
  tomato: {
    name: "Tomato / टोमॅटो",
    marathiName: "टोमॅटो",
    varieties: ["Hybrid", "Local", "Desi"],
    mandis: ["Nashik", "Pune", "Solapur"],
  },
  wheat: {
    name: "Wheat / गहू",
    marathiName: "गहू",
    varieties: ["Lokwan", "Sharbati"],
    mandis: ["Pune", "Ahmednagar", "Nashik"],
  },
};

export const CROPS = Object.entries(CROP_DATA).map(([id, d]) => ({
  id,
  name: d.name,
  marathiName: d.marathiName,
}));

export function getCropById(id) {
  const d = CROP_DATA[id];
  if (!d) return { id: "onion", ...CROP_DATA.onion };
  return { id, ...d };
}

export function getCropNames() {
  return CROPS.map((c) => ({ id: c.id, name: c.name }));
}

export function getMandisByCrop(cropId) {
  return CROP_DATA[cropId]?.mandis || [];
}

export function getVarietiesByCrop(cropId) {
  return CROP_DATA[cropId]?.varieties || [];
}

// Returns 0 — variety-based price offsets removed (real data determines variety prices)
export function getVariantPriceOffset(_cropId, _variety) {
  return 0;
}
