var fastlog = require('fastlog');
var cwlogs = require('cwlogs');
var stream = require('stream');

module.exports.log = log;
module.exports.fetch = fetch;

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
function log() {
  var template = '[${timestamp}] [${category}] [' + process.env.MessageId + ']';
  var logger = fastlog('worker', 'info', template);
  logger.info.apply(null, arguments);
}

/**
 * Retrieve container logs from CloudWatch logs. This function searches the last
 * 15 minutes of available logs, and returns up to 50kb of the most recent events
 *
 * @static
 * @memberof watchbot
 * @name fetch
 * @param {string} logGroup - the ARN of the CloudWatch LogGroup
 * @param {string} messageId - the SQS message id to search for
 * @param {function} callback - a function that will be given a string of logs
 */
function fetch(logGroup, messageId, callback) {
  var readable = cwlogs.readable({
    region: logGroup.split(':')[3],
    group: logGroup.split(':')[6],
    pattern: messageId,
    messages: true
  }).on('error', callback);

  var writable = new stream.Writable();
  writable.buffer = [];
  writable.buffer.current = 0;

  writable.buffer.add = function(line) {
    if (writable.buffer.current + line.length < 50 * 1024) {
      writable.buffer.current += line.length;
      writable.buffer.push(line);
    } else {
      var drop = writable.buffer.shift();
      writable.buffer.current -= drop.length;
      writable.buffer.add(line);
    }
  };

  writable._write = function(chunk, enc, callback) {
    chunk.toString().split('\n').forEach(writable.buffer.add);
    callback();
  };

  writable.on('finish', function() {
    callback(null, writable.buffer.join('\n'));
  }).on('error', callback);

  readable.pipe(writable);
}
