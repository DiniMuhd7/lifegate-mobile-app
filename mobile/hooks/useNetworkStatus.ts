/**
 * useNetworkStatus
 *
 * Subscribes to @react-native-community/netinfo and exposes:
 *  - isOnline   — true when the device has a working network connection
 *  - isOffline  — convenience inverse
 *  - type       — 'wifi' | 'cellular' | 'none' | 'unknown' | …
 *
 * The hook fires immediately on mount so components can read the initial
 * state without waiting for a network event.
 */
import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = {
  isOnline: boolean;
  isOffline: boolean;
  type: string;
};

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>({
    isOnline: true,   // optimistic default — avoids flash on mount
    isOffline: false,
    type: 'unknown',
  });

  useEffect(() => {
    // Fetch current state immediately on mount
    NetInfo.fetch().then((netState: NetInfoState) => {
      const online = !!netState.isConnected && !!netState.isInternetReachable;
      setState({ isOnline: online, isOffline: !online, type: netState.type });
    });

    // Subscribe to future changes
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const online = !!netState.isConnected && !!netState.isInternetReachable;
      setState({ isOnline: online, isOffline: !online, type: netState.type });
    });

    return unsubscribe;
  }, []);

  return state;
}
