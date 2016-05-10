var util = require('./util');
var watchbot = require('..');

var config = {
  NotificationTopic: 'arn:aws:sns:us-east-1:123456789:fake-topic',
  Cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
  TaskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1',
  Concurrency: '3',
  QueueUrl: 'https://fake.us-east-1/sqs/url',
  StackName: 'watchbot-testing',
  ExponentialBackoff: false
};

util.mock('[main] message polling error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'error', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 0, 'no ecs.describeTasks requests');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    var errorMsg = context.logs.find(function(log) {
      return /Mock SQS error/.test(log);
    });
    assert.deepEqual(context.sns.publish, [
      {
        Subject: '[watchbot] message polling error',
        Message: 'Mock SQS error'
      }
    ], 'sent expected error notification');
    assert.ok(errorMsg, 'logged error message');
    assert.end();
  });
});

util.mock('[main] nothing to do', function(assert) {
  var context = this;

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 0, 'no ecs.describeTasks requests');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.end();
  });
});

util.mock('[main] run a task', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 1, 'one ecs.describeTasks requests');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.deepEqual(context.ecs.runTask, [
      {
        taskDefinition: config.TaskDefinition,
        overrides: {
          containerOverrides: [
            {
              name: config.ContainerName,
              environment: [
                { name: 'MessageId', value: '1' },
                { name: 'Subject', value: 'subject1' },
                { name: 'Message', value: 'message1' },
                { name: 'SentTimestamp', value: '10' },
                { name: 'ApproximateFirstReceiveTimestamp', value: '20' },
                { name: 'ApproximateReceiveCount', value: '1' }
              ]
            }
          ]
        }
      }
    ], 'expected ecs.runTask request');
    assert.end();
  });
});

util.mock('[main] task running error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'ecs-error', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 0, 'no ecs.describeTasks requests');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.ok(context.logs.find(function(log) {
      return /Mock ECS error/.test(log);
    }), 'printed error message');
    assert.deepEqual(context.sns.publish, [
      {
        Subject: '[watchbot] task running error',
        Message: 'Mock ECS error'
      }
    ], 'sent expected error notification');
    assert.end();
  });
});

util.mock('[main] task polling error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'task-failure', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 1, 'one ecs.describeTasks requests');
    assert.equal(context.sqs.receiveMessage.length, 1, 'one sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.ok(context.logs.find(function(log) {
      return /Mock ECS error/.test(log);
    }), 'printed error message');
    assert.deepEqual(context.sns.publish, [
      {
        Subject: '[watchbot] task polling error',
        Message: 'Mock ECS error'
      }
    ], 'sent expected error notification');
    assert.end();
  });
});

util.mock('[main] no free tasks', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: '1', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: '2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: '3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: '4', ReceiptHandle: '4', Body: JSON.stringify({ Subject: 'subject4', Message: 'message4' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 1, 'one sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 3, 'three ecs.runTask requests');
    util.collectionsEqual(assert, context.ecs.describeTasks, [
      {
        tasks: [
          'd346348f8c6606b943897ec992db9e7c',
          '4289315728bf67090940c910cdd32147',
          '4d576d256a4f9957fa71218c609d44ea'
        ]
      }
    ], 'expected ecs.describeTasks requests');
    assert.end();
  });
});

util.mock('[main] manage messages for completed tasks', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'finish-0', ReceiptHandle: '0', Body: JSON.stringify({ Subject: 'subject0', Message: 'message0' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-4', ReceiptHandle: '4', Body: JSON.stringify({ Subject: 'subject4', Message: 'message4' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];
  config.Concurrency = 4;
  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 1, 'one ecs.describeTasks request');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 4, 'four ecs.runTask requests');
    util.collectionsEqual(assert, context.sqs.deleteMessage, [
      { ReceiptHandle: '0' },
      { ReceiptHandle: '3' }
    ], 'expected sqs.deleteMessage requests');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: '2', VisibilityTimeout: 0 },
      { ReceiptHandle: '4', VisibilityTimeout: 0 }
    ], 'expected sqs.changeMessageVisibility requests');
    util.collectionsEqual(assert, context.sns.publish, [
      {
        Subject: '[watchbot] failed job',
        Message: 'At ${date}, job finish-2 failed on watchbot-testing'
      },
      {
        Subject: '[watchbot] failed job',
        Message: 'At ${date}, job finish-3 failed on watchbot-testing'
      }
    ], 'expected sns.publish requests');
    config.Concurrency = 3;
    assert.end();
  });
});

util.mock('[main] message completion error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'finish-0', ReceiptHandle: 'error', Body: JSON.stringify({ Subject: 'subject0', Message: 'message0' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.ecs.describeTasks.length, 1, 'one ecs.describeTasks request');
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, 'one ecs.runTask requests');
    assert.equal(context.sqs.changeMessageVisibility.length, 0, 'no sqs.changeMessageVisibility requests');
    var errorMsg = context.logs.find(function(log) {
      return /Mock SQS error/.test(log);
    });
    assert.ok(errorMsg, 'logged error');
    util.collectionsEqual(assert, context.sqs.deleteMessage, [
      { ReceiptHandle: 'error' }
    ], 'expected sqs.deleteMessage request');

    util.collectionsEqual(assert, context.sns.publish, [
      { Message: 'Mock SQS error', Subject: '[watchbot] message completion error' }
    ], 'expected sns.publish requests');
    assert.end();
  });
});

util.mock('[main] LogLevel', function(assert){
  config.LogLevel = 'debug';
  var context = this;
  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.ok(context.logs.find(function(log) {
      return /\[debug\]/.test(log);
    }), 'logs debug messages');
    delete config.LogLevel;
    assert.end();
  });
});
