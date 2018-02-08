'use strict';

const events = require('events');
const child_process = require('child_process');
const Message = require('./message');

const child = async (command, options) => new Promise((resolve, reject) => {
  child_process.spawn(command, options)
    .on('error', (err) => reject(err))
    .on('exit', (code, signal) => {
      if (code === 0) return resolve();
      if (code === 3) return resolve();
      if (code === 4) return reject();

      const err = new Error('Unexpected worker exit code');
      err.exitCode = code;
      err.signal = signal;
      return reject(err);
    });
});

class Worker extends events.EventEmitter {
  constructor(message = {}, options = {}) {
    super();

    if (!(message instanceof Message))
      throw new Error('Invalid Message object');

    if (!options.command)
      throw new Error('Missing options: command');

    this.command = options.command;
    this.message = message;
  }

  async fail(err) {
    if (err) this.emit('error', err);
    return await this.message.retry();
  }

  async success() {
    return await this.message.complete();
  }

  async waitFor() {
    const options = {
      shell: true,
      env: Object.assign({}, process.env, this.message.env),
      stdio: 'inherit'
    };

    try {
      await child(this.command, options);
      return await this.success();
    } catch (err) {
      return await this.fail(err);
    }
  }

  static create(message, options) {
    return new Worker(message, options);
  }
}

module.exports = Worker;
