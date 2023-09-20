'use strict';

const test = require('tape');
const sinon = require('sinon');
const {mockClient} = require('aws-sdk-client-mock');
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const cfMock = mockClient(CloudFormationClient);
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require("@aws-sdk/client-sqs");
const sqsMock = mockClient(SQSClient);
const watchbotDeadletter = require('../bin/dead-letter');
const inquirer = require('inquirer');
const cwlogs = require('cwlogs');
const stream = require('stream');

test('[bin.watchbot-dead-letter] stack not found', async (assert) => {
  process.argv = ['node', 'bin/whatever', '--stack-name', 'stackName', '--region', 'regionName'];
  process.argv.QueueUrl = 'https://something';
  cfMock.on(DescribeStacksCommand).resolves({ Stacks: [] });

  try {
    await watchbotDeadletter();
  } catch (err) {
    assert.equal(err.message, 'Could not find stackName in regionName', 'expected error message');
    cfMock.reset();
    assert.end();
  }
});

test('[dead-letter] individual message triage', async (assert) => {
  process.argv = ['node', 'bin/whatever', '--stack-name', 'stackName', '--region', 'regionName'];
  process.argv.QueueUrl = 'https://something';

  const logSpy = sinon.spy(console, 'log');

  const prompt = sinon.stub(inquirer, 'prompt');
  prompt.onCall(0).returns(Promise.resolve({ action: 'triage' }));
  prompt.onCall(1).returns(Promise.resolve({ action: 'replayOne' }));
  prompt.onCall(2).returns(Promise.resolve({ action: 'returnOne' }));
  prompt.onCall(3).returns(Promise.resolve({ action: 'deleteOne' }));
  prompt.onCall(4).returns(Promise.resolve({ action: 'logs' }));
  prompt.onCall(5).returns(Promise.resolve({ action: 'stop' }));
  cfMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          Outputs: [
            { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
            { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
            { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
          ]
        }
      ]
    });
  sqsMock
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: [{ MessageId: 'id-1', Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }), ReceiptHandle: 'handle-1' }]
    })
    .resolvesOnce({
      Messages: [{ MessageId: 'id-2', Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }), ReceiptHandle: 'handle-2' }]
    })
    .resolvesOnce({
      Messages: [{ MessageId: 'id-3', Body: JSON.stringify({ Subject: 'subject-3', Message: 'message-3' }), ReceiptHandle: 'handle-3' }]
    })
    .resolvesOnce({
      Messages: [{ MessageId: 'id-4', Body: JSON.stringify({ DifferentFormat: 'no-subject-or-message' }), ReceiptHandle: 'handle-4' }]
    });

  sqsMock.on(SendMessageCommand).resolves();
  sqsMock.on(DeleteMessageCommand).resolves();
  sqsMock.on(ChangeMessageVisibilityCommand).resolves();

  const fetch = sinon.stub(cwlogs, 'readable');
  let count = 0;
  const mockedCwlogs = new stream.Readable({
    read: function() {
      if (count === 0) {
        this.push([
          '[Sun, 12 Feb 2017 00:24:41 GMT] [watcher] [id-4] {"subject":"bozo","message":"message-4","receives":"1"}'
        ].join('\n'));
        count++;
      }
      if (count > 0) this.push('final log') && this.push(null);
    }
  });
  fetch.returns(mockedCwlogs);

  try {
    await watchbotDeadletter();
    assert.equal(sqsMock.commandCalls(SendMessageCommand).length, 1, 'one sendMessage request');
    assert.equal(sqsMock.commandCalls(SendMessageCommand, {
      QueueUrl: 'oneWork',
      MessageBody: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' })
    }, true).length, 1, 'returns the first message to work queue');

    console.log(logSpy);
    assert.ok(logSpy.calledWith('Message: {"Subject":"subject-1","Message":"message-1"}'));
    assert.ok(logSpy.calledWith('Message: {"Subject":"subject-2","Message":"message-2"}'));
    assert.ok(logSpy.calledWith('Message: {"Subject":"subject-3","Message":"message-3"}'));
    assert.ok(logSpy.calledWith('Message: {"DifferentFormat":"no-subject-or-message"}'), 'logs message without Subject and Message');

    assert.equal(sqsMock.commandCalls(DeleteMessageCommand).length, 2)
    assert.equal(sqsMock.commandCalls(DeleteMessageCommand, {
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-1'
    }, true).length, 1, 'deletes the first message from the dead letter queue');
    assert.equal(sqsMock.commandCalls(DeleteMessageCommand, {
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-1'
    }, true).length, 1, 'deletes the third message from the dead letter queue');

    assert.equal(sqsMock.commandCalls(ChangeMessageVisibilityCommand).length, 2, 'two changeMessageVisibility requests');
    assert.equal(sqsMock.commandCalls(ChangeMessageVisibilityCommand, {
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-2',
      VisibilityTimeout: 0
    }, true).length, 1, 'returns the second message to the dead letter queue');
    assert.equal(sqsMock.commandCalls(ChangeMessageVisibilityCommand, {
      QueueUrl: 'oneDead',
      ReceiptHandle: 'handle-4',
      VisibilityTimeout: 0
    }, true).length, 1, 'returns the fourth message to the dead letter queue');

    assert.equal(fetch.callCount, 1, 'one calls to fetch recent logs');
    assert.equals(fetch.args[0][0].pattern, 'id-4', 'one fetch call based on message id');

  } catch (err) {
    assert.ifError(err);
  } finally {
    prompt.restore();
    logSpy.restore();
    fetch.restore();
    cfMock.reset()
    sqsMock.reset()
    assert.end();
  }
});

