module.exports = {
  config: {
    name: "sharebot",
    version: "1.0.0",
    description: "Stub handler for child bot sharing",
    role: 2,
    author: "Cascade"
  },
  /**
   * Child bot interception hook.
   * Return true if the child bot handled the event and no further processing is required.
   */
  handleChildBot: () => false,
  run: () => {}
};
