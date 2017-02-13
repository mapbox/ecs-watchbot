var test = require('tape');
var sinon = require('sinon');
var AWS = require('@mapbox/mock-aws-sdk-js');
var dead = require('../lib/dead-letter');
var inquirer = require('inquirer');
var logs = require('../lib/logs');

test('[dead-letter] proper client setup & stack description', (assert) => {
  var desc = AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.reject(new Error('bail')));
  });

  AWS.stub('SQS', 'purgeQueue');

  dead({ stackName: 'stack', region: 'region' }, (err) => {
    assert.equal(err.message, 'bail', 'test bail out');

    assert.ok(AWS.CloudFormation.calledWith({ region: 'region' }), 'CloudFormation client in correct region');
    assert.equal(desc.callCount, 1, 'called describeStacks');
    assert.ok(desc.calledWith({ StackName: 'stack' }), 'describeStacks on provieded stack name');

    assert.ok(AWS.SQS.calledWith({ region: 'region' }), 'SQS client in correct region');

    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] stack not found', (assert) => {
  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: []
    }));
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
    assert.equal(err.message, 'Could not find stack in region', 'expected error message');
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[dead-letter] check initial prompts (multiple watchbots)', (assert) => {
  var prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ queue: 'one' }));
  prompt.onCall(1).returns(Promise.resolve({ action: 'Purge the dead letter queue?' }));
  prompt.onCall(2).returns(Promise.resolve({ purge: true }));

  AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.resolve({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'twoDeadLetterQueueUrl', OutputValue: 'twoDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'twoQueueUrl', OutputValue: 'twoWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' },
            { OutputKey: 'twoLogGroup', OutputValue: 'twoLogs' }
          ]
        }
      ]
    }));
  });

  var purge = AWS.stub('SQS', 'purgeQueue', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(prompt.callCount, 3, 'three prompts');

    assert.equal(prompt.args[0][0].length, 1, 'first prompt one question');
    assert.equal(prompt.args[0][0][0].type, 'list', 'first prompt type = list');
    assert.deepEqual(prompt.args[0][0][0].choices, ['one', 'two'], 'first prompt correctly identifies queue prefixes');

    assert.equal(prompt.args[1][0].length, 1, 'second prompt one question');
    assert.equal(prompt.args[1][0][0].type, 'list', 'second prompt type = list');
    assert.deepEqual(prompt.args[1][0][0].choices, [
      'Purge the dead letter queue?',
      'Return all dead messages to the work queue?',
      'Triage dead messages individually?',
      'Print out all dead messages?'
    ], 'second prompt expected actions');

    assert.equal(prompt.args[2][0].length, 1, 'third prompt one question');
    assert.equal(prompt.args[2][0][0].type, 'confirm', 'third prompt type = confirm');

    assert.equal(purge.callCount, 1, 'calls purgeQueue');
    assert.ok(purge.calledWith({ QueueUrl: 'oneDead' }), 'purges the dead letter queue');

    prompt.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] check initial prompts (single watchbot)', (assert) => {
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var purge = AWS.stub('SQS', 'purgeQueue', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

    assert.equal(prompt.callCount, 2, 'two prompts');

    assert.equal(prompt.args[0][0].length, 1, 'first prompt one question');
    assert.equal(prompt.args[0][0][0].type, 'list', 'first prompt type = list');
    assert.deepEqual(prompt.args[0][0][0].choices, [
      'Purge the dead letter queue?',
      'Return all dead messages to the work queue?',
      'Triage dead messages individually?',
      'Print out all dead messages?'
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
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var purge = AWS.stub('SQS', 'purgeQueue', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
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
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var receives = 0;
  var receive = AWS.stub('SQS', 'receiveMessage', function() {
    receives++;
    var payload = {};

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

  var send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
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
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var receive = AWS.stub('SQS', 'receiveMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
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

test('[dead-letter] individual message triage', (assert) => {
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var receive = AWS.stub('SQS', 'receiveMessage');
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

  var send = AWS.stub('SQS', 'sendMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var del = AWS.stub('SQS', 'deleteMessage', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var vis = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });

  var fetch = sinon.stub(logs, 'fetch');
  fetch.onCall(0).yields(null, [
    '[Sun, 12 Feb 2017 00:24:41 GMT] [watchbot] [a406f47b-a0f2-49a6-a159-b0f8578104bf] {"subject":"bozo","message":"message-4","receives":"1"}',
    '[Sun, 12 Feb 2017 00:24:42 GMT] [watchbot] [436d13dc-a666-44fd-a2df-70f1f4b3f107] {"subject":"bozo","message":"message-5","receives":"1"}'
  ].join('\n'));
  fetch.onCall(1).yields(null, 'final logs\n');

  dead({ stackName: 'stack', region: 'region' }, (err) => {
    assert.ifError(err, 'success');
    if (err) return assert.end();

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
    assert.ok(fetch.calledWith('oneLogs', 'message-4'), 'one fetch call based on message itself');
    assert.ok(fetch.calledWith('oneLogs', 'a406f47b-a0f2-49a6-a159-b0f8578104bf'), 'one fetch call based on original message id');

    prompt.restore();
    fetch.restore();
    AWS.CloudFormation.restore();
    AWS.SQS.restore();
    assert.end();
  });
});

test('[dead-letter] write out messages', (assert) => {
  var prompt = sinon.stub(inquirer, 'prompt');
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

  var receive = AWS.stub('SQS', 'receiveMessage');
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

  var vis = AWS.stub('SQS', 'changeMessageVisibility', function() {
    this.request.promise.returns(Promise.resolve());
  });

  dead({ stackName: 'stack', region: 'region' }, (err) => {
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
