'use strict';

const events = require('events');
const Messages = require('./messages');
const Worker = require('./worker');

class Watcher extends events.EventEmitter {
  /**
   * @name Watcher
   * @param {Object} options - configuration
   * @param {Object} options.workerOptions - options object to pass to underlying Worker object
   * @param {String} options.queueUrl - the SQS queue URL
   */
  constructor(options = {}) {
    super();

    if (!options.workerOptions)
      throw new Error('Missing options: workerOptions');
    if (!options.queueUrl) throw new Error('Missing options: queueUrl');

    this.workerOptions = options.workerOptions;
    this.queueUrl = options.queueUrl;
    this.messages = Messages.create({ queueUrl: options.queueUrl });
    this.messages.on('error', (err) => this.emit('error', err));
  }

  listen() {
    return new Promise((resolve) => {
      const loop = async () => {
        if (this.stop) return resolve();

        const messages = await this.messages.waitFor();

        const workers = messages.map((message) => {
          const worker = Worker.create(message, this.workerOptions);

          worker.on('error', (err) => this.emit('error', err));
          message.on('error', (err) => this.emit('error', err));

          return worker.waitFor();
        });

        try {
          await Promise.all(workers);
        } catch (err) {
          this.emit('error', err);
        }

        setImmediate(loop);
      };

      setImmediate(loop);
    });
  }

  static create(options) {
    return new Watcher(options);
  }
}

module.exports = Watcher;
