'use strict';

const test = require('tape');
const { mockClient } = require('aws-sdk-client-mock');
const { SQSClient, ReceiveMessageCommand } = require('@aws-sdk/client-sqs');
const sqsMock = mockClient(SQSClient);
const stubber = require('./stubber');
const Messages = require('../lib/messages');
const Message = require('../lib/message');
const Logger = require('../lib/logger');

test('[messages] constructor', (assert) => {

  assert.throws(
    () => new Messages(),
    /Missing options: queueUrl/,
    'queueUrl is required'
  );

  // TODO: find a way to test the successful creation of this SQS object.
  // not sure how to do this in aws-sdk-client-mock
  const messages = new Messages({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  assert.ok(messages.sqs, 'sets .sqs');
  assert.ok(messages.logger instanceof Logger, 'sets .logger');

  assert.end();
});

test('[messages] factory', (assert) => {
  sqsMock.on(ReceiveMessageCommand).resolves();
  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });
  assert.ok(messages instanceof Messages, 'returns Messages object');
  sqsMock.reset();
  assert.end();
});

test('[messages] waitFor polls enpty queue until you stop it', async (assert) => {

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  sqsMock
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: []
    })
    .callsFake(() => {
      messages.stop = true;
      return { Messages: [] };
    });

  try {
    await messages.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.pass('polling stopped');
  assert.equal(sqsMock.commandCalls(ReceiveMessageCommand).length, 2, 'called sqs.receiveMessage twice');

  sqsMock.reset();
  assert.end();
});

test('[messages] waitFor gets message', async (assert) => {
  const message = stubber(Message).setup();

  const msgs = [
    {
      MessageId: '1',
      ReceiptHandle: 'a',
      Body: JSON.stringify({ Subject: 'one', Message: '1' }),
      Attributes: {
        SentTimestamp: 1518027533772,
        ApproximateFirstReceiveTimestamp: 1518027533772,
        ApproximateReceiveCount: 1
      }
    }
  ];

  sqsMock
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: msgs
    });

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  let data;
  try {
    data = await messages.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(sqsMock.commandCalls(ReceiveMessageCommand).length, 1, 'resolves after receiving a message');
  const args = sqsMock.commandCalls(ReceiveMessageCommand)[0].args[0].input;
  assert.deepEqual(args, {
    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake',
    AttributeNames: [
      'SentTimestamp',
      'ApproximateFirstReceiveTimestamp',
      'ApproximateReceiveCount'
    ],
    WaitTimeSeconds: 20,
    MaxNumberOfMessages: 1
  },
  'called SQS.receiveMessage with expected parameters'
  );

  assert.equal(data.length, 1, 'one message returned');
  assert.ok(data[0] instanceof Message, 'returned as a Message object');
  assert.ok(
    Message.create.calledWith(msgs[0], {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
    }),
    'created Message object correctly'
  );

  message.teardown();
  sqsMock.reset();
  assert.end();
});

test('[messages] waitFor gets multiple messages', async (assert) => {
  const message = stubber(Message).setup();

  const msgs = [
    {
      MessageId: '1',
      ReceiptHandle: 'a',
      Body: JSON.stringify({ Subject: 'one', Message: '1' }),
      Attributes: {
        SentTimestamp: 1518027533772,
        ApproximateFirstReceiveTimestamp: 1518027533772,
        ApproximateReceiveCount: 1
      }
    },
    {
      MessageId: '2',
      ReceiptHandle: 'b',
      Body: JSON.stringify({ Subject: 'two', Message: '2' }),
      Attributes: {
        SentTimestamp: 1518027533772,
        ApproximateFirstReceiveTimestamp: 1518027533772,
        ApproximateReceiveCount: 1
      }
    }
  ];

  sqsMock
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: msgs
    });

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  let data;
  try {
    data = await messages.waitFor(20);
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(sqsMock.commandCalls(ReceiveMessageCommand).length, 1, 'resolves after receiving a message');
  const args = sqsMock.commandCalls(ReceiveMessageCommand)[0].args[0].input;
  assert.deepEqual(args, {
    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake',
    AttributeNames: [
      'SentTimestamp',
      'ApproximateFirstReceiveTimestamp',
      'ApproximateReceiveCount'
    ],
    WaitTimeSeconds: 20,
    MaxNumberOfMessages: 10
  },
  'called SQS.receiveMessage with expected parameters'
  );

  assert.equal(data.length, 2, 'two messages returned');
  assert.ok(
    data.every((m) => m instanceof Message),
    'returned as a Message objects'
  );
  assert.ok(
    Message.create.calledWith(msgs[0], {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
    }),
    'created first Message object correctly'
  );
  assert.ok(
    Message.create.calledWith(msgs[1], {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
    }),
    'created second Message object correctly'
  );

  message.teardown();
  sqsMock.reset();
  assert.end();
});

test('[messages] waitFor handles SQS errors', async (assert) => {
  const logger = stubber(Logger).setup();
  const err = new Error('foo');

  sqsMock.on(ReceiveMessageCommand).rejects(err);

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  logger.queueError.callsFake(() => (messages.stop = true));

  try {
    await messages.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.queueError.calledWith(err), 'logged queue error');

  logger.teardown();
  sqsMock.reset();
  assert.end();
});
