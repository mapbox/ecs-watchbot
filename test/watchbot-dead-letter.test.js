'use strict';

var test = require('tape');
var sinon = require('sinon');
var AWS = require('@mapbox/mock-aws-sdk-js');
var dead = require('../bin/watchbot-dead-letter');
var inquirer = require('inquirer');
var logs = require('../lib/Logger');

test('[dead-letter] constructor', (assert) => {

  assert.throws(
    () => new DeadLetter({ workerOptions: {} }),
    /Missing options: queueUrl/,
    'throws for missing queueUrl option'
  );

  const options = {
    queueUrl: 'https://queue.url',
		DeadLetterQueueUrl: 'https://dead-letter.url',
		Logs: 'https://watchbot-logs.url',
  };
  const DeadLetter = new DeadLetter(options);

  assert.equal(DeadLetter.queueUrl, options.queueUrl, 'sets .queueUrl');
  assert.equal(DeadLetter.DeadLetterQueueUrl, options.DeadLetterQueueUrl, 'sets .deadletterqueueUrl');
  assert.equal(DeadLetter.queueUrl, options.queueUrl, 'sets .logs');
  assert.end();
});


test('[dead-letter] proper client setup & stack description', (assert) => {

	const deadletter = new DeadLetter({
		queueUrl: 'https://queue.url',
		DeadLetterQueueUrl: 'https://dead-letter.url',
	  Logs: 'https://watchbot-logs.url',
	})
  var desc = AWS.stub('CloudFormation', 'describeStacks', function() {
    this.request.promise.returns(Promise.reject(new Error('bail')));
  });

  AWS.stub('SQS', 'purgeQueue');

  dead({ stackName: 'stack', region: 'region' }, (err) => {

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