// test('[bin.watchbot-dead-letter] check initial prompts (single watchbot)', async (assert) => {
//   const prompt = sinon.stub(inquirer, 'prompt');
//   prompt.onCall(0).returns(Promise.resolve({ action: 'purge' }));
//   prompt.onCall(1).returns(Promise.resolve({ purge: true }));

//   AWS.stub('CloudFormation', 'describeStacks', function() {
//     this.request.promise.returns(Promise.resolve({
//       Stacks: [
//         {
//           Outputs: [
//             { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
//             { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
//             { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
//           ]
//         }
//       ]
//     }));
//   });

//   const purge = AWS.stub('SQS', 'purgeQueue', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   try {
//     await watchbotDeadletter();

//     assert.equal(prompt.callCount, 2, 'two prompts');

//     assert.equal(prompt.args[0][0].type, 'list', 'first prompt type = list');
//     assert.deepEqual(prompt.args[0][0].choices, [
//       { name: 'Triage dead messages individually?', value: 'triage' },
//       { name: 'Print out all dead messages?', value: 'writeOut' },
//       { name: 'Return all dead messages to the work queue?', value: 'replay' },
//       { name: 'Purge the dead letter queue?', value: 'purge' }
//     ],
//     'first prompt expected actions');

//     assert.equal(prompt.args[1][0].type, 'confirm', 'second prompt type = confirm');

//     assert.equal(purge.callCount, 1, 'calls purgeQueue');
//     assert.ok(purge.calledWith({ QueueUrl: 'oneDead' }), 'purges the dead letter queue');

//     prompt.restore();
//     AWS.CloudFormation.restore();
//     AWS.SQS.restore();
//   } catch (err) {
//     assert.ifError(err, 'success');
//   }
//   assert.end();
// });

// test('[dead-letter] reject purge confirmation', async (assert) => {
//   const prompt = sinon.stub(inquirer, 'prompt');
//   prompt.onCall(0).returns(Promise.resolve({ action: 'purge' }));
//   prompt.onCall(1).returns(Promise.resolve({ purge: false }));

//   AWS.stub('CloudFormation', 'describeStacks', function() {
//     this.request.promise.returns(Promise.resolve({
//       Stacks: [
//         {
//           Outputs: [
//             { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
//             { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
//             { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
//           ]
//         }
//       ]
//     }));
//   });

