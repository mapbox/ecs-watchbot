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
        const now = Date.now();
        const duration = now - start;
        // Measure the response duration as the difference between the
        // processes's current UTC time after exit and the time the message
        // entered the SQS queue ('SentTimestamp'). Force this timedelta to be
        // non-negative, as these two clocks cannot be considered to be reliably
        // or sufficiently in-sync.
        const response_duration = Math.max(0, now - new Date(options.env.SentTimestamp));
        if (maxJobDuration > 0) clearTimeout(maxTimeout);
        resolve({ code, signal, duration, response_duration });
      });

    if (maxJobDuration > 0) {
      maxTimeout = setTimeout(() => {
        logger.log(`[worker] running killAll. duration has exceeded maxJobDuration. duration: ${Date.now() - start}`);
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
    this.watcherLogger = Logger.create('watcher', message);
    this.workerLogger = Logger.create('worker', message);
  }

  async success(results) {
    this.watcherLogger.workerSuccess(results);
    return await this.message.complete();
  }

  async ignore(results) {
    this.watcherLogger.workerFailure(results);
    return await this.message.complete();
  }

  async noop(results) {
    this.watcherLogger.workerSuccess(results);
    return await this.message.retry();
  }

  async fail(results) {
    this.watcherLogger.workerFailure(results);
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

    const heartbeatTimeout = setInterval(this.message.heartbeat.bind(this.message), 120000);

    try {
      const results = await child(this.command, options, this.workerLogger, this.maxJobDuration);

      clearInterval(heartbeatTimeout);

      await this.clean(this.volumes);

      if (results.code === 0) return await this.success(results);
      if (results.code === 3) return await this.ignore(results);
      if (results.code === 4) return await this.noop(results);
      return await this.fail(results);
    } catch (err) {
      clearInterval(heartbeatTimeout);
      this.watcherLogger.workerError(err);
      return await this.message.retry();
    }
  }

  static create(message, options) {
    return new Worker(message, options);
  }
}

module.exports = Worker;
