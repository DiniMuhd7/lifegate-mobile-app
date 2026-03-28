import { View, Text } from "react-native";
import PieChart from "react-native-pie-chart";
import { ActivityMetric } from "types/professional-types";

interface ActivityChartProps {
  metrics: ActivityMetric[];
  total: number;
}

export const ActivityChart = ({ metrics, total }: ActivityChartProps) => {
  const chartSize = 150;

  const hasData = total > 0 && metrics.some((m) => m.percentage > 0);

  const chartData = hasData
    ? metrics
        .filter((m) => m.percentage > 0)
        .map((metric) => ({ value: metric.percentage, color: metric.color }))
    : [{ value: 100, color: "#E5E7EB" }];

  return (
    <View className="px-5 py-3">
      <Text className="text-base font-bold text-gray-900 mb-3">
        Case Distribution
      </Text>

      <View
        className="bg-white rounded-2xl p-5"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center">
          {/* Donut chart */}
          <View className="items-center justify-center mr-6">
            <PieChart
              widthAndHeight={chartSize}
              series={chartData}
              cover={{ radius: 0.62, color: "#fff" }}
            />
            <View className="absolute items-center justify-center">
              <Text className="text-2xl font-bold text-gray-900">{total}</Text>
              <Text className="text-xs text-gray-400 font-medium">Total</Text>
            </View>
          </View>

          {/* Legend */}
          <View className="flex-1 gap-3">
            {metrics.map((metric, i) => {
              const count =
                total > 0 ? Math.round((metric.percentage / 100) * total) : 0;
              return (
                <View key={i} className="flex-row items-center">
                  <View
                    className="w-3 h-3 rounded-full mr-3"
                    style={{ backgroundColor: metric.color }}
                  />
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-gray-700">
                      {metric.label}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {count} case{count !== 1 ? "s" : ""} · {metric.percentage}%
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
};
