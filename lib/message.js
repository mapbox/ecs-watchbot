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

    // If the Watchbot instance uses a regular SQS queue, sqsMessage
    // will have come from an SNS topic, so the body will be a JSON object
    // with Message and Subject properties.
    //
    // If the SQS message is for a FIFO queue, it did not come from SNS
    // so will not have the same structure and might not be JSON
    // parseable. If it is, we'll parse it; if not, we'll just pass it on.
    let envMessage = sqsMessage.Body;
    let envSubject;
    try {
      const parsedBody = JSON.parse(sqsMessage.Body);
      if (parsedBody.Subject)  {
        envMessage = parsedBody.Message;
        envSubject = parsedBody.Subject;
      }
    } catch (error) {
      // JSON-parsing failure means we can leave the body as it is.
    }

    this.id = sqsMessage.MessageId;
    this.handle = sqsMessage.ReceiptHandle;

    this.env = {
      MessageId: sqsMessage.MessageId,
      Message: envMessage,
      SentTimestamp: new Date(
        Number(sqsMessage.Attributes.SentTimestamp)
      ).toISOString(),
      ApproximateFirstReceiveTimestamp: new Date(
        Number(sqsMessage.Attributes.ApproximateFirstReceiveTimestamp)
      ).toISOString(),
      ApproximateReceiveCount: sqsMessage.Attributes.ApproximateReceiveCount.toString()
    };

    if (envSubject) this.env.Subject = envSubject;

    this.sqs = new AWS.SQS({
      region: url.parse(options.queueUrl).host.split('.')[1],
      params: { QueueUrl: options.queueUrl }
    });

    this.logger = Logger.create('watcher', this);
  }

  async retry() {
    const receives = Number(this.env.ApproximateReceiveCount);

    // Reason for this magic number discussed in detail here:
    // https://github.com/mapbox/ecs-watchbot/pull/184/files#r167034116
    // TL;DR - 2^14 seconds is longer than AWS's maximum VisibilityTimeout
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
      VisibilityTimeout: 180
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
