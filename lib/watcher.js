'use strict';

const Messages = require('./messages');
const Worker = require('./worker');
const FileSystem = require('./file-system');

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
    this.filesystem = FileSystem.create({ volumes: options.volumes, autoClean: options.autoClean, maxDiskSpace: options.maxDiskSpace });
  }

  async listen() {
    await this.filesystem.init();

    return new Promise((resolve) => {
      const loop = async () => {
        if (this.stop) return resolve();
        debugger;

        const messages = await this.messages.waitFor();

        const workers = messages.map((message) => {
          debugger;
          return Worker.create(message, this.workerOptions, this.filesystem).waitFor()
        });

        await Promise.all(workers);

        setImmediate(loop);
      };

      const diskLoop = async () => {
        if (this.stop) return resolve();

        const diskStatus = await this.filesystem.checkDisk();

        if (diskStatus === 'full') return reject(new Error('The disk is full'));

        setTimeout(diskLoop, 60000).unref();
      };

      setImmediate(loop);
      setImmediate(diskLoop);
    });
  }

  static create(options) {
    return new Watcher(options);
  }
}

module.exports = Watcher;
