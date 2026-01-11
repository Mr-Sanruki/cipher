const React = require('react');
const Reanimated = require('react-native-reanimated');

function KeyboardProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

function useReanimatedKeyboardAnimation() {
  const height = Reanimated.useSharedValue(0);
  const progress = Reanimated.useSharedValue(0);
  const state = Reanimated.useSharedValue(0);

  return {
    height,
    progress,
    state,
  };
}

module.exports = {
  KeyboardProvider,
  useReanimatedKeyboardAnimation,
};
