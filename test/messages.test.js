var util = require('./util');
var watchbot = require('..');
var d3 = require('d3-queue');
var cwlogs = require('cwlogs');
var stream = require('stream');
var sinon = require('sinon');

util.mock('[messages] poll - more than max messages to receive', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  messages.poll(2, function(err, envs) {
    if (err) return assert.end(err);
    assert.deepEqual(context.sqs.config, {
      region: 'us-east-1',
      params: { QueueUrl: queueUrl }
    }, 'sqs client initialized properly');
    assert.deepEqual(context.sqs.receiveMessage, [
      {
        AttributeNames: [
          'SentTimestamp',
          'ApproximateFirstReceiveTimestamp',
          'ApproximateReceiveCount'
        ],
        WaitTimeSeconds: 20,
        MaxNumberOfMessages: 2
      }
    ], 'expected receiveMessage request');
    assert.deepEqual(envs, [
      {
        MessageId: '1',
        Subject: 'subject1',
        Message: 'message1',
        SentTimestamp: '10',
        ApproximateFirstReceiveTimestamp: '20',
        ApproximateReceiveCount: '1'
      },
      {
        MessageId: '2',
        Subject: 'subject2',
        Message: 'message2',
        SentTimestamp: '10',
        ApproximateFirstReceiveTimestamp: '20',
        ApproximateReceiveCount: '1'
      }
    ], 'found expected messages and converted to task envs');
    assert.end();
  });
});

util.mock('[messages] poll - no messages to receive', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  messages.poll(1, function(err, envs) {
    if (err) return assert.end(err);
    assert.deepEqual(context.sqs.config, {
      region: 'us-east-1',
      params: { QueueUrl: queueUrl }
    }, 'sqs client initialized properly');
    assert.deepEqual(context.sqs.receiveMessage, [
      {
        AttributeNames: [
          'SentTimestamp',
          'ApproximateFirstReceiveTimestamp',
          'ApproximateReceiveCount'
        ],
        WaitTimeSeconds: 20,
        MaxNumberOfMessages: 1
      }
    ], 'expected receiveMessage requests');
    assert.deepEqual(envs, [], 'empty envs array returned');
    assert.end();
  });
});

util.mock('[messages] poll - message still processing', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;
  var msg = { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } };
  context.sqs.messages = [JSON.parse(JSON.stringify(msg))];

  // receive the message once
  messages.poll(1, function(err) {
    if (err) return assert.end(err);

    // receive the same message again, with a new handle
    context.sqs.messages = [JSON.parse(JSON.stringify(msg))];
    context.sqs.messages[0].ReceiptHandle = '2';
    messages.poll(1, function(err) {
      if (err) return assert.end(err);

      // complete the message
      messages.complete({ reason: 'success', env: { MessageId: '1' }, outcome: 'delete' }, function(err) {
        if (err) return assert.end(err);

        // complete the message a second time
        messages.complete({ reason: 'success', env: { MessageId: '1' }, outcome: 'delete' }, function(err) {
          if (err) return assert.end(err);

          assert.deepEqual(context.sqs.deleteMessage, [
            { ReceiptHandle: '2' }
          ], 'deleted the message using most recent handle');

          assert.end();
        });
      });
    });
  });

});

util.mock('[messages] poll - receiveMessage error', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  context.sqs.messages = [
    { MessageId: 'error', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  messages.poll(4, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.message, 'Mock SQS error', 'sqs.receiveMessage error passed to callback');
    assert.end();
  });
});

util.mock('[messages] complete - no backoff', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '4', ReceiptHandle: '4', Body: JSON.stringify({ Subject: 'subject4', Message: 'message4' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'success',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'delete'
      },
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'fail',
        env: {
          MessageId: '2',
          Subject: 'subject2',
          Message: 'message2',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'delete & notify'
      },
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'noop',
        env: {
          MessageId: '3',
          Subject: 'subject3',
          Message: 'message3',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return'
      },
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'retry',
        env: {
          MessageId: '4',
          Subject: 'subject4',
          Message: 'message4',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      assert.deepEqual(context.sqs.config, {
        region: 'us-east-1',
        params: { QueueUrl: queueUrl }
      }, 'sqs client initialized properly');
      assert.deepEqual(context.sns.config, {
        region: 'us-east-1',
        params: { TopicArn: topic }
      }, 'sns client initialized properly');
      util.collectionsEqual(assert, context.sqs.deleteMessage, [
        { ReceiptHandle: '1' }, { ReceiptHandle: '2' }
      ], 'expected messages deleted');
      util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
        { ReceiptHandle: '3', VisibilityTimeout: 0 },
        { ReceiptHandle: '4', VisibilityTimeout: 0 }
      ], 'expected messages returned to queue');
      util.collectionsEqual(assert, context.sns.publish, [
        {
          Subject: stackName + ' failed processing message 2',
          Message: 'At ${date}, processing message 2 failed on ' + stackName + '\n\nTask outcome: delete & notify\n\nTask stopped reason: fail\n\nMessage information:\nMessageId: 2\nSubject: subject2\nMessage: message2\nSentTimestamp: 10\nApproximateFirstReceiveTimestamp: 20\nApproximateReceiveCount: 1\n\nRuntime resources:\nCluster ARN: cluster-arn\nInstance ARN: instance-arn\nTask ARN: task-arn\n'
        },
        {
          Subject: stackName + ' failed processing message 4',
          Message: 'At ${date}, processing message 4 failed on ' + stackName + '\n\nTask outcome: return & notify\n\nTask stopped reason: retry\n\nMessage information:\nMessageId: 4\nSubject: subject4\nMessage: message4\nSentTimestamp: 10\nApproximateFirstReceiveTimestamp: 20\nApproximateReceiveCount: 1\n\nRuntime resources:\nCluster ARN: cluster-arn\nInstance ARN: instance-arn\nTask ARN: task-arn\n'
        }
      ], 'expected notifications sent');
      assert.end();
    });
  });
});

