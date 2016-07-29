#!/usr/bin/env node

/**
 * watchbot-log "something that you want logged"
 *   - or -
 * echo "somehing that you want logged" | watchbot-log
 */

var watchbot = require('..');
var args = process.argv.slice(2);

if (args[0]) {
  return watchbot.log(args[0]);
}

process.stdin.on('data', function(d) {
  d.toString().trim().split('\n').forEach(function(line) {
    watchbot.log(line);
  });
});
