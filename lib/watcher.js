'use strict';

const Messages = require('./messages');
const Worker = require('./worker');

class Watcher {
  /**
   * @name Watcher
   * @param {Object} options - configuration
   * @param {Object} options.workerOptions - options object to pass to underlying Worker object
   * @param {String} options.queueUrl - the SQS queue URL
   */
  constructor(options = {}) {
    if (!options.workerOptions)
      throw new Error('Missing options: workerOptions');
    if (!options.queueUrl) throw new Error('Missing options: queueUrl');

    this.workerOptions = options.workerOptions;
    this.queueUrl = options.queueUrl;
    this.messages = Messages.create({ queueUrl: options.queueUrl, structuredLogging: options.structuredLogging });
    this.writableFilesystem = options.writableFilesystem;
  }

  listen() {
    return new Promise((resolve) => {
      const loop = async () => {
        if (this.stop) return resolve();

        const messages = await this.messages.waitFor();

        const workers = messages.map((message) =>
          Worker.create(message, this.workerOptions).waitFor()
        );
        await Promise.all(workers);
        return this.writableFilesystem ? resolve() : setImmediate(loop);
      };
      setImmediate(loop);
    });
  }

  static create(options) {
    return new Watcher(options);
  }
}

module.exports = Watcher;
