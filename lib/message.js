'use strict';

const url = require('url');
const AWS = require('aws-sdk');
const Logger = require('./logger');

class Message {
  constructor(sqsMessage = {}, options = {}) {
    let valid = ['Body', 'MessageId', 'ReceiptHandle', 'Attributes'].reduce(
      (valid, key) => {
        if (!valid) return false;
        return sqsMessage.hasOwnProperty(key);
      },
      true
    );

    if (!valid) throw new Error('Invalid SQS message object');

    valid = [
      'SentTimestamp',
      'ApproximateFirstReceiveTimestamp',
      'ApproximateReceiveCount'
    ].reduce((valid, key) => {
      if (!valid) return false;
      return sqsMessage.Attributes.hasOwnProperty(key);
    }, true);

    if (!valid) throw new Error('Invalid SQS message attributes');

    if (!options.queueUrl) throw new Error('Missing options: queueUrl');

    const snsMessage = JSON.parse(sqsMessage.Body);

    this.id = sqsMessage.MessageId;
    this.handle = sqsMessage.ReceiptHandle;

    this.env = {
      MessageId: sqsMessage.MessageId,
      Subject: snsMessage.Subject,
      Message: snsMessage.Message,
      SentTimestamp: new Date(
        Number(sqsMessage.Attributes.SentTimestamp)
      ).toISOString(),
      ApproximateFirstReceiveTimestamp: new Date(
        Number(sqsMessage.Attributes.ApproximateFirstReceiveTimestamp)
      ).toISOString(),
      ApproximateReceiveCount: sqsMessage.Attributes.ApproximateReceiveCount.toString()
    };

    this.sqs = new AWS.SQS({
      region: url.parse(options.queueUrl).host.split('.')[1],
      params: { QueueUrl: options.queueUrl }
    });

    this.logger = Logger.create('watcher', this);
  }

  async retry() {
    const receives = Number(this.env.ApproximateReceiveCount);
    if (receives > 14) return;

    const params = {
      ReceiptHandle: this.handle,
      VisibilityTimeout: Math.pow(2, receives)
    };

    try {
      return await this.sqs.changeMessageVisibility(params).promise();
    } catch (err) {
      this.logger.queueError(err);
    }
  }

  async heartbeat() {
    const params = {
      ReceiptHandle: this.handle,
      VisibilityTimeout: 180000
    };
    try {
      return await this.sqs.changeMessageVisibility(params).promise();
    } catch (err) {
      this.logger.queueError(err);
    }
  }

  async complete() {
    const params = { ReceiptHandle: this.handle };
    try {
      return await this.sqs.deleteMessage(params).promise();
    } catch (err) {
      this.logger.queueError(err);
    }
  }

  static create(sqsMessage, options) {
    return new Message(sqsMessage, options);
  }
}

module.exports = Message;
