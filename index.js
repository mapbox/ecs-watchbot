'use strict';

module.exports = {
  progress: require('@mapbox/watchbot-progress').progress,
  template: require('./lib/template'),
  codeBuildTrigger: require('./bin/watchbot-binary-generator').codeBuildTrigger
};
