#!/usr/bin/env node
'use strict';

/**
 * watchbot-log "something that you want logged"
 *   - or -
 * echo "somehing that you want logged" | watchbot-log
 */

const Logger = require('..').Logger;
const args = process.argv.slice(2);

const logger = new Logger('worker');

if (args[0]) {
  return logger.log(args[0]);
}

process.stdin.pipe(logger.stream());
