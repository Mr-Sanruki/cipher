module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  overrides: [
    {
      files: ["metro.config.js"],
      env: {
        node: true,
      },
    },
  ],
};
