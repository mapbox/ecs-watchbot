'use strict';

const child_process = require('child_process');
const Message = require('./message');
const Logger = require('./logger');

const child = async (command, options, filesystem, logger) =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const child = child_process
      .spawn(command, options)
      .on('error', (err) => reject(err))
      .on('exit', (code, signal) => {
        const duration = Date.now() - start;
        filesystem.clean();
        resolve({ code, signal, duration });
      });

    child.stdout.pipe(logger.stream());
    child.stderr.pipe(logger.stream());
  });

class Worker {
  constructor(message = {}, options = {}, filesystem = {}) {
    if (!(message instanceof Message))
      throw new Error('Invalid Message object');

    if (!options.command) throw new Error('Missing options: command');

    debugger;
    this.command = options.command;
    this.message = message;
    this.filesystem = filesystem;
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
      //gid: 100,
      stdio: [process.stdin, 'pipe', 'pipe']
    };

    try {
      const results = await child(this.command, options, this.filesystem, this.logger);
      if (results.code === 0) return await this.success(results);
      if (results.code === 3) return await this.ignore(results);
      if (results.code === 4) return await this.noop(results);
      return await this.fail(results);
    } catch (err) {
      this.logger.workerError(err);
      return await this.message.retry();
    }
  }

  static create(message, options, filesystem) {
    return new Worker(message, options, filesystem);
  }
}

module.exports = Worker;
