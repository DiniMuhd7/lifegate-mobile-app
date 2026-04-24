/**
 * SeverityLineChart
 *
 * Shared SVG severity chart, used by both profile.tsx and health/timeline.tsx.
 * All geometry is computed inside one useMemo so recalculation only happens
 * when `entries` or `width` actually change.
 *
 * Props:
 *   entries      – HealthTimelineEntry[] to plot (most-recent 15 are used)
 *   widthOffset  – subtracted from screenWidth to get svgWidth (default 32)
 *   style        – optional ViewStyle applied to the outer container
 */
import React, { useMemo } from 'react';
import { View, Text, ViewStyle, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import type { HealthTimelineEntry } from 'types/health-types';

type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const URGENCY = {
  LOW:      { dot: '#22c55e' },
  MEDIUM:   { dot: '#f59e0b' },
  HIGH:     { dot: '#ef4444' },
  CRITICAL: { dot: '#a855f7' },
} as const;

const URGENCY_RANK: Record<Urgency, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const URGENCY_LABEL: Record<string, string> = {
  LOW: 'Low Risk', MEDIUM: 'Moderate', HIGH: 'High Risk', CRITICAL: 'Critical',
};

const Y_LEVELS = [
  { rank: 4, label: 'CRIT', color: URGENCY.CRITICAL.dot },
  { rank: 3, label: 'HIGH', color: URGENCY.HIGH.dot },
  { rank: 2, label: 'MED',  color: URGENCY.MEDIUM.dot },
  { rank: 1, label: 'LOW',  color: URGENCY.LOW.dot },
] as const;

function shortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

interface Props {
  entries: HealthTimelineEntry[];
  /** Pixels to subtract from screenWidth to derive SVG width. Default 32. */
  widthOffset?: number;
  style?: ViewStyle;
}

export const SeverityLineChart = React.memo<Props>(function SeverityLineChart({
  entries,
  widthOffset = 32,
  style,
}) {
  const { width: screenW } = useWindowDimensions();

  const chartData = useMemo(
    () => [...entries].reverse().slice(-15),
    [entries]
  );

  const geometry = useMemo(() => {
    if (chartData.length < 2) return null;

    const PAD_LEFT = 42, PAD_RIGHT = 12, PAD_TOP = 12, PAD_BOTTOM = 28;
    const svgW = screenW - widthOffset;
    const svgH = 160;
    const chartW = svgW - PAD_LEFT - PAD_RIGHT;
    const chartH = svgH - PAD_TOP - PAD_BOTTOM;
    const step = chartW / (chartData.length - 1);

    const dotColor = (u: string) =>
      URGENCY[u as keyof typeof URGENCY]?.dot ?? '#9ca3af';

    const points = chartData.map((e, i) => {
      const rank = URGENCY_RANK[e.urgency as Urgency] ?? 1;
      return {
        x: PAD_LEFT + i * step,
        y: PAD_TOP + chartH - (rank / 4) * chartH,
        color: dotColor(e.urgency),
      };
    });

    const areaPath = [
      ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
      `L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
      `L ${points[0].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`,
      'Z',
    ].join(' ');

    const yLevels = Y_LEVELS.map((l) => ({
      ...l,
      y: PAD_TOP + chartH - (l.rank / 4) * chartH,
    }));

    const xLabels = [0, Math.floor((chartData.length - 1) / 2), chartData.length - 1]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((i) => ({ x: PAD_LEFT + i * step, label: shortDate(chartData[i].createdAt) }));

    return { svgW, svgH, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM, chartW, chartH,
             points, areaPath, yLevels, xLabels };
  }, [chartData, screenW, widthOffset]);

  if (!geometry) {
    return (
      <View style={[{ height: 64, borderRadius: 14, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>Need at least 2 records to show chart</Text>
      </View>
    );
  }

  const { svgW, svgH, PAD_LEFT, PAD_BOTTOM: _pb, chartW, points, areaPath, yLevels, xLabels } = geometry;

  return (
    <View style={[{
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#f3f4f6',
      paddingVertical: 4,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    }, style]}>
      <Svg width={svgW} height={svgH}>
        {yLevels.map((l) => (
          <Line key={`g-${l.label}`} x1={PAD_LEFT} y1={l.y} x2={PAD_LEFT + chartW} y2={l.y} stroke="#f3f4f6" strokeWidth={1} />
        ))}
        {yLevels.map((l) => (
          <SvgText key={`yl-${l.label}`} x={PAD_LEFT - 5} y={l.y + 4} fontSize={9} fill={l.color} textAnchor="end" fontWeight="700">{l.label}</SvgText>
        ))}
        <Path d={areaPath} fill="rgba(10,173,162,0.07)" />
        {points.slice(1).map((p, i) => (
          <Line key={`s-${i}`} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} stroke={p.color} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {points.map((p, i) => (
          <React.Fragment key={`d-${i}`}>
            <Circle cx={p.x} cy={p.y} r={7} fill={p.color + '22'} />
            <Circle cx={p.x} cy={p.y} r={4} fill={p.color} stroke="#fff" strokeWidth={1.5} />
          </React.Fragment>
        ))}
        {xLabels.map((l, i) => (
          <SvgText key={`xl-${i}`} x={l.x} y={svgH - 6} fontSize={9} fill="#9ca3af" textAnchor="middle">{l.label}</SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 10, paddingTop: 2 }}>
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Urgency[]).map((u) => (
          <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: URGENCY[u].dot }} />
            <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '500' }}>{URGENCY_LABEL[u]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});
