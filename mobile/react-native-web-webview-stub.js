// Stub for react-native-web-webview (used by react-native-youtube-iframe on web).
// On web we show a fallback gradient instead of YoutubePlayer, so this is never called.
const React = require('react');
const { View } = require('react-native');
const WebView = (props) => React.createElement(View, props);
WebView.displayName = 'WebViewStub';
module.exports = { default: WebView, WebView };