//   const purge = AWS.stub('SQS', 'purgeQueue', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   try {
//     await watchbotDeadletter();
//     assert.equal(purge.callCount, 0, 'does not call purgeQueue');

//     prompt.restore();
//     AWS.CloudFormation.restore();
//     AWS.SQS.restore();
//     assert.end();
//   } catch (err) {
//     assert.ifError(err, 'success');
//   }
// });

// test('[dead-letter] return messages to work queue', async (assert) => {
//   const prompt = sinon.stub(inquirer, 'prompt');
//   prompt.onCall(0).returns(Promise.resolve({ action: 'replay' }));
//   prompt.onCall(1).returns(Promise.resolve({ replayAll: true }));

//   AWS.stub('CloudFormation', 'describeStacks', function() {
//     this.request.promise.returns(Promise.resolve({
//       Stacks: [
//         {
//           Outputs: [
//             { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
//             { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
//             { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
//           ]
//         }
//       ]
//     }));
//   });

//   let receives = 0;
//   const receive = AWS.stub('SQS', 'receiveMessage', function() {
//     receives++;
//     let payload = {};

//     if (receives === 1) payload = {
//       Messages: [
//         {
//           MessageId: 'id-1',
//           Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }),
//           ReceiptHandle: 'handle-1'
//         },
//         {
//           MessageId: 'id-2',
//           Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }),
//           ReceiptHandle: 'handle-2'
//         }
//       ]
//     };

//     if (receives > 1) payload = { Messages: [] };

//     this.request.promise.returns(Promise.resolve(payload));
//   });

//   const send = AWS.stub('SQS', 'sendMessage', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   const del = AWS.stub('SQS', 'deleteMessage', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   try {
//     await watchbotDeadletter();

//     assert.equal(prompt.args[1][0].type, 'confirm', 'second prompt type = confirm');

//     assert.equal(receive.callCount, 2, 'calls receiveMessage twice');
//     assert.ok(receive.alwaysCalledWith({
//       QueueUrl: 'oneDead',
//       WaitTimeSeconds: 1,
//       MaxNumberOfMessages: 10,
//       VisibilityTimeout: 600
//     }), 'reads correct queue, uses long-polling, receives up to 10, 10min timeout');

//     assert.equal(send.callCount, 2, 'calls sendMessage twice');
//     assert.ok(send.calledWith({
//       QueueUrl: 'oneWork',
//       MessageBody: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' })
//     }), 'sends one dead SQS message back to work queue');
//     assert.ok(send.calledWith({
//       QueueUrl: 'oneWork',
//       MessageBody: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' })
//     }), 'sends the other dead SQS message back to work queue');

//     assert.equal(del.callCount, 2, 'calls deleteMessage twice');
//     assert.ok(del.calledWith({
//       QueueUrl: 'oneDead',
//       ReceiptHandle: 'handle-1'
//     }), 'deletes one message from dead letter queue');
//     assert.ok(del.calledWith({
//       QueueUrl: 'oneDead',
//       ReceiptHandle: 'handle-2'
//     }), 'deletes the other message from dead letter queue');

//   } catch (err) {
//     assert.ifError(err, 'success');
//   } finally {
//     prompt.restore();
//     AWS.CloudFormation.restore();
//     AWS.SQS.restore();
//     assert.end();
//   }
// });

// test('[dead-letter] reject return messages confirmation', async (assert) => {
//   const prompt = sinon.stub(inquirer, 'prompt');
//   prompt.onCall(0).returns(Promise.resolve({ action: 'replay' }));
//   prompt.onCall(1).returns(Promise.resolve({ replayAll: false }));

//   AWS.stub('CloudFormation', 'describeStacks', function() {
//     this.request.promise.returns(Promise.resolve({
//       Stacks: [
//         {
//           Outputs: [
//             { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
//             { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
//             { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
//           ]
//         }
//       ]
//     }));
//   });

