'use strict';

const test = require('tape');
const sinon = require('sinon');
const AWS = require('@mapbox/mock-aws-sdk-js');
const watchbotDeadletter = require('../bin/watchbot-dead-letter');
const inquirer = require('inquirer');
const logs = require('../lib/logger');

test('[bin.watchbot-dead-letter] success', async (assert) => {
  const argv = process.argv;
  process.argv = ['', '', 'watchbot-dead-letter'];
  process.env.QueueUrl = 'https://some-url';

  try {
    await watchbotDeadletter();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  delete process.env.QueueUrl;
  process.argv = argv;
  assert.end();
});


test('[bin.watchbot-dead-letter test] error handling', async (assert) => {
  const argv = process.argv;
  process.argv = ['', '', 'watchbot-dead-letter'];
  process.env.QueueUrl = 'https://some-url';

  try {
    await watchbotDeadletter();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    logs.log.calledWith('[error] ${err.stack}'),
    'logger error from dead-letter to console'
  );

  delete process.env.QueueUrl;
  logs.teardown();
  process.argv = argv;
  assert.end();
});

test('[bin.watchbot-dead-letter ] proper client setup & stack description', (assert) => {
  const argv = process.argv;
  process.env.QueueUrl = 'https://some-url';

  const desc = AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.reject(new Error('bail')));
  });

  AWS.stub('SQS', 'purgeQueue');

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.equal(err.message, 'bail', 'test bail out');

    assert.ok(AWS.CloudFormation.calledWith({ region: 'region' }), 'CloudFormation client in correct region');
    assert.equal(desc.callCount, 1, 'called describeStacks');
    assert.ok(desc.calledWith({ StackName: 'stack' }), 'describeStacks on provieded stack name');

    assert.ok(AWS.SQS.calledWith({ region: 'region' }), 'SQS client in correct region');

    process.argv = argv;
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[bin.watchbot-dead-letter] stack not found', (assert) => {
  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: []
    }));
  });

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.equal(err.message, 'Could not find stack in region', 'expected error message');
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[bin.watchbot-dead-letter] check initial prompts (single watchbot)', (assert) => {
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

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(prompt.callCount, 2, 'two prompts');

    assert.equal(prompt.args[0][0].length, 1, 'first prompt one question');
    assert.equal(prompt.args[0][0][0].type, 'list', 'first prompt type = list');
    assert.deepEqual(prompt.args[0][0][0].choices, [
      'Triage dead messages individually?',
      'Print out all dead messages?',
      'Return all dead messages to the work queue?',
      'Purge the dead letter queue?'
    ], 'first prompt expected actions');

    assert.equal(prompt.args[1][0].length, 1, 'second prompt one question');
    assert.equal(prompt.args[1][0][0].type, 'confirm', 'second prompt type = confirm');

    assert.equal(purge.callCount, 1, 'calls purgeQueue');
    assert.ok(purge.calledWith({ QueueUrl: 'oneDead' }), 'purges the dead letter queue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] reject purge confirmation', (assert) => {
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

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(purge.callCount, 0, 'does not call purgeQueue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] return messages to work queue', (assert) => {
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

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(prompt.args[1][0].length, 1, 'second prompt one question');
    assert.equal(prompt.args[1][0][0].type, 'confirm', 'second prompt type = confirm');

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
  });
});

test('[dead-letter] reject return messages confirmation', (assert) => {
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

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(receive.callCount, 0, 'receives no messages');
    assert.equal(send.callCount, 0, 'sends no messages');
    assert.equal(del.callCount, 0, 'deletes no messages');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] write out messages', (assert) => {
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

  watchbotDeadletter({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

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
    assert.end();
  });
});
