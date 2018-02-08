'use strict';

const test = require('tape');
const AWS = require('@mapbox/mock-aws-sdk-js');
const stubber = require('./stubber');
const Messages = require('../lib/messages');
const Message = require('../lib/message');

test('[messages] constructor', (assert) => {
  AWS.stub('SQS', 'receiveMessage');

  assert.throws(
    () => new Messages(),
    /Missing options: queueUrl/,
    'queueUrl is required'
  );

  const messages = new Messages({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  assert.ok(messages.sqs, 'sets .sqs');
  assert.ok(
    AWS.SQS.calledWith({
      region: 'us-east-1',
      params: {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
      }
    }),
    'created SQS client correctly'
  );

  AWS.SQS.restore();
  assert.end();
});

test('[messages] factory', (assert) => {
  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });
  assert.ok(messages instanceof Messages, 'returns Messages object');
  assert.end();
});

test('[messages] waitFor polls enpty queue until you stop it', async (assert) => {
  const receive = AWS.stub('SQS', 'receiveMessage');

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  const empty = { promise: () => Promise.resolve({ Messages: [] }) };
  receive.onCall(0).returns(empty);
  receive.onCall(1).callsFake(() => {
    messages.stop = true;
    return empty;
  });

  try {
    await messages.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.pass('polling stopped');
  assert.equal(receive.callCount, 2, 'called sqs.receiveMessage twice');

  AWS.SQS.restore();
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

  const receive = AWS.stub('SQS', 'receiveMessage', function() {
    this.request.promise.returns(Promise.resolve({ Messages: msgs }));
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

  assert.equal(receive.callCount, 1, 'resolves after receiving a message');
  assert.ok(
    receive.calledWith({
      AttributeNames: [
        'SentTimestamp',
        'ApproximateFirstReceiveTimestamp',
        'ApproximateReceiveCount'
      ],
      WaitTimeSeconds: 20,
      MaxNumberOfMessages: 1
    }),
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
  AWS.SQS.restore();
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

  const receive = AWS.stub('SQS', 'receiveMessage', function() {
    this.request.promise.returns(Promise.resolve({ Messages: msgs }));
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

  assert.equal(receive.callCount, 1, 'resolves after receiving a message');
  assert.ok(
    receive.calledWith({
      AttributeNames: [
        'SentTimestamp',
        'ApproximateFirstReceiveTimestamp',
        'ApproximateReceiveCount'
      ],
      WaitTimeSeconds: 20,
      MaxNumberOfMessages: 10
    }),
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
  AWS.SQS.restore();
  assert.end();
});

test('[messages] waitFor handles SQS errors', async (assert) => {
  AWS.stub('SQS', 'receiveMessage', function() {
    this.request.promise.returns(Promise.reject(new Error('foo')));
  });

  const messages = Messages.create({
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/fake'
  });

  let caught;
  messages.on('error', (err) => {
    caught = err;
    messages.stop = true;
  });

  try {
    await messages.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(caught.message, 'foo', 'emitted error from SQS.receiveMessage');

  AWS.SQS.restore();
  assert.end();
});
