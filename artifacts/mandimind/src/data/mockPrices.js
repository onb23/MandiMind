// Single source of truth for the 5 MVP crops — Maharashtra only.
// No mock/fake price data. All prices come from the live Agmarknet API.

export const CROP_DATA = {
  onion: {
    name: "Onion / कांदा",
    marathiName: "कांदा",
    varieties: ["Lal", "Safed", "N-53", "Export Quality"],
    mandis: ["Lasalgaon", "Pimpalgaon Baswant", "Yeola", "Sinnar", "Manmad"],
  },
  potato: {
    name: "Potato / बटाटा",
    marathiName: "बटाटा",
    varieties: ["Jyoti", "Kufri", "Local"],
    mandis: ["Pune", "Nashik", "Ahmednagar"],
  },
  green_chilli: {
    name: "Green Chilli / हिरवी मिरची",
    marathiName: "हिरवी मिरची",
    varieties: ["Teja", "Hybrid", "Local"],
    mandis: ["Pune", "Kolhapur", "Nashik"],
  },
  grapes: {
    name: "Grapes / द्राक्षे",
    marathiName: "द्राक्षे",
    varieties: ["Thompson", "Sonaka", "Sharad Seedless"],
    mandis: ["Nashik", "Sangli", "Pune"],
  },
  pomegranate: {
    name: "Pomegranate / डाळिंब",
    marathiName: "डाळिंब",
    varieties: ["Bhagawa", "Ganesh", "Mridula"],
    mandis: ["Solapur", "Ahmednagar", "Pune"],
  },
  mango: {
    name: "Mango / आंबा",
    marathiName: "आंबा",
    varieties: ["Alphonso", "Kesar", "Totapuri"],
    mandis: ["Ratnagiri", "Pune", "Mumbai"],
  },
  banana: {
    name: "Banana / केळी",
    marathiName: "केळी",
    varieties: ["Grand Naine", "Robusta", "Yelakki"],
    mandis: ["Jalgaon", "Nashik", "Pune"],
  },
  rice: {
    name: "Rice / तांदूळ",
    marathiName: "तांदूळ",
    varieties: ["Sona Masuri", "Basmati", "Indrayani"],
    mandis: ["Nagpur", "Nanded", "Latur"],
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
  if (!d) {
    const display = typeof id === "string" && id.trim() ? id.trim() : "Unknown Crop";
    return {
      id: display,
      name: display,
      marathiName: "",
      varieties: [],
      mandis: [],
    };
  }
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
