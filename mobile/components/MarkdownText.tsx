/**
 * MarkdownText
 *
 * Lightweight, zero-dependency markdown renderer for AI chat bubbles.
 * Supports the subset the EDIS engine commonly produces:
 *   **bold** | *italic* | - bullet | 1. numbered | blank-line paragraph breaks
 *
 * Renders as nested <Text> nodes so it integrates naturally with React Native styling.
 */
import React from 'react';
import { Text, View } from 'react-native';

interface Props {
  children: string;
  style?: object;
  isSent?: boolean; // true → white text (sent bubble), false → dark text (AI bubble)
}

// Split a line into segments of [text, isBold, isItalic]
type Segment = { text: string; bold: boolean; italic: boolean };

function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  // Regex: **bold** | *italic* | plain text
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), bold: false, italic: false });
    }
    if (match[0].startsWith('**')) {
      segments.push({ text: match[2], bold: true, italic: false });
    } else {
      segments.push({ text: match[3], bold: false, italic: true });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false, italic: false });
  }
  return segments;
}

function InlineText({ segments, baseStyle }: { segments: Segment[]; baseStyle: object }) {
  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={{
            fontWeight: seg.bold ? '700' : 'normal',
            fontStyle: seg.italic ? 'italic' : 'normal',
          }}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

export const MarkdownText: React.FC<Props> = ({ children, style = {}, isSent = false }) => {
  const baseColor = isSent ? '#ffffff' : '#1f2937';
  const mutedColor = isSent ? 'rgba(255,255,255,0.75)' : '#6b7280';
  const baseTextStyle = { fontSize: 14, lineHeight: 20, color: baseColor, ...style };

  const lines = children.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line → small spacer (paragraph break)
    if (trimmed === '') {
      nodes.push(<View key={`gap-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Bullet list item: starts with "- " or "• "
    if (/^[-•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-•]\s+/, '');
      nodes.push(
        <View key={`bullet-${i}`} style={{ flexDirection: 'row', marginTop: 2 }}>
          <Text style={{ color: mutedColor, marginRight: 6, marginTop: 1 }}>{'•'}</Text>
          <InlineText segments={parseInline(content)} baseStyle={{ ...baseTextStyle, flex: 1 }} />
        </View>
      );
      i++;
      continue;
    }

    // Numbered list item: starts with "N. "
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      nodes.push(
        <View key={`num-${i}`} style={{ flexDirection: 'row', marginTop: 2 }}>
          <Text style={{ color: mutedColor, marginRight: 6, minWidth: 18 }}>{numberedMatch[1]}.</Text>
          <InlineText segments={parseInline(numberedMatch[2])} baseStyle={{ ...baseTextStyle, flex: 1 }} />
        </View>
      );
      i++;
      continue;
    }

    // Heading: starts with "# " or "## "
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const size = level === 1 ? 17 : level === 2 ? 15 : 14;
      nodes.push(
        <Text key={`h-${i}`} style={{ fontSize: size, fontWeight: '700', color: baseColor, marginTop: 4, marginBottom: 2 }}>
          {headingMatch[2]}
        </Text>
      );
      i++;
      continue;
    }

    // Regular paragraph line
    nodes.push(
      <InlineText key={`p-${i}`} segments={parseInline(trimmed)} baseStyle={baseTextStyle} />
    );
    i++;
  }

  return <View>{nodes}</View>;
};
