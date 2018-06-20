#!/usr/bin/env node

'use strict';

const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

const main = async () => {
  if (process.argv[2] !== 'listen')
    throw new Error(`Invalid arguments: ${process.argv.slice(2).join(' ')}`);

  const logger = Logger.create('watcher');
  const command = process.argv.slice(3).join(' ');
  const volumes = process.env.Volumes.split(',');

  const options = {
    queueUrl: process.env.QueueUrl,
    fresh: process.env.fresh === 'true' ? true : false,
    workerOptions: { command, volumes }
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
