var util = require('./util');
var watchbot = require('..');

var config = {
  NotificationTopic: 'arn:aws:sns:us-east-1:123456789:fake-topic',
  Cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
  TaskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1',
  Concurrency: '3',
  QueueUrl: 'https://fake.us-east-1/sqs/url',
  TaskEventQueueUrl: 'https://fake.us-east-1/sqs/url-for-events',
  StackName: 'watchbot-testing',
  AlarmOnEachFailure: 'true'
  // , LogLevel: 'debug'
};

util.mock('[main] message polling error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'error', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    var errorMsg = context.logs.find(function(log) {
      return /Mock SQS error/.test(log);
    });
    assert.deepEqual(context.sns.publish, [], 'sent no error notification');
    assert.ok(errorMsg, 'logged error message');
    assert.end();
  });
});

util.mock('[main] nothing to do', function(assert) {
  var context = this;

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
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
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.deepEqual(context.ecs.runTask, [
      {
        startedBy: config.StackName,
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
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.ok(context.logs.find(function(log) {
      return /Mock ECS error/.test(log);
    }), 'printed error message');

    util.collectionsEqual(assert, context.sns.publish, [
      {
        Subject: config.StackName + ' failed processing message ecs-error',
        Message: 'At ${date}, processing message ecs-error failed on ' + config.StackName + '\n\nTask outcome: return & notify\n\nTask stopped reason: Mock ECS error\n\nMessage information:\nMessageId: ecs-error\nSubject: subject1\nMessage: message1\nSentTimestamp: 10\nApproximateFirstReceiveTimestamp: 20\nApproximateReceiveCount: 1\n\nRuntime resources:\nCluster ARN: undefined\nInstance ARN: undefined\nTask ARN: undefined\n'
      }
    ], 'sent expected error notification');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: '1', VisibilityTimeout: 2 }
    ], 'expected sqs.changeMessageVisibility requests');
    assert.end();
  });
});

util.mock('[main] task running failure (out of memory)', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'ecs-failure', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.deepEqual(context.sns.publish, [], 'does not send failure notification');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: '1', VisibilityTimeout: 2 }
    ], 'expected sqs.changeMessageVisibility requests');
    assert.end();
  });
});

util.mock('[main] task running failure (unrecognized reason)', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'ecs-unrecognized', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.deepEqual(context.sns.publish, [], 'does not send failure notification');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: '1', VisibilityTimeout: 2 }
    ], 'expected sqs.changeMessageVisibility requests');
    assert.end();
  });
});

util.mock('[main] message completion error after task run failure', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'ecs-error', ReceiptHandle: 'error', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.ok(context.logs.find(function(log) {
      return /Mock ECS error/.test(log);
    }), 'printed error message');
    util.collectionsEqual(assert, context.sns.publish, [], 'sent no error notifications');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: 'error', VisibilityTimeout: 2 }
    ], 'expected sqs.changeMessageVisibility requests');
    assert.end();
  });
});

util.mock('[main] task polling error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'task-failure', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  context.sqs.eventMessages = [
    { MessageId: 'error', Attributes: { ApproximateReceiveCount: 0 } }
  ];

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, '1 ecs.runTask request');
    assert.ok(context.logs.find(function(log) {
      return /Mock SQS error/.test(log);
    }), 'printed error message');
    assert.deepEqual(context.sns.publish, [], 'sent no error notification');
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
    assert.end();
  });
});

