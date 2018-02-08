#!/usr/bin/env node

'use strict';

const Watcher = require('../lib/watcher');

const main = async () => {
  if (process.argv[2] !== 'listen')
    throw new Error(`Invalid arguments: ${process.argv.slice(2).join(' ')}`);

  const command = process.argv.slice(3).join(' ');

  const options = {
    queueUrl: process.env.QueueUrl,
    workerOptions: { command }
  };

  const watcher = Watcher.create(options);
  watcher.on('error', (err) => console.log(err));

  console.log(`Launching watcher for command: ${command}`);

  return await watcher.listen();
};

module.exports = main;

if (require.main === module) main()
  .catch((err) => console.log(err.stack));
