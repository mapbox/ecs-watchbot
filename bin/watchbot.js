#!/usr/bin/env node

'use strict';

const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

const main = async () => {
  if (process.argv[2] !== 'listen' && process.argv[2] !== 'dead-letter')
    throw new Error(`Invalid arguments: ${process.argv.slice(2).join(' ')}`);

  const logger = Logger.create('watcher');
  const command = process.argv.slice(3).join(' ');
  const volumes = process.env.Volumes.split(',');
  const maxJobDuration = parseInt(process.env.maxJobDuration);

  if (isNaN(maxJobDuration)) throw new Error('maxJobDuration: not a number');

  const options = {
    queueUrl: process.env.QueueUrl,
    writableFilesystem: process.env.writableFilesystem === 'true' ? true : false,
    workerOptions: { command, volumes , maxJobDuration }
  };

  const watcher = Watcher.create(options);

  try {
    await watcher.listen();
  } catch (err) {
    logger.log(`[error] ${err.stack}`);
  }
};

module.exports = main;

if (require.main === module) main();
