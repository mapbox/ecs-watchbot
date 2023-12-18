'use strict';

const test = require('tape');
const { mockClient } = require('aws-sdk-client-mock');
const {
  SQSClient,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand
} = require('@aws-sdk/client-sqs');
const sqsMock = mockClient(SQSClient);
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

  assert.ok(message.sqs, 'sets .sqs');

  assert.ok(message.logger instanceof Logger, 'sets .logger');

  assert.end();
});

test('[message] constructor with SQS FIFO non-JSON message', (assert) => {
  const sqsFifoMessage = Object.assign({}, sqsMessage, {
    Body: 'fake-message-body'
  });
  const message = new Message(sqsFifoMessage, { queueUrl });

  assert.deepEqual(
    message.env,
    {
      MessageId: '1',
      Message: 'fake-message-body',
      SentTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateFirstReceiveTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateReceiveCount: '3'
    },
    'sets .env'
  );

  assert.end();
});

test('[message] constructor with SQS FIFO JSON message', (assert) => {
  const sqsFifoMessage = Object.assign({}, sqsMessage, {
    Body: '{ "a": 1, "b": 2 }'
  });
  const message = new Message(sqsFifoMessage, { queueUrl });

  assert.deepEqual(
    message.env,
    {
      MessageId: '1',
      Message: '{ "a": 1, "b": 2 }',
      SentTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateFirstReceiveTimestamp: '2018-02-07T18:18:53.772Z',
      ApproximateReceiveCount: '3'
    },
    'sets .env'
  );

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

  sqsMock.reset();
  assert.end();
});

test('[message] retry', async (assert) => {
  sqsMock.on(ChangeMessageVisibilityCommand).resolves();
  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.retry();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(
    sqsMock.commandCalls(
      ChangeMessageVisibilityCommand,
      {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake',
        ReceiptHandle: 'a',
        VisibilityTimeout: 8
      },
      true
    ).length,
    1,
    'returns message to queue with backoff on visibility timeout'
  );

  sqsMock.reset();
  assert.end();
});

test('[message] retry, too many receieves', async (assert) => {
  sqsMock.on(ChangeMessageVisibilityCommand).resolves();

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
    sqsMock.commandCalls(ChangeMessageVisibilityCommand).length,
    0,
    'lets message time out without explicitly changing visibility'
  );

  sqsMock.reset();
  assert.end();
});

test('[message] retry, SQS error', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  sqsMock.on(ChangeMessageVisibilityCommand).rejects(err);

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.retry();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged sqs error');

  logger.teardown();
  sqsMock.reset();
  assert.end();
});

test('[message] complete', async (assert) => {
  sqsMock.on(DeleteMessageCommand).resolves();

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.complete();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(
    sqsMock.commandCalls(
      DeleteMessageCommand,
      {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake',
        ReceiptHandle: 'a'
      },
      true
    ).length,
    1,
    'removed message from queue'
  );

  sqsMock.reset();
  assert.end();
});

test('[message] complete, SQS error', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  sqsMock.on(DeleteMessageCommand).rejects(err);

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.complete();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged sqs error');

  logger.teardown();
  sqsMock.reset();
  assert.end();
});

test('[message] heartbeat', async (assert) => {
  sqsMock.on(ChangeMessageVisibilityCommand).resolves();

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.heartbeat();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(
    sqsMock.commandCalls(
      ChangeMessageVisibilityCommand,
      {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake',
        ReceiptHandle: 'a',
        VisibilityTimeout: 180
      },
      true
    ).length,
    1,
    'heartbeat sets message visibilityTimeout to 3 minutes'
  );

  sqsMock.reset();
  assert.end();
});

test('[message] heartbeat, SQS error', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  sqsMock.on(ChangeMessageVisibilityCommand).rejects(err);

  const message = new Message(sqsMessage, { queueUrl });

  try {
    await message.heartbeat();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged sqs error');

  logger.teardown();
  sqsMock.reset();
  assert.end();
});