util.mock('[main] manage messages for completed tasks', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'finish-0', ReceiptHandle: '0', Body: JSON.stringify({ Subject: 'subject0', Message: 'message0' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-2', ReceiptHandle: '2', Body: JSON.stringify({ Subject: 'subject2', Message: 'message2' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 2, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-3', ReceiptHandle: '3', Body: JSON.stringify({ Subject: 'subject3', Message: 'message3' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } },
    { MessageId: 'finish-4', ReceiptHandle: '4', Body: JSON.stringify({ Subject: 'subject4', Message: 'message4' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  context.sqs.eventMessages = context.sqs.messages.map((message) => {
    return {
      MessageId: `${message.MessageId}-event`,
      ReceiptHandle: `${message.ReceiptHandle}-event`,
      Attributes: {
        SentTimestamp: message.Attributes.SentTimestamp,
        ApproximateReceiveCount: 0
      },
      Body: JSON.stringify({
        detail: {
          clusterArn: 'cluster-arn',
          containerInstanceArn: 'instance-arn',
          taskArn: util.expectedArn(message, config.TaskDefinition, config.ContainerName, config.StackName),
          lastStatus: 'STOPPED',
          stoppedReason: message.MessageId.split('-')[1],
          overrides: {
            containerOverrides: [
              {
                environment: [
                  { name: 'MessageId', value: message.MessageId },
                  { name: 'Subject', value: JSON.parse(message.Body).Subject },
                  { name: 'Message', value: JSON.parse(message.Body).Message },
                  { name: 'SentTimestamp', value: message.Attributes.SentTimestamp },
                  { name: 'ApproximateFirstReceiveTimestamp', value: message.Attributes.ApproximateFirstReceiveTimestamp },
                  { name: 'ApproximateReceiveCount', value: message.Attributes.ApproximateReceiveCount + 1 }
                ]
              }
            ]
          },
          containers: [{ exitCode: Number(message.MessageId.split('-')[1]) }],
          startedAt: 1484155849718,
          stoppedAt: 1484155857691
        }
      })
    };
  });

  var testConfig = Object.assign({}, config, {
    Concurrency: '5',
    NotifyAfterRetries: '1'
  });

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(testConfig).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 4, 'four ecs.runTask requests');
    util.collectionsEqual(assert, context.sqs.deleteMessage, [
      { ReceiptHandle: '0-event' },
      { ReceiptHandle: '2-event' },
      { ReceiptHandle: '3-event' },
      { ReceiptHandle: '4-event' },
      { ReceiptHandle: '0' },
      { ReceiptHandle: '3' }
    ], ' sqs.deleteMessage for all event messages, and for expected job messages');
    util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
      { ReceiptHandle: '2', VisibilityTimeout: 8 },
      { ReceiptHandle: '4', VisibilityTimeout: 2 }
    ], 'expected sqs.changeMessageVisibility requests');
    util.collectionsEqual(assert, context.sns.publish, [
      {
        Subject: config.StackName + ' failed processing message finish-2',
        Message: 'At ${date}, processing message finish-2 failed on ' + config.StackName + '\n\nTask outcome: return & notify\n\nTask stopped reason: 2\n\nMessage information:\nMessageId: finish-2\nSubject: subject2\nMessage: message2\nSentTimestamp: 10\nApproximateFirstReceiveTimestamp: 20\nApproximateReceiveCount: 3\n\nRuntime resources:\nCluster ARN: cluster-arn\nInstance ARN: instance-arn\nTask ARN: 3120b788edc53b003f3ebb8afc557f07\n'
      },
      {
        Subject: config.StackName + ' failed processing message finish-3',
        Message: 'At ${date}, processing message finish-3 failed on ' + config.StackName + '\n\nTask outcome: delete & notify\n\nTask stopped reason: 3\n\nMessage information:\nMessageId: finish-3\nSubject: subject3\nMessage: message3\nSentTimestamp: 10\nApproximateFirstReceiveTimestamp: 20\nApproximateReceiveCount: 1\n\nRuntime resources:\nCluster ARN: cluster-arn\nInstance ARN: instance-arn\nTask ARN: 496a1bbc7db7ef69c5b024bed0fa66e7\n'
      }
    ], 'expected sns.publish requests');

    assert.end();
  });
});

util.mock('[main] message completion error', function(assert) {
  var context = this;

  context.sqs.messages = [
    { MessageId: 'finish-0', ReceiptHandle: 'error', Body: JSON.stringify({ Subject: 'subject0', Message: 'message0' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0, ApproximateFirstReceiveTimestamp: 20 } }
  ];

  context.sqs.eventMessages = context.sqs.messages.map((message) => {
    return {
      MessageId: `${message.MessageId}-event`,
      ReceiptHandle: `${message.ReceiptHandle}-event`,
      Attributes: {
        SentTimestamp: message.Attributes.SentTimestamp,
        ApproximateReceiveCount: 0
      },
      Body: JSON.stringify({
        detail: {
          clusterArn: 'cluster-arn',
          containerInstanceArn: 'instance-arn',
          taskArn: util.expectedArn(message, config.TaskDefinition, config.ContainerName, config.StackName),
          lastStatus: 'STOPPED',
          stoppedReason: message.MessageId.split('-')[1],
          overrides: {
            containerOverrides: [
              {
                environment: [
                  { name: 'MessageId', value: message.MessageId },
                  { name: 'Subject', value: JSON.parse(message.Body).Subject },
                  { name: 'Message', value: JSON.parse(message.Body).Message },
                  { name: 'SentTimestamp', value: message.Attributes.SentTimestamp },
                  { name: 'ApproximateFirstReceiveTimestamp', value: message.Attributes.ApproximateFirstReceiveTimestamp },
                  { name: 'ApproximateReceiveCount', value: message.Attributes.ApproximateReceiveCount + 1 }
                ]
              }
            ]
          },
          containers: [{ exitCode: Number(message.MessageId.split('-')[1]) }],
          startedAt: 1484155849718,
          stoppedAt: 1484155857691
        }
      })
    };
  });

  setTimeout(watchbot.main.end, 1800);
  watchbot.main(config).on('finish', function() {
    assert.equal(context.sqs.receiveMessage.length, 2, 'two sqs.receiveMessage requests');
    assert.equal(context.ecs.runTask.length, 1, 'one ecs.runTask requests');
    assert.equal(context.sqs.changeMessageVisibility.length, 0, 'no sqs.changeMessageVisibility requests');
    var errorMsg = context.logs.find(function(log) {
      return /Mock SQS error/.test(log);
    });
    assert.ok(errorMsg, 'logged error');
    util.collectionsEqual(assert, context.sqs.deleteMessage, [
      { ReceiptHandle: 'error' }, { ReceiptHandle: 'error-event' }
    ], 'expected sqs.deleteMessage request');

    util.collectionsEqual(assert, context.sns.publish, [], 'sent no error notifications');
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