//   const receive = AWS.stub('SQS', 'receiveMessage', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   const send = AWS.stub('SQS', 'sendMessage', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   const del = AWS.stub('SQS', 'deleteMessage', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   try {
//     await watchbotDeadletter();
//     assert.equal(receive.callCount, 0, 'receives no messages');
//     assert.equal(send.callCount, 0, 'sends no messages');
//     assert.equal(del.callCount, 0, 'deletes no messages');

//   } catch (err) {
//     assert.ifError(err, 'success');
//   } finally {
//     prompt.restore();
//     AWS.CloudFormation.restore();
//     AWS.SQS.restore();
//     assert.end();
//   }
// });

// test('[dead-letter] write out messages', async (assert) => {
//   const prompt = sinon.stub(inquirer, 'prompt');
//   prompt.onCall(0).returns(Promise.resolve({ action: 'writeOut' }));

//   AWS.stub('CloudFormation', 'describeStacks', function() {
//     this.request.promise.returns(Promise.resolve({
//       Stacks: [
//         {
//           Outputs: [
//             { OutputKey: 'oneDeadLetterQueueUrl', OutputValue: 'oneDead' },
//             { OutputKey: 'oneQueueUrl', OutputValue: 'oneWork' },
//             { OutputKey: 'oneLogGroup', OutputValue: 'oneLogs' }
//           ]
//         }
//       ]
//     }));
//   });

//   const receive = AWS.stub('SQS', 'receiveMessage');
//   receive.onCall(0).returns({
//     promise: () => Promise.resolve({
//       Messages: [
//         { MessageId: 'id-1', Body: JSON.stringify({ Subject: 'subject-1', Message: 'message-1' }), ReceiptHandle: 'handle-1' },
//         { MessageId: 'id-2', Body: JSON.stringify({ Subject: 'subject-2', Message: 'message-2' }), ReceiptHandle: 'handle-2' },
//         { MessageId: 'id-3', Body: JSON.stringify({ DifferentFormat: 'no-subject-or-message' }), ReceiptHandle: 'handle-3' }
//       ]
//     })
//   });
//   receive.onCall(1).returns({
//     promise: () => Promise.resolve({})
//   });

//   const vis = AWS.stub('SQS', 'changeMessageVisibility', function() {
//     this.request.promise.returns(Promise.resolve());
//   });

//   const writeSpy = sinon.spy(process.stdout, 'write');

//   try {
//     await watchbotDeadletter();

//     assert.ok(writeSpy.calledWith('"{\\"Subject\\":\\"subject-1\\",\\"Message\\":\\"message-1\\"}"\n'), 'writes first message');
//     assert.ok(writeSpy.calledWith('"{\\"Subject\\":\\"subject-2\\",\\"Message\\":\\"message-2\\"}"\n'), 'writes second message');
//     assert.ok(writeSpy.calledWith('"{\\"DifferentFormat\\":\\"no-subject-or-message\\"}"\n'), 'write third message, without Subject or Message');

//     assert.equal(vis.callCount, 3, 'three changeMessageVisibility requests');
//     assert.ok(vis.calledWith({
//       QueueUrl: 'oneDead',
//       ReceiptHandle: 'handle-1',
//       VisibilityTimeout: 0
//     }), 'returns the first message to the dead letter queue');
//     assert.ok(vis.calledWith({
//       QueueUrl: 'oneDead',
//       ReceiptHandle: 'handle-2',
//       VisibilityTimeout: 0
//     }), 'returns the second message to the dead letter queue');
//     assert.ok(vis.calledWith({
//       QueueUrl: 'oneDead',
//       ReceiptHandle: 'handle-3',
//       VisibilityTimeout: 0
//     }), 'returns the third message to the dead letter queue');

//   } catch (err) {
//     assert.ifError(err, 'success');
//   } finally {
//     prompt.restore();
//     writeSpy.restore();
//     AWS.CloudFormation.restore();
//     AWS.SQS.restore();
//     assert.end();
//   }
// });
