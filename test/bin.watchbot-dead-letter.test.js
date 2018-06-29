'use strict';

const test = require('tape');
const sinon = require('sinon');
const AWS = require('@mapbox/mock-aws-sdk-js');
const watchbotDeadletter = require('../bin/watchbot-dead-letter');
const inquirer = require('inquirer');
const cwlogs = require('cwlogs');
const stream = require('stream');

test('[bin.watchbot-dead-letter] stack not found', async (assert) => {
  process.argv = ['node', 'bin/whatever', '--stack-name', 'stackName', '--region', 'regionName'];
  process.argv.QueueUrl = 'https://something';
  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: []
    }));
  });

  try {
    await watchbotDeadletter();
  } catch (err) {
    assert.equal(err.message, 'Could not find stackName in regionName', 'expected error message');
    AWS.CloudFormation.restore();
    assert.end();
  }
});

test('[dead-letter] individual message triage', async (assert) => {
  process.argv = ['node', 'bin/whatever', '--stack-name', 'stackName', '--region', 'regionName'];
  process.argv.QueueUrl = 'https://something';
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Triage dead messages individually?' }));
  prompt.onCall(1).returns(Promise.resolve({ action: 'Return this message to the work queue?' }));
  prompt.onCall(2).returns(Promise.resolve({ action: 'Return this message to the dead letter queue?' }));
  prompt.onCall(3).returns(Promise.resolve({ action: 'Delete this message entirely?' }));
  prompt.onCall(4).returns(Promise.resolve({ action: 'View this message\'s recent logs?' }));
  prompt.onCall(5).returns(Promise.resolve({ action: 'Stop individual triage?' }));
  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });
  const receive = AWS.stub('SQS', 'receiveMessage');
  receive.onCall(0).returns({
    promise: () => Promise.resolve({ Messages: [{ MessageId: 'id-1', Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }), ReceiptHandle: 'handle-1' }] })
  });
  receive.onCall(1).returns({
    promise: () => Promise.resolve({ Messages: [{ MessageId: 'id-2', Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }), ReceiptHandle: 'handle-2' }] })
  });
  receive.onCall(2).returns({
    promise: () => Promise.resolve({ Messages: [{ MessageId: 'id-3', Body: JSON.stringify({ Subject: 'subject-3', Message: 'message-3' }), ReceiptHandle: 'handle-3' }] })
  });
  receive.onCall(3).returns({
    promise: () => Promise.resolve({ Messages: [{ MessageId: 'id-4', Body: JSON.stringify({ Subject: 'subject-4', Message: 'message-4' }), ReceiptHandle: 'handle-4' }] })
  });

  const send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });
  const vis = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });
  const fetch = sinon.stub(cwlogs, 'readable');
  let count = 0;
  const mockedCwlogs = new stream.Readable({
    read: function() {
      if (count === 0) {
        this.push([
          '[Sun, 12 Feb 2017 00:24:41 GMT] [watchbot] [a406f47b-a0f2-49a6-a159-b0f8578104bf] {"subject":"bozo","message":"message-4","receives":"1"}',
          '[Sun, 12 Feb 2017 00:24:42 GMT] [watchbot] [436d13dc-a666-44fd-a2df-70f1f4b3f107] {"subject":"bozo","message":"message-5","receives":"1"}'
        ].join('\n'));
        count++;
      }
      if (count > 0) this.push('final log') && this.push(null);
    }
  });
  fetch.returns(mockedCwlogs);

  try {
    await watchbotDeadletter();
    assert.equal(send.callCount, 1, 'one sendMessage request');
    assert.ok(send.calledWith({
      QueueUrl: 'oneWork',
      MessageBody: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' })
    }), 'returns the first message to work queue');

    assert.equal(del.callCount, 2, 'two deleteMessage requests');
    assert.ok(del.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-1'
    }), 'deletes the first message from the dead letter queue');
    assert.ok(del.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-3'
    }), 'deletes the third message from the dead letter queue');

    assert.equal(vis.callCount, 2, 'two changeMessageVisibility requests');
    assert.ok(vis.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-2',
      VisibilityTimeout: 0
    }), 'returns the second message to the dead letter queue');
    assert.ok(vis.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-4',
      VisibilityTimeout: 0
    }), 'returns the fourth message to the dead letter queue');

    assert.equal(fetch.callCount, 2, 'two calls to fetch recent logs');
    assert.equals(fetch.args[0][0].pattern, 'message-4', 'one fetch call based on message itself');
    assert.equals(fetch.args[1][0].pattern, 'a406f47b-a0f2-49a6-a159-b0f8578104bf', 'one fetch call based on message itself');

    prompt.restore();
    fetch.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  } catch (err) {
    assert.ifError(err);
  }
});

