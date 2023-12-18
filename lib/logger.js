'use strict';

const stream = require('stream');
const split = require('binary-split');
const combiner = require('stream-combiner2');
const os = require('os');

// https://github.com/trentm/node-bunyan#core-fields
// const TRACE = 10;
// const DEBUG = 20;
const INFO = 30;
// const WARN = 40;
const ERROR = 50;
// const FATAL = 60;

class Logger {
  constructor(options, message) {
    this.structuredLogging = false;
    if (typeof options === 'object') {
      this.type = options.type;
      this.structuredLogging = options.structuredLogging || false;
    } else {
      this.type = options;
    }
    if (this.type !== 'watcher' && this.type !== 'worker')
      throw new Error(`Invalid logger type: ${this.type}`);

    if (message && !(message instanceof require('./message'))) throw new Error('Invalid message');

    this.message = message;
    this.hostname = os.hostname();
    this.pid = process.pid;
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
    if (this.structuredLogging) {
      this.log(Object.assign({ level: INFO, worker_event: 'success' }, results));
    } else {
      this.log(JSON.stringify(results));
    }
  }

  workerFailure(results) {
    if (this.structuredLogging) {
      this.log(Object.assign({ level: INFO, worker_event: 'failure' }, results));
    } else {
      this.log(`[failure] ${JSON.stringify(results)}`);
    }
  }

  workerError(err) {
    if (this.structuredLogging) {
      this.log({
        level: ERROR,
        worker_event: 'error',
        msg: err.message,
        err: err
      });
    } else {
      this.log(`[error] [worker] ${err.message}`);
    }
  }

  queueError(err) {
    if (this.structuredLogging) {
      this.log({
        level: ERROR,
        sqs_event: 'error',
        msg: err.message,
        err: err
      });
    } else {
      this.log(`[error] [sqs] ${err.message}`);
    }
  }

  log(line) {
    if (this.structuredLogging) {
      const minimum_structured_logline = {
        v: 0,
        level: INFO,
        name: this.type,
        hostname: this.hostname,
        pid: process.pid,
        time: new Date().toISOString()
      };
      if (this.message) minimum_structured_logline.watchbot_sqs_message_id = this.message.id;
      // If the line looks like JSON itself, then try to parse and merge it
      if (typeof line === 'string' && line[0] === '{') {
        try {
          process.stdout.write(
            JSON.stringify(Object.assign(minimum_structured_logline, JSON.parse(line))) + '\n'
          );
        } catch (e) {
          // We failed to parse the read line as JSON, so we'll just treat it as a string
          process.stdout.write(
            JSON.stringify(Object.assign(minimum_structured_logline, { msg: line })) + '\n'
          );
        }
      } else if (typeof line === 'string') {
        // We failed to parse the read line as JSON, so we'll just treat it as a string
        process.stdout.write(
          JSON.stringify(Object.assign(minimum_structured_logline, { msg: line })) + '\n'
        );
      } else {
        // Assume it's an object, so merge it with the structured line
        process.stdout.write(
          JSON.stringify(Object.assign(minimum_structured_logline, line)) + '\n'
        );
      }
    } else {
      // Original-style logging format
      let leader = '';
      leader += `[${new Date().toGMTString()}] `;
      leader += `[${this.type}] `;
      if (this.message) leader += `[${this.message.id}] `;
      process.stdout.write(`${leader}${line}\n`);
    }
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