util.mock('[messages] complete - with backoff', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName, true);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '4', ReceiptHandle: '4', Body: JSON.stringify({ Subject: 'subject4', Message: 'message4' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'noop',
        env: {
          MessageId: '3',
          Subject: 'subject3',
          Message: 'message3',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return'
      },
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'retry',
        env: {
          MessageId: '4',
          Subject: 'subject4',
          Message: 'message4',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
        { ReceiptHandle: '3', VisibilityTimeout: 2 },
        { ReceiptHandle: '4', VisibilityTimeout: 2 }
      ], 'expected messages returned to queue with backoff');
      assert.end();
    });
  });
});

util.mock('[messages] complete - message not found in sqs', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: 'missing', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '2', ReceiptHandle: 'missing', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'noop',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return'
      },
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'success',
        env: {
          MessageId: '2',
          Subject: 'subject2',
          Message: 'message2',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'delete'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      util.collectionsEqual(assert, context.sqs.deleteMessage, [
        { ReceiptHandle: 'missing' }
      ], 'expected messages deleted');
      util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
        { ReceiptHandle: 'missing', VisibilityTimeout: 0 }
      ], 'expected messages returned to queue');
      assert.end();
    });
  });
});

util.mock('[messages] complete - message cannot backoff anymore', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName, true);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: 'missing', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 14, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'noop',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '15'
        },
        outcome: 'return'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [], 'message allowed to timeout');
      assert.end();
    });
  });
});

util.mock('[messages] complete - stack name is long', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-';
  var messages = watchbot.messages(queueUrl, topic, stackName, true);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 1, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'failed',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      assert.equal(context.sns.publish.length, 1, 'one notification sent', 'subject was shortened');
      assert.equal(context.sns.publish[0].Subject, stackName + ' failed task');
      assert.end();
    });
  });
});

util.mock('[messages] complete - stack name is way too long', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-test-';
  var messages = watchbot.messages(queueUrl, topic, stackName, true);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 1, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'failed',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      assert.equal(context.sns.publish.length, 1, 'one notification sent');
      assert.equal(context.sns.publish[0].Subject, 'Watchbot task failure: 1', 'subject was shortened');
      assert.end();
    });
  });
});

util.mock('[messages] complete - notification contains log snippet', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var context = this;
  var logGroupArn = 'arn:aws:logs:eu-west-1:123456789012:log-group:some-log-group:*';
  var logs = 'oh snap it broke!\n';

  var messages = watchbot.messages(queueUrl, topic, stackName, true, logGroupArn);

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 1, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  // mock the command to read logs underlaying watchbot.fetch
  sinon.stub(cwlogs, 'readable', function(options) {
    assert.equal(options.group, 'some-log-group', 'created cwlogs client with expected log group');
    assert.equal(options.region, 'eu-west-1', 'created cwlogs client with expected region');

    var readable = new stream.Readable();
    readable._read = function() {
      readable.push(logs);
      readable.push(null);
    };

    return readable;
  });

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'failed',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      if (err) return assert.end(err);

      // make assertions
      assert.equal(context.sns.publish.length, 1, 'one notification sent');

      var notification = context.sns.publish[0].Message;
      var expected = new RegExp('Recent logs:\n' + logs.trim());
      assert.ok(expected.test(notification), 'log snippet included in notification');
      cwlogs.readable.restore();
      assert.end();
    });
  });
});

util.mock('[messages] complete - failure to read CloudWatch logs', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var context = this;
  var logGroupArn = 'arn:aws:logs:eu-west-1:123456789012:log-group:some-log-group:*';

  var messages = watchbot.messages(queueUrl, topic, stackName, true, logGroupArn);

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 1, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  // mock the command to read logs underlaying watchbot.fetch
  sinon.stub(cwlogs, 'readable', function() {
    var readable = new stream.Readable();
    readable._read = function() {
      readable.emit('error', new Error('oh snap!'));
    };

    return readable;
  });

  // first poll in order to get the messages in flight
  messages.poll(4, function(err) {
    if (err) return assert.end(err);

    // Then generate fake finishedTask objects for each message
    var finishedTasks = [
      {
        arns: {
          cluster: 'cluster-arn',
          instance: 'instance-arn',
          task: 'task-arn'
        },
        reason: 'failed',
        env: {
          MessageId: '1',
          Subject: 'subject1',
          Message: 'message1',
          SentTimestamp: '10',
          ApproximateFirstReceiveTimestamp: '20',
          ApproximateReceiveCount: '1'
        },
        outcome: 'return & notify'
      }
    ];

    // complete each finishedTask
    var queue = d3.queue();
    finishedTasks.forEach(function(finishedTask) {
      queue.defer(messages.complete, finishedTask);
    });
    queue.awaitAll(function(err) {
      assert.equal(err.message, 'oh snap!', 'cwlogs error passed through to callback');
      cwlogs.readable.restore();
      assert.end();
    });
  });
});