test('[bin.watchbot-dead-letter] check initial prompts (single watchbot)', async (assert) => {
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Purge the dead letter queue?' }));
  prompt.onCall(1).returns(Promise.resolve({ purge: true }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });

  const purge = AWS.stub('SQS', 'purgeQueue', function() {
    this.request.promise.returns(Promise.resolve());
  });

  try {
    await watchbotDeadletter();

    assert.equal(prompt.callCount, 2, 'two prompts');

    assert.equal(prompt.args[0][0].type, 'list', 'first prompt type = list');
    assert.deepEqual(prompt.args[0][0].choices, [
      'Triage dead messages individually?',
      'Print out all dead messages?',
      'Return all dead messages to the work queue?',
      'Purge the dead letter queue?'
    ], 'first prompt expected actions');

    assert.equal(prompt.args[1][0].type, 'confirm', 'second prompt type = confirm');

    assert.equal(purge.callCount, 1, 'calls purgeQueue');
    assert.ok(purge.calledWith({ QueueUrl: 'oneDead' }), 'purges the dead letter queue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
  } catch (err) {
    assert.ifError(err, 'success');
  }
  assert.end();
});

test('[dead-letter] reject purge confirmation', async (assert) => {
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Purge the dead letter queue?' }));
  prompt.onCall(1).returns(Promise.resolve({ purge: false }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });

  const purge = AWS.stub('SQS', 'purgeQueue', function() {
    this.request.promise.returns(Promise.resolve());
  });

  try {
    await watchbotDeadletter();
    assert.equal(purge.callCount, 0, 'does not call purgeQueue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  } catch (err) {
    assert.ifError(err, 'success');
  }
});

test('[dead-letter] return messages to work queue', async (assert) => {
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Return all dead messages to the work queue?' }));
  prompt.onCall(1).returns(Promise.resolve({ replayAll: true }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });

  let receives = 0;
  const receive = AWS.stub('SQS', 'receiveMessage', function() {
    receives++;
    let payload = {};

    if (receives === 1) payload = {
      Messages: [
        {
          MessageId: 'id-1',
          Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }),
          ReceiptHandle: 'handle-1'
        },
        {
          MessageId: 'id-2',
          Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }),
          ReceiptHandle: 'handle-2'
        }
      ]
    };

    if (receives > 1) payload = { Messages: [] };

    this.request.promise.returns(Promise.resolve(payload));
  });

  const send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  try {
    await watchbotDeadletter();

    assert.equal(prompt.args[1][0].type, 'confirm', 'second prompt type = confirm');

    assert.equal(receive.callCount, 2, 'calls receiveMessage twice');
    assert.ok(receive.alwaysCalledWith({
      QueueUrl: 'oneDead',
      WaitTimeSeconds: 1,
      MaxNumberOfMessages: 10,
      VisibilityTimeout: 600
    }), 'reads correct queue, uses long-polling, receives up to 10, 10min timeout');

    assert.equal(send.callCount, 2, 'calls sendMessage twice');
    assert.ok(send.calledWith({
      QueueUrl: 'oneWork',
      MessageBody: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' })
    }), 'sends one dead SQS message back to work queue');
    assert.ok(send.calledWith({
      QueueUrl: 'oneWork',
      MessageBody: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' })
    }), 'sends the other dead SQS message back to work queue');

    assert.equal(del.callCount, 2, 'calls deleteMessage twice');
    assert.ok(del.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-1'
    }), 'deletes one message from dead letter queue');
    assert.ok(del.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-2'
    }), 'deletes the other message from dead letter queue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  } catch (err) {
    assert.ifError(err, 'success');
  }
});

test('[dead-letter] reject return messages confirmation', async (assert) => {
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Return all dead messages to the work queue?' }));
  prompt.onCall(1).returns(Promise.resolve({ replayAll: false }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });

  const receive = AWS.stub('SQS', 'receiveMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  const del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  try {
    await watchbotDeadletter();
    assert.equal(receive.callCount, 0, 'receives no messages');
    assert.equal(send.callCount, 0, 'sends no messages');
    assert.equal(del.callCount, 0, 'deletes no messages');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  } catch (err) {
    assert.ifError(err, 'success');
  }
});

test('[dead-letter] write out messages', async (assert) => {
  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'Print out all dead messages?' }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    }));
  });

  const receive = AWS.stub('SQS', 'receiveMessage');
  receive.onCall(0).returns({
    promise: () => Promise.resolve({
      Messages: [
        { MessageId: 'id-1', Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }), ReceiptHandle: 'handle-1' },
        { MessageId: 'id-2', Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }), ReceiptHandle: 'handle-2' }
      ]
    })
  });
  receive.onCall(1).returns({
    promise: () => Promise.resolve({})
  });

  const vis = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });

  try {
    await watchbotDeadletter();

    assert.equal(vis.callCount, 2, 'two changeMessageVisibility requests');
    assert.ok(vis.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-1',
      VisibilityTimeout: 0
    }), 'returns the first message to the dead letter queue');
    assert.ok(vis.calledWith({
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-2',
      VisibilityTimeout: 0
    }), 'returns the second message to the dead letter queue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
  } catch (err) {
    assert.ifError(err, 'success');
  } finally {
    assert.end();
  }
});
