#!/usr/bin/env node

'use strict';

const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

const main = async () => {
  switch (process.argv[2]) {
    case 'listen': {
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
    }
      break;
    case 'log': {
      const logger = new Logger('worker');
      if (process.argv[3]) {
        return logger.log(process.argv[3]);
      }

      process.stdin.pipe(logger.stream());
    }
    break;
    default: throw new Error(`Invalid arguments: ${process.argv.slice(2).join(' ')}`);
  }
};

module.exports = main;

if (require.main === module) main();
