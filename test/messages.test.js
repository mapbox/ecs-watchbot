var util = require('./util');
var watchbot = require('..');
var d3 = require('d3-queue');

util.mock('[messages] poll - more than max messages to receive', function(assert) {
  var queueUrl = 'https://fake.us-east-1/sqs/url';
  var topic = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var stackName = 'test';
  var messages = watchbot.messages(queueUrl, topic, stackName);
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } },
    { MessageId: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
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
        { Subject: '[watchbot] failed job', Message: 'At ${date}, job 2 failed on ' + stackName },
        { Subject: '[watchbot] failed job', Message: 'At ${date}, job 4 failed on ' + stackName }
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
