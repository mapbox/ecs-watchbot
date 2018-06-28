'use strict';

const child_process = require('child_process');
const killAll = require('tree-kill');
const fsExtra = require('fs-extra');
const Message = require('./message');
const Logger = require('./logger');


const child = async (command, options, logger, maxJobDuration) =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    let maxTimeout = 'used for maxJobDuration';

    const child = child_process
      .spawn(command, options)
      .on('error', (err) => reject(err))
      .on('exit', (code, signal) => {
        const duration = Date.now() - start;
        if (maxJobDuration > 0) clearTimeout(maxTimeout);
        resolve({ code, signal, duration });
      });

    if (maxJobDuration > 0) {
      maxTimeout = setTimeout(() => {
        const duration = Date.now() - start;
        logger.log(`[worker] running killAll. duration has exceeded maxJobDuration. duration: ${duration}`);
        killAll(child.pid,(err) => {
          if (err) logger.log(`[worker] killAll Error: ${err}`);
        });
      }, maxJobDuration * 1000);
    }

    child.stdout.pipe(logger.stream());
    child.stderr.pipe(logger.stream());
  });

class Worker {
  constructor(message = {}, options = {}) {
    if (!(message instanceof Message))
      throw new Error('Invalid Message object');

    if (!options.command) throw new Error('Missing options: command');

    this.command = options.command;
    this.volumes = options.volumes;
    this.maxJobDuration = options.maxJobDuration;
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

  async clean(volumes) {
    return Promise.all(volumes.map((volume) => fsExtra.emptyDir(volume)));
  }

  async waitFor() {
    const options = {
      shell: true,
      env: Object.assign({}, process.env, this.message.env),
      stdio: [process.stdin, 'pipe', 'pipe']
    };

    const heartbeatTimeout = setInterval(this.message.heartbeat, 120000);

    try {
      const results = await child(this.command, options, this.logger, this.maxJobDuration);

      clearInterval(heartbeatTimeout);

      await this.clean(this.volumes);

      if (results.code === 0) return await this.success(results);
      if (results.code === 3) return await this.ignore(results);
      if (results.code === 4) return await this.noop(results);
      return await this.fail(results);
    } catch (err) {
      clearInterval(heartbeatTimeout);
      this.logger.workerError(err);
      return await this.message.retry();
    }
  }

  static create(message, options) {
    return new Worker(message, options);
  }
}

module.exports = Worker;
