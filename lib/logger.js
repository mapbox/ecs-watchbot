'use strict';

const stream = require('stream');
const split = require('binary-split');
const combiner = require('stream-combiner2');

class Logger {
  constructor(type, message) {
    if (type !== 'watcher' && type !== 'worker')
      throw new Error(`Invalid logger type: ${type}`);

    if (message && !(message instanceof require('./message')))
      throw new Error('Invalid message');

    this.type = type;
    this.message = message;
  }

  messageReceived() {
    this.log(
      JSON.stringify({
        subject: this.message.env.Subject,
        message: this.message.env.Message,
        receives: this.message.env.ApproximateReceiveCount
      })
    );
  }

  workerSuccess(results) {
    this.log(JSON.stringify(results));
  }

  workerFailure(results) {
    this.log(`[watchbot] [failure] ${JSON.stringify(results)}`);
  }

  workerError(err) {
    this.log(`[error] [watchbot] ${err.message}`);
  }

  queueError(err) {
    this.log(`[error] [sqs] ${err.message}`);
  }

  log(line) {
    let leader = '';
    leader += `[${new Date().toGMTString()}] `;
    leader += `[${this.type}] `;
    if (this.message) leader += `[${this.message.id}] `;
    process.stdout.write(`${leader}${line}\n`);
  }

  stream() {
    const writable = new stream.Writable();
    const splitter = split();

    writable._write = (line, enc, callback) => {
      this.log(line.toString());
      callback();
    };

    return combiner([splitter, writable]);
  }

  static create(options, message) {
    return new Logger(options, message);
  }
}

module.exports = Logger;
