import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    // Launch-hardening: keep visible in logs. Hook Sentry here later if desired.
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0B1220' }}>
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 10 }}>Something went wrong</Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 }}>
          Please close and reopen the app. If this keeps happening, contact support.
        </Text>
        <TouchableOpacity
          onPress={() => this.setState({ hasError: false, error: undefined })}
          style={{ marginTop: 18, alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)' }}
          activeOpacity={0.85}
        >
          <Text style={{ color: 'white', fontWeight: '800' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

