var fastlog = require('fastlog');

/**
 * Writes logs to stdout prefixed with a timestamp, category, and message id. Usage
 * is identical to `console.log`
 *
 * @static
 * @memberof watchbot
 * @name log
 * @param {string} msg - a string containing one or more substition strings
 * @param {string} subst1 - strings with which to replace substitution strings within `msg`
 */
module.exports = function() {
  var template = '[${timestamp}] [${category}] [' + process.env.MessageId + ']';
  var logger = fastlog('worker', 'info', template);
  logger.info.apply(null, arguments);
};
