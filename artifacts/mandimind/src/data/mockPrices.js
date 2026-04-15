const crops = ["Onion", "Tomato", "Wheat", "Soybean", "Cotton"];
const mandis = ["Pune", "Nashik", "Aurangabad", "Nagpur", "Mumbai"];

function generatePriceData() {
  const data = {};
  const today = new Date();

  crops.forEach((crop) => {
    data[crop] = {};
    mandis.forEach((mandi) => {
      const prices = [];
      let basePrice;
      switch (crop) {
        case "Onion":
          basePrice = 1200;
          break;
        case "Tomato":
          basePrice = 1500;
          break;
        case "Wheat":
          basePrice = 2100;
          break;
        case "Soybean":
          basePrice = 1800;
          break;
        case "Cotton":
          basePrice = 2200;
          break;
        default:
          basePrice = 1500;
      }

      let mandiOffset;
      switch (mandi) {
        case "Mumbai":
          mandiOffset = 200;
          break;
        case "Pune":
          mandiOffset = 100;
          break;
        case "Nashik":
          mandiOffset = -50;
          break;
        case "Aurangabad":
          mandiOffset = -100;
          break;
        case "Nagpur":
          mandiOffset = 0;
          break;
        default:
          mandiOffset = 0;
      }

      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const variation = Math.floor(Math.random() * 300) - 150;
        const trendFactor = (30 - i) * 5;
        let price = basePrice + mandiOffset + variation + trendFactor;
        price = Math.max(800, Math.min(2500, price));
        prices.push({
          date: date.toISOString().split("T")[0],
          price: price,
          day: date.toLocaleDateString("en-IN", { weekday: "short" }),
        });
      }
      data[crop][mandi] = prices;
    });
  });

  return data;
}

export const priceData = generatePriceData();
export { crops, mandis };
