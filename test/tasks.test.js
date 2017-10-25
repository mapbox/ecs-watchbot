var util = require('./util');
var watchbot = require('..');
var d3 = require('d3-queue');

util.mock('[tasks] run - below concurrency', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { key: 'value' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.run(env, function(err) {
    if (err) return assert.end(err);
    assert.deepEqual(context.ecs.config, {
      region: 'us-east-1',
      params: { cluster: cluster }
    }, 'ecs client initialized properly');
    util.collectionsEqual(assert, context.ecs.runTask, [
      {
        startedBy: 'watchbot',
        taskDefinition: taskDef,
        overrides: {
          containerOverrides: [
            {
              name: containerName,
              environment: [
                { name: 'key', value: 'value' }
              ]
            }
          ]
        },
        placementStrategy: [
          {
            field: 'instanceId',
            type: 'spread'
          }
        ]
      }
    ], 'expected runTask request');

    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - startedBy truncation', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { key: 'value' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl, '1234567890123456789012345678901234567890');
  tasks.run(env, function(err) {
    if (err) return assert.end(err);
    assert.deepEqual(context.ecs.config, {
      region: 'us-east-1',
      params: { cluster: cluster }
    }, 'ecs client initialized properly');
    assert.equal(context.ecs.runTask[0].startedBy, '123456789012345678901234567890123456', 'startedBy truncated to 36 characters');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - above concurrency', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 0;
  var env = [
    { name: 'error', value: 'true' }
  ];

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.message, 'Above desired concurrency', 'expected error message');
    assert.equal(err.code, 'AboveConcurrency', 'expected error code');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - runTask request error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { error: 'true' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.message, 'Mock ECS error', 'ecs.runTask error passed to callback');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (out of memory)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { resourceMemory: 'true' };
  var context = this;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.run(env, function(err) {
    assert.equal(err.toString(), 'Error: RESOURCE:MEMORY');
    assert.equal(err.code, 'NotRun');
    assert.equal(context.ecs.resourceFail, 1, 'retried runTask request when cluster out of memory');
    util.collectionsEqual(assert, context.ecs.runTask, [
      {
        startedBy: 'watchbot',
        taskDefinition: taskDef,
        overrides: {
          containerOverrides: [
            {
              name: containerName,
              environment: [{ name: 'resourceMemory', value: 'true' }]
            }
          ]
        },
        placementStrategy: [
          {
            field: 'instanceId',
            type: 'spread'
          }
        ]
      }
    ], 'expected runTask requestss');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (out of cpu)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { resourceCpu: 'true' };
  var context = this;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  tasks.run(env, function(err) {
    assert.equal(err.toString(), 'Error: RESOURCE:CPU');
    assert.equal(err.code, 'NotRun');
    assert.equal(context.ecs.resourceFail, 1, 'retried runTask request when cluster out of cpu');
    util.collectionsEqual(assert, context.ecs.runTask, [
      {
        startedBy: 'watchbot',
        taskDefinition: taskDef,
        overrides: {
          containerOverrides: [
            {
              name: containerName,
              environment: [{ name: 'resourceCpu', value: 'true' }]
            }
          ]
        },
        placementStrategy: [
          {
            field: 'instanceId',
            type: 'spread'
          }
        ]
      }
    ], 'expected runTask requests');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (unrecognized reason)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;
  var env = { failure: 'true' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.code, 'NotRun', 'ecs.runTask failure passed to callback');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] poll - no tasks in progress', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.poll(function(err, taskStatus) {
    if (err) return assert.end(err);
    assert.equal(taskStatus.free, 10, 'reports 10 free tasks');
    assert.deepEqual(context.ecs.describeTasks.length, 0, 'no ecs.describeTasks requests');
    tasks.stop();
    assert.end();
  });
});

util.mock('[tasks] poll - one of each outcome', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  // pretend that we received some work messages and parsed these envs
  var envs = [
    { exit: '0', MessageId: 'exit-0', ApproximateReceiveCount: 1 },
    { exit: '1', MessageId: 'exit-1', ApproximateReceiveCount: 1 },
    { exit: '2', MessageId: 'exit-2', ApproximateReceiveCount: 1 },
    { exit: '3', MessageId: 'exit-3', ApproximateReceiveCount: 1 },
    { exit: '4', MessageId: 'exit-4', ApproximateReceiveCount: 1 },
    { exit: '137', MessageId: 'exit-137', ApproximateReceiveCount: 1 },
    { exit: 'pending', MessageId: 'pending', ApproximateReceiveCount: 1 }
  ];

  // expected task ARNs are md5sums of runtask request properties, see util.mock
  var expectedArns = [
    '09de63101b6ebba4163cf72d8e1f7943',
    '4944116e9b2d72dcc1fa2c71e8950c87',
    'a849c0f9ac9539a71241dac90ec0119a',
    'f55b9147b0e1f75e696cc1ba7df927b9',
    '23daa29d2d5cea7a1861de444a740073',
    'c9847c9995920e0a2c8c57c0ff9ba0a6',
    'e4a657dbc6661a36c02ee4a20a469bd6'
  ];

  // setup SQS messages in the task event SQS queue
  context.sqs.eventMessages = envs.map((env, i) => {
    var message = {
      MessageId: i.toString() + '-event',
      ReceiptHandle: i.toString() + '-event',
      Attributes: {
        SentTimestamp: 10,
        ApproximateReceiveCount: 1
      }
    };

    message.Body = JSON.stringify({
      detail: {
        clusterArn: 'cluster-arn',
        containerInstanceArn: 'instance-arn',
        taskArn: expectedArns[i],
        lastStatus: 'STOPPED',
        stoppedReason: env.exit,
        overrides: { containerOverrides: [{ environment: Object.keys(env).map((key) => ({ name: key, value: env[key] })) }] },
        containers: [
          {
            exitCode: Number(env.exit),
            reason: env.exit === '1' ?
              'some container reason' : env.exit === '137' ?
              'CannotPullContainerError: API error (500): Get https://123456789012.dkr.ecr.us-east-1.amazonaws.com/v1/_ping: dial tcp: i/o timeout' : undefined
          }
        ],
        createdAt: 1484155844718,
        startedAt: 1484155849718,
        stoppedAt: 1484155857691
      }
    });

    return message;
  }).slice(0, 6); // drop one off the list because it hasn't finished yet

  // Add an additional message that should get ignored & returned to SQS
  context.sqs.eventMessages.push({
    MessageId: 'brother-from-another-mother',
    ReceiptHandle: 'additional-event',
    Attributes: {
      SentTimestamp: 10,
      ApproximateReceiveCount: 1
    },
    Body: JSON.stringify({
      detail: {
        clusterArn: 'cluster-arn',
        containerInstanceArn: 'instance-arn',
        taskArn: 'hibbity-haw',
        lastStatus: 'STOPPED',
        stoppedReason: 'cuz a feel like it',
        overrides: { containerOverrides: [{ environment: [] }] },
        containers: [{ exitCode: 0 }],
        createdAt: 1484155844718,
        startedAt: 1484155849718,
        stoppedAt: 1484155857691
      }
    })
  });

  // Starting the tasks client will start polling SQS. The TaskStateCache backlogs
  // finishedTask items.
  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // First we run the tasks based on the evns that were parsed from pretend work messages
  var queue = d3.queue();

  envs.forEach(function(env) {
    queue.defer(tasks.run, env);
  });

  queue.awaitAll(function(err) {
    if (err) return assert.end(err);
    // gives TaskStateCache time to poll SQS, then ask for results
    setTimeout(poll, 500);
  });

  function poll() {
    tasks.poll(function(err, taskStatus) {
      if (err) return assert.end(err);

      assert.deepEqual(context.ecs.config, {
        region: 'us-east-1',
        params: { cluster: cluster }
      }, 'ecs client initialized properly');

      var expectedTaskStatus = [
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '09de63101b6ebba4163cf72d8e1f7943' }, env: { ApproximateReceiveCount: 1, exit: '0', MessageId: 'exit-0' }, outcome: 'delete', reason: 'success', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '4944116e9b2d72dcc1fa2c71e8950c87' }, env: { ApproximateReceiveCount: 1, exit: '1', MessageId: 'exit-1' }, outcome: 'return & notify', reason: 'some container reason', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'a849c0f9ac9539a71241dac90ec0119a' }, env: { ApproximateReceiveCount: 1, exit: '2', MessageId: 'exit-2' }, outcome: 'return & notify', reason: '2', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'f55b9147b0e1f75e696cc1ba7df927b9' }, env: { ApproximateReceiveCount: 1, exit: '3', MessageId: 'exit-3' }, outcome: 'delete & notify', reason: '3', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '23daa29d2d5cea7a1861de444a740073' }, env: { ApproximateReceiveCount: 1, exit: '4', MessageId: 'exit-4' }, outcome: 'immediate', reason: '4', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'c9847c9995920e0a2c8c57c0ff9ba0a6' }, env: { ApproximateReceiveCount: 1, exit: '137', MessageId: 'exit-137' }, outcome: 'immediate', reason: 'CannotPullContainerError: API error (500): Get https://123456789012.dkr.ecr.us-east-1.amazonaws.com/v1/_ping: dial tcp: i/o timeout', duration: 7973, pending: 5000 }
      ];
      expectedTaskStatus.free = 9;

      util.collectionsEqual(assert, taskStatus, expectedTaskStatus, 'expected taskStatus reported');

      assert.equal(taskStatus.free, 9, 'correctly reports free workers');

      // Check that messages were removed from the event queue
      util.collectionsEqual(assert, context.sqs.deleteMessage, [
        { ReceiptHandle: '0-event' },
        { ReceiptHandle: '1-event' },
        { ReceiptHandle: '2-event' },
        { ReceiptHandle: '3-event' },
        { ReceiptHandle: '4-event' },
        { ReceiptHandle: '5-event' }
      ], 'removes SQS messages for completed task events');

      // Check that another watcher's message was returned to the queue
      util.collectionsEqual(assert, context.sqs.changeMessageVisibility, [
        { ReceiptHandle: 'additional-event', VisibilityTimeout: 0 }
      ], 'returns SQS messages for other watcher\'s task events');

      // Finally, poll for tasks again and confirm that the TaskStateCache was cleared
      tasks.poll(function(err, shouldBeEmpty) {
        if (err) return assert.end(err);
        assert.equal(shouldBeEmpty.length, 0, 'TaskStateCache was cleared');
        assert.equal(taskStatus.free, 9, 'correctly reports free workers');
        tasks.stop();
        assert.end();
      });
    });
  }
});

util.mock('[tasks] poll - SQS error', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  context.sqs.eventMessages = [
    { MessageId: 'error', ReceiptHandle: '1', Body: JSON.stringify({ Subject: 'subject1', Message: 'message1' }), Attributes: { SentTimestamp: 10, ApproximateReceiveCount: 0 } }
  ];

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);
  tasks.on('error', function(err) {
    assert.equal(err.message, 'Mock SQS error', 'emits error events for SQS polling problems');
    tasks.stop();
    assert.end();
  });
});
