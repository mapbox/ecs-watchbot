'use strict';

const Messages = require('./messages');
const Worker = require('./worker');
const Logger = require('./logger');

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
    this.messages = Messages.create({ queueUrl: options.queueUrl });
    this.logger = Logger.create('watcher', this);
  }

  listen() {
    return new Promise((resolve) => {
      const loop = async () => {
        if (this.stop) return resolve();

        const messages = await this.messages.waitFor();
        this.logger.log('[watcher]: Initialising workers.');
        const workers = messages.map((message) =>
          Worker.create(message, this.workerOptions).waitFor()
        );
        await Promise.all(workers);
        this.logger.log('[watcher]: Finished processing workers');
        resolve();
      };
      this.logger.log('[watcher]: Starting the loop');
      setImmediate(loop);
    });
  }

  static create(options) {
    return new Watcher(options);
  }
}

module.exports = Watcher;
