'use strict';

const test = require('tape');
const AWS = require('@mapbox/mock-aws-sdk-js');
const Message = require('../lib/message');
const Logger = require('../lib/logger');
const stubber = require('./stubber');

const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/fake';
const sqsMessage = {
  MessageId: '1',
  ReceiptHandle: 'a',
  Body: JSON.stringify({ Subject: 'one', Message: '1' }),
  Attributes: {
    SentTimestamp: '1518027533772',
    ApproximateFirstReceiveTimestamp: '1518027533772',
    ApproximateReceiveCount: 3
  }
};

test('[message] constructor', (assert) => {
  AWS.stub('SQS', 'receiveMessage');

  assert.throws(
    () => new Message({ MessageId: 'a' }),
    /Invalid SQS message object/,
    'throws if sqsMessage does not contain all required data'
  );

  assert.throws(
    () =>
      new Message({
        MessageId: 'a',
        Body: '',
        ReceiptHandle: 'b',
        Attributes: {}
      }),
    /Invalid SQS message attributes/,
    'throws when message attributes are missing'
  );

  assert.throws(
    () => new Message(sqsMessage),
    /Missing options: queueUrl/,
    'throws when no queueUrl is provided'
  );

  const message = new Message(sqsMessage, { queueUrl });

  assert.equal(message.id, '1', 'sets .id');
  assert.equal(message.handle, 'a', 'sets .handle');
  assert.deepEqual(
    message.env,
    {
      MessageId: '1',
      Subject: 'one',
      Message: '1',
      SentTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateFirstReceiveTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateReceiveCount: '3'
    },
    'sets .env'
  );

  assert.ok(
    AWS.SQS.calledWith({
      region: 'us-east-1',
      params: { QueueUrl: queueUrl }
    }),
    'created SQS client properly'
  );

  assert.ok(message.sqs, 'sets .sqs');

  assert.ok(message.logger instanceof Logger, 'sets .logger');

  AWS.SQS.restore();
  assert.end();
});

test('[message] factory', (assert) => {
  const message = Message.create(sqsMessage, { queueUrl });
  assert.ok(message instanceof Message, 'returns Message object');
  assert.end();
});

test('[message] no SNS subject', (assert) => {
  const sqsMessageCopy = Object.assign({}, sqsMessage);
  sqsMessageCopy.Body = JSON.stringify({ Message: '1' }); // no Subject

  const message = Message.create(sqsMessageCopy, { queueUrl });
  assert.notOk(message.env.Subject);
  assert.ok(message.env.Message);

  assert.end();
});

test('[message] retry', async (assert) => {
  const cmv = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.retry();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    cmv.calledWith({
      ReceiptHandle: 'a',
      VisibilityTimeout: 8
    }),
    'returns message to queue with backoff on visibility timeout'
  );

  AWS.SQS.restore();
  assert.end();
});

test('[message] retry, too many receieves', async (assert) => {
  const cmv = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const sqsMsg = Object.assign({}, sqsMessage);
  sqsMsg.Attributes = Object.assign({}, sqsMessage.Attributes, {
    ApproximateReceiveCount: 15
  });

  const message = new Message(sqsMsg, { queueUrl });

  try {
    await message.retry();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(
    cmv.callCount,
    0,
    'lets message time out without explicitly changing visibility'
  );

  AWS.SQS.restore();
  assert.end();
});

test('[message] retry, SQS error', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.reject(err));
  });

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.retry();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged sqs error');

  logger.teardown();
  AWS.SQS.restore();
  assert.end();
});

test('[message] complete', async (assert) => {
  const del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.complete();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    del.calledWith({ ReceiptHandle: 'a' }),
    'removed message from queue'
  );

  AWS.SQS.restore();
  assert.end();
});

test('[message] complete, SQS error', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.reject(err));
  });

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.complete();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged sqs error');

  logger.teardown();
  AWS.SQS.restore();
  assert.end();
});
