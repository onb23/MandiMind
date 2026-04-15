import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function TrendChart({ data, height = 200 }) {
  if (!data || data.length === 0) return null;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11 }}
          interval={4}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          domain={["dataMin - 100", "dataMax + 100"]}
          tickFormatter={(v) => `\u20B9${v}`}
        />
        <Tooltip
          formatter={(value) => [`\u20B9${value}`, "Price"]}
          labelFormatter={formatDate}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            fontSize: "13px",
          }}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#004c22"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#004c22" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
