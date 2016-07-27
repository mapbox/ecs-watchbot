var fastlog = require('fastlog');

module.exports = function() {
  var template = '[${timestamp}] [${category}] [' + process.env.MessageId + ']';
  var logger = fastlog('worker', 'info', template);
  logger.info.apply(null, arguments);
};
