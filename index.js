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
  fetch: require('./lib/logs').fetch
};
