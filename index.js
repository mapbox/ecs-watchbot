var cf = require('cloudfriend');

/**
 * Watchbot's JavaScript API
 *
 * @name watchbot
 */
module.exports = {
  main: require('./lib/main'),
  notifications: require('./lib/notifications'),
  messages: require('./lib/messages'),
  tasks: require('./lib/tasks'),
  template: require('./lib/template'),
  resources: require('./lib/resources'),
  log: require('./lib/logs').log,
  logStream: require('./lib/logs').logStream,
  fetch: require('./lib/logs').fetch,

  /**
   * Merges CloudFormation templates together.
   *
   * @static
   * @memberof watchbot
   * @name merge
   * @param {...object} template - a CloudFormation template to merge with
   * @returns {object} a CloudFormation template including all the Metadata,
   * Parameters, Mappings, Conditions, Resources, and Outputs from the input
   * templates
   * @throws errors when there is overlap in logical resource names between
   * templates
   */
  merge: cf.merge
};
