'use strict';

const url = require('url');
const { SQS } = require('@aws-sdk/client-sqs');
const Logger = require('./logger');
const Message = require('./message');

class Messages {
  constructor(options = {}) {
    if (!options.queueUrl) throw new Error('Missing options: queueUrl');
    this.options = options;

    this.sqs = new SQS({
      region: url.parse(options.queueUrl).host.split('.')[1],
      params: { QueueUrl: options.queueUrl }
    });

    this.logger = Logger.create({ type: 'watcher', structuredLogging: options.structuredLogging });
  }

  async waitFor(num = 1) {
    const params = {
      AttributeNames: [
        'SentTimestamp',
        'ApproximateFirstReceiveTimestamp',
        'ApproximateReceiveCount'
      ],
      WaitTimeSeconds: 20,
      MaxNumberOfMessages: Math.min(num, 10)
    };

    return new Promise((resolve) => {
      const poll = async () => {
        if (this.stop) return resolve();

        let data;
        try {
          data = await this.sqs.receiveMessage(params);
        } catch (err) {
          this.logger.queueError(err);
          return setImmediate(poll);
        }

        if (!data.Messages || !data.Messages.length) return setImmediate(poll);

        const messages = data.Messages.map((msg) => {
          const message = Message.create(msg, this.options);
          message.logger.messageReceived();
          return message;
        });

        return resolve(messages);
      };

      poll();
    });
  }

  static create(options) {
    return new Messages(options);
  }
}

module.exports = Messages;
