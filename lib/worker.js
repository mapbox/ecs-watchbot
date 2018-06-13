'use strict';

const child_process = require('child_process');
const Message = require('./message');
const Logger = require('./logger');

const child = async (command, options, logger) =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const child = child_process
      .spawn(command, options)
      .on('error', (err) => reject(err))
      .on('exit', (code, signal) => {
        const duration = Date.now() - start;
        resolve({ code, signal, duration });
      });

    child.stdout.write('[worker]');
    child.stdout.pipe(logger.stream());
    child.stderr.write('[worker]');
    child.stderr.pipe(logger.stream());
		process.stdout.on('error', function( err ) {
			console.log(err);
    if (err.code == "EPIPE") {
        process.exit(0);
    }
  });

		console.log('does this even print?');
});

class Worker {
  constructor(message = {}, options = {}) {
    if (!(message instanceof Message))
      throw new Error('Invalid Message object');

    if (!options.command) throw new Error('Missing options: command');

    this.command = options.command;
    this.message = message;
    this.logger = Logger.create('watcher', message);
  }

  async success(results) {
    this.logger.workerSuccess(results);
    return await this.message.complete();
  }

  async ignore(results) {
    this.logger.workerSuccess(results);
    return await this.message.complete();
  }

  async noop(results) {
    this.logger.workerSuccess(results);
    return await this.message.retry();
  }

  async fail(results) {
    this.logger.workerFailure(results);
    return await this.message.retry();
  }

  async waitFor() {
    const options = {
      shell: true,
      env: Object.assign({}, process.env, this.message.env),
      stdio: [process.stdin, 'pipe', 'pipe']
    };

    try {
      const results = await child(this.command, options, this.logger);
      if (results.code === 0) return await this.success(results);
      if (results.code === 3) return await this.ignore(results);
      if (results.code === 4) return await this.noop(results);
      return await this.fail(results);
    } catch (err) {
      this.logger.workerError(err);
      return await this.message.retry();
    }
  }

  static create(message, options) {
    return new Worker(message, options);
  }
}

module.exports = Worker;
