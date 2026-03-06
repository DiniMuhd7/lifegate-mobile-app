import { View, Text } from "react-native";
import PieChart from "react-native-pie-chart";
import { ActivityMetric } from "types/professional-types";

interface ActivityChartProps {
  metrics: ActivityMetric[];
  total: number;
}

export const ActivityChart = ({ metrics, total }: ActivityChartProps) => {
  const chartSize = 160;

  // Build chart data in the new expected format
  const chartData = metrics.map((metric) => ({
    value: metric.percentage,
    color: metric.color,
  }));

  return (
    <View className="px-6 py-4">
      <Text className="text-lg font-semibold text-gray-900 mb-4">
        Recent Activities
      </Text>

      <View className="bg-white border border-gray-100 rounded-lg p-6 items-center mb-4">
        {/* Pie / Donut Chart */}
        <View className="mb-6 items-center justify-center">
          <PieChart
            widthAndHeight={chartSize}
            series={chartData}
            cover={{ radius: 0.6, color: "#fff" }} // donut hole
          />

          {/* Center overlay */}
          <View className="absolute items-center justify-center">
            <Text className="text-2xl font-bold text-gray-900">{total}</Text>
            <Text className="text-xs text-gray-500">Total</Text>
          </View>
        </View>

        {/* Legend */}
        <View className="w-full gap-2">
          {metrics.map((metric, i) => (
            <View key={i} className="flex-row items-center gap-3">
              <View
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: metric.color }}
              />
              <Text className="text-sm font-medium text-gray-700">
                {metric.percentage}% {metric.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};