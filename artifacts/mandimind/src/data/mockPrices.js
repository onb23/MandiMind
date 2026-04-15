export const CROP_DATA = {
  wheat: {
    name: "Wheat / गेहूं / गहू",
    base: 2200,
    trend: "rising",
    trendDelta: 0.04,
    varieties: ["Lokwan", "Sharbati", "MP Wheat"],
    mandis: ["Pune", "Ahmednagar", "Nashik"],
    variantPriceOffset: { Lokwan: 100, Sharbati: 250, "MP Wheat": 0 },
  },
  onion: {
    name: "Onion / प्याज / कांदा",
    base: 1800,
    trend: "falling",
    trendDelta: -0.06,
    varieties: ["N-53", "Local", "Red", "White", "Export Quality"],
    mandis: ["Lasalgaon", "Pimpalgaon Baswant", "Yeola", "Sinnar", "Manmad"],
    variantPriceOffset: { "N-53": 150, Local: -100, Red: 50, White: 80, "Export Quality": 500 },
  },
  tomato: {
    name: "Tomato / टमाटर / टोमॅटो",
    base: 1400,
    trend: "rising",
    trendDelta: 0.08,
    varieties: ["Hybrid", "Local", "Desi"],
    mandis: ["Nashik", "Pune", "Satara", "Ahmednagar"],
    variantPriceOffset: { Hybrid: 200, Local: -100, Desi: 0 },
  },
  cotton: {
    name: "Cotton / कपास / कापूस",
    base: 6200,
    trend: "stable",
    trendDelta: 0.01,
    varieties: ["BT Cotton", "Desi Cotton"],
    mandis: ["Akola", "Amravati", "Yavatmal", "Wardha"],
    variantPriceOffset: { "BT Cotton": 300, "Desi Cotton": -200 },
  },
  soybean: {
    name: "Soybean / सोयाबीन",
    base: 4500,
    trend: "rising",
    trendDelta: 0.03,
    varieties: ["JS-335", "MAUS-71"],
    mandis: ["Latur", "Parbhani", "Nanded"],
    variantPriceOffset: { "JS-335": 100, "MAUS-71": 50 },
  },
  sugarcane: {
    name: "Sugarcane / गन्ना / ऊस",
    base: 3200,
    trend: "stable",
    trendDelta: 0.0,
    varieties: ["Co-86032", "Co-0238"],
    mandis: ["Kolhapur", "Sangli", "Solapur"],
    variantPriceOffset: { "Co-86032": 50, "Co-0238": 0 },
  },
  maize: {
    name: "Maize / मक्का / मका",
    base: 1900,
    trend: "falling",
    trendDelta: -0.02,
    varieties: ["Hybrid", "Desi"],
    mandis: ["Dhule", "Jalgaon"],
    variantPriceOffset: { Hybrid: 150, Desi: -50 },
  },
  rice: {
    name: "Rice / धान / भात",
    base: 2100,
    trend: "stable",
    trendDelta: 0.01,
    varieties: ["Basmati", "Sona Masuri", "Kolam"],
    mandis: ["Raigad", "Ratnagiri"],
    variantPriceOffset: { Basmati: 800, "Sona Masuri": 200, Kolam: 0 },
  },
  chilli: {
    name: "Chilli / मिर्च / मिरची",
    base: 8000,
    trend: "rising",
    trendDelta: 0.05,
    varieties: ["Guntur", "Byadgi", "Local"],
    mandis: ["Kolhapur", "Sangli"],
    variantPriceOffset: { Guntur: 500, Byadgi: 300, Local: -200 },
  },
  garlic: {
    name: "Garlic / लहसुन / लसूण",
    base: 3500,
    trend: "falling",
    trendDelta: -0.03,
    varieties: ["Desi", "Ooty"],
    mandis: ["Indore", "Mandsaur"],
    variantPriceOffset: { Desi: 0, Ooty: 200 },
  },
};

export const CROPS = Object.entries(CROP_DATA).map(([id, d]) => ({
  id,
  name: d.name,
  base: d.base,
  trend: d.trend,
  trendDelta: d.trendDelta,
}));

function generatePriceData() {
  const data = {};
  const today = new Date();

  Object.entries(CROP_DATA).forEach(([cropId, crop]) => {
    data[cropId] = {};
    crop.mandis.forEach((mandi, mandiIdx) => {
      const prices = [];
      const mandiOffset = (mandiIdx === 0 ? 150 : mandiIdx === 1 ? 80 : mandiIdx === 2 ? 0 : mandiIdx === 3 ? -80 : -120);
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const maxTrendSwing = crop.base * 0.15;
        const trendFactor =
          ((30 - i) / 30) * maxTrendSwing *
          (crop.trendDelta >= 0 ? 1 : -1);
        const noise = (Math.random() - 0.5) * crop.base * 0.06;
        let price = Math.round(crop.base + mandiOffset + trendFactor + noise);
        price = Math.max(500, price);
        prices.push({
          date: date.toISOString().split("T")[0],
          price,
          day: date.toLocaleDateString("en-IN", { weekday: "short" }),
        });
      }
      data[cropId][mandi] = prices;
    });
  });

  return data;
}

export const priceData = generatePriceData();

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

export function getVariantPriceOffset(cropId, variety) {
  return CROP_DATA[cropId]?.variantPriceOffset?.[variety] || 0;
}

export const mandis = ["Pune", "Nashik", "Latur", "Aurangabad", "Nagpur"];
export const crops = CROPS.map((c) => c.id);
