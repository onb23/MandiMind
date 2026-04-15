export const CROPS = [
  { id: "wheat",     name: "Wheat / गेहूं / गहू",               base: 2200, trend: "rising",  trendDelta: 0.04 },
  { id: "onion",     name: "Onion / प्याज / कांदा",              base: 1800, trend: "falling", trendDelta: -0.06 },
  { id: "tomato",    name: "Tomato / टमाटर / टोमॅटो",            base: 1400, trend: "rising",  trendDelta: 0.08 },
  { id: "cotton",    name: "Cotton / कपास / कापूस",              base: 6200, trend: "stable",  trendDelta: 0.01 },
  { id: "soybean",   name: "Soybean / सोयाबीन",                  base: 4500, trend: "rising",  trendDelta: 0.03 },
  { id: "sugarcane", name: "Sugarcane / गन्ना / ऊस",             base: 3200, trend: "stable",  trendDelta: 0.0 },
  { id: "maize",     name: "Maize / मक्का / मका",                base: 1900, trend: "falling", trendDelta: -0.02 },
  { id: "rice",      name: "Rice / धान / भात",                   base: 2100, trend: "stable",  trendDelta: 0.01 },
  { id: "chilli",    name: "Chilli / मिर्च / मिरची",              base: 8000, trend: "rising",  trendDelta: 0.05 },
  { id: "garlic",    name: "Garlic / लहसुन / लसूण",              base: 3500, trend: "falling", trendDelta: -0.03 },
];

export const mandis = ["Pune", "Nashik", "Aurangabad", "Nagpur", "Mumbai"];

export const crops = CROPS.map((c) => c.id);

function generatePriceData() {
  const data = {};
  const today = new Date();

  CROPS.forEach((crop) => {
    data[crop.id] = {};
    mandis.forEach((mandi) => {
      const prices = [];

      const mandiOffset =
        mandi === "Mumbai" ? 250 :
        mandi === "Pune" ? 120 :
        mandi === "Nashik" ? -60 :
        mandi === "Aurangabad" ? -120 :
        mandi === "Nagpur" ? 0 : 0;

      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const trendFactor = (30 - i) * crop.base * Math.abs(crop.trendDelta) * 0.5 * (crop.trendDelta >= 0 ? 1 : -1);
        const noise = (Math.random() - 0.5) * crop.base * 0.1;
        let price = Math.round(crop.base + mandiOffset + trendFactor + noise);
        price = Math.max(500, price);
        prices.push({
          date: date.toISOString().split("T")[0],
          price,
          day: date.toLocaleDateString("en-IN", { weekday: "short" }),
        });
      }
      data[crop.id][mandi] = prices;
    });
  });

  return data;
}

export const priceData = generatePriceData();

export function getCropById(id) {
  return CROPS.find((c) => c.id === id) || CROPS[0];
}

export function getCropNames() {
  return CROPS.map((c) => ({ id: c.id, name: c.name }));
}
