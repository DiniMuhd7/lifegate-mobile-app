/**
 * ErrorBoundary
 *
 * React class component that catches unhandled JS errors anywhere in the
 * child tree and renders a recovery screen instead of a raw crash.
 * Wrap the root layout (or any high-risk subtree) with this component.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  children: React.ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset handler. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, forward to your crash-reporting service here.
    // e.g. Sentry.captureException(error, { contexts: { react: info } });
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (!hasError || !error) return children;

    if (fallback) return fallback(error, this.reset);

    return <DefaultErrorScreen error={error} onReset={this.reset} />;
  }
}

// ─── Default fallback UI ──────────────────────────────────────────────────────

function DefaultErrorScreen({ error, onReset }: { error: Error; onReset: () => void }) {
  const isDev = __DEV__;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={52} color="#dc2626" />
        </View>

        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app ran into an unexpected error. Your data is safe — tap below to try again.
        </Text>

        {isDev && (
          <ScrollView style={styles.devBox} showsVerticalScrollIndicator={false}>
            <Text style={styles.devText}>{error.message}</Text>
            {error.stack ? (
              <Text style={styles.devStack}>{error.stack}</Text>
            ) : null}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.button} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  devBox: {
    width: '100%',
    maxHeight: 160,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  devText: {
    color: '#f87171',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  devStack: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0AADA2',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
});
