const buildSystemCommands = require('./systemAdmin');
const buildMonitorCommands = require('./monitoring');
const buildGroupCommands = require('./groupUtilities');
const buildLookupCommands = require('./lookup');
const buildWeatherCommands = require('./weather');
const buildFunCommands = require('./funGames');
const buildMediaCommands = require('./media');
const buildSocialCommands = require('./socialNews');
const buildAiCommands = require('./aiContent');
const buildLifeCommands = require('./lifeTools');

function buildCommandDefinitions(helpers = {}) {
  return [
    ...buildSystemCommands(helpers),
    ...buildMonitorCommands(helpers),
    ...buildGroupCommands(helpers),
    ...buildLookupCommands(helpers),
    ...buildWeatherCommands(helpers),
    ...buildFunCommands(helpers),
    ...buildMediaCommands(helpers),
    ...buildSocialCommands(helpers),
    ...buildAiCommands(helpers),
    ...buildLifeCommands(helpers),
  ];
}

module.exports = {
  buildCommandDefinitions,
};
