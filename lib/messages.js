'use strict';

const url = require('url');
const events = require('events');
const AWS = require('aws-sdk');
const Message = require('./message');

class Messages extends events.EventEmitter {
  constructor(options = {}) {
    super();

    if (!options.queueUrl) throw new Error('Missing options: queueUrl');
    this.options = options;

    this.sqs = new AWS.SQS({
      region: url.parse(options.queueUrl).host.split('.')[1],
      params: { QueueUrl: options.queueUrl }
    });
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
          data = await this.sqs.receiveMessage(params).promise();
        } catch (err) {
          this.emit('error', err);
          return setImmediate(poll);
        }

        if (!data.Messages || !data.Messages.length) return setImmediate(poll);

        const messages = data.Messages.map((msg) =>
          Message.create(msg, this.options)
        );

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
