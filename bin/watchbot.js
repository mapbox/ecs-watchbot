#!/usr/bin/env node

'use strict';

const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

const main = async () => {
  if (process.argv[2] !== 'listen')
    throw new Error(`Invalid arguments: ${process.argv.slice(2).join(' ')}`);

  const command = process.argv.slice(3).join(' ');
  const volumes = process.env.Volumes.split(',');
  const maxJobDuration = parseInt(process.env.maxJobDuration);

  if (isNaN(maxJobDuration)) throw new Error('maxJobDuration: not a number');

  const options = {
    queueUrl: process.env.QueueUrl,
    writableFilesystem: process.env.writableFilesystem === 'true' ? true : false,
    workerOptions: { command, volumes , maxJobDuration },
    structuredLogging: process.env.structuredLogging === 'true'
  };

  const logger = Logger.create({ type: 'watcher', structuredLogging: options.structuredLogging });

  const watcher = Watcher.create(options);

  try {
    await watcher.listen();
  } catch (err) {
    if (options.structuredLogging) {
      logger.log({ level: Logger.levels.ERROR, err });
    } else {
      logger.log(`[error] ${err.stack}`);
    }
  }
};

module.exports = main;

if (require.main === module) main();
