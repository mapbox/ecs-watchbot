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
        }
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
        }
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
        }
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
    'bb8e8e7405617c973ceac2a9076ae19d',
    '762676041b682bcea049706185d13ac6',
    'fc36323938489380babaf87c56568d7f',
    '107e1fc31e0ad9b0e0d2304411596e05',
    'e7336cab2c12be8aacef9718acb7cdb5',
    '6d8e580ee61b2fcb24bb9317d212a404',
    'ea5ebf4778bd7a4b37ed63052ad252fe'
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
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'bb8e8e7405617c973ceac2a9076ae19d' }, env: { ApproximateReceiveCount: 1, exit: '0', MessageId: 'exit-0' }, outcome: 'delete', reason: 'success', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '762676041b682bcea049706185d13ac6' }, env: { ApproximateReceiveCount: 1, exit: '1', MessageId: 'exit-1' }, outcome: 'return & notify', reason: 'some container reason', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'fc36323938489380babaf87c56568d7f' }, env: { ApproximateReceiveCount: 1, exit: '2', MessageId: 'exit-2' }, outcome: 'return & notify', reason: '2', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '107e1fc31e0ad9b0e0d2304411596e05' }, env: { ApproximateReceiveCount: 1, exit: '3', MessageId: 'exit-3' }, outcome: 'delete & notify', reason: '3', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'e7336cab2c12be8aacef9718acb7cdb5' }, env: { ApproximateReceiveCount: 1, exit: '4', MessageId: 'exit-4' }, outcome: 'immediate', reason: '4', duration: 7973, pending: 5000 },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '6d8e580ee61b2fcb24bb9317d212a404' }, env: { ApproximateReceiveCount: 1, exit: '137', MessageId: 'exit-137' }, outcome: 'immediate', reason: 'CannotPullContainerError: API error (500): Get https://123456789012.dkr.ecr.us-east-1.amazonaws.com/v1/_ping: dial tcp: i/o timeout', duration: 7973, pending: 5000 }
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

util.mock('[tasks] stopIfPending - message id not in flight', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  const env = { exit: '0', MessageId: 'exit-0', ApproximateReceiveCount: 1 };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // Run the task
  tasks.run(env, function(err) {
    assert.ifError(err, 'tasks.run success');

    // Then try and stop some other random task, based on message id
    tasks.stopIfPending({ MessageId: 'not-in-flight' }, function(err, stopped) {
      assert.ifError(err, 'tasks.stopIfPending success');
      assert.notOk(stopped, 'reports that no tasks was stopped');
      tasks.stop();
      assert.end();
    });
  });
});

util.mock('[tasks] stopIfPending - describeTasks failure', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  const env = { exit: '0', MessageId: 'pending-describe-fail', ApproximateReceiveCount: 1 };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // Run the task
  tasks.run(env, function(err) {
    assert.ifError(err, 'tasks.run success');

    // Then try and stop the task, expect describeTasks to fail
    tasks.stopIfPending({ MessageId: 'pending-describe-fail' }, function(err) {
      assert.equal(err.message, 'pending-describe-fail', 'passed through error from describeTasks failure');
      assert.deepEqual(context.ecs.describeTasks, [
        { tasks: ['5452a86a162f3603a9b7b5f0d3396d40'] }
      ], 'described the task launched to process this message id');
      tasks.stop();
      assert.end();
    });
  });
});

util.mock('[tasks] stopIfPending - task is RUNNING', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  const env = { exit: '0', MessageId: 'running', ApproximateReceiveCount: 1 };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // Run the task
  tasks.run(env, function(err) {
    assert.ifError(err, 'tasks.run success');

    // Then try and stop the task, which is RUNNING
    tasks.stopIfPending({ MessageId: 'running' }, function(err, stopped) {
      assert.ifError(err, 'tasks.stopIfPending success');
      assert.notOk(stopped, 'reports that no tasks were stopped');
      assert.deepEqual(context.ecs.describeTasks, [
        { tasks: ['5328c55acbea9eb7c23336b0718f3324'] }
      ], 'described the task launched to process this message id');
      assert.deepEqual(context.ecs.stopTask, [], 'no calls to stopTask');
      tasks.stop();
      assert.end();
    });
  });
});

util.mock('[tasks] stopIfPending - task is PENDING, stopTask failure', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  const env = { exit: '0', MessageId: 'stop-task-failure', ApproximateReceiveCount: 1 };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // Run the task
  tasks.run(env, function(err) {
    assert.ifError(err, 'tasks.run success');

    // Then try and stop the task, which is PENDING, but stopTask errors
    tasks.stopIfPending({ MessageId: 'stop-task-failure' }, function(err) {
      assert.equal(err.message, 'stop-task-failure', 'passes through error from stopTask request');
      assert.deepEqual(context.ecs.describeTasks, [
        { tasks: ['9f5d92d144855210733d560d83759e11'] }
      ], 'described the task launched to process this message id');
      assert.deepEqual(context.ecs.stopTask, [
        { task: '9f5d92d144855210733d560d83759e11' }
      ], 'called stopTask on the correct task');
      tasks.stop();
      assert.end();
    });
  });
});

util.mock('[tasks] stopIfPending - task is PENDING, stopTask success', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var queueUrl = 'https://fake.us-east-1/sqs/url-for-events';
  var containerName = 'container';
  var concurrency = 10;

  const env = { exit: '0', MessageId: 'pending', ApproximateReceiveCount: 1 };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency, queueUrl);

  // Run the task
  tasks.run(env, function(err) {
    assert.ifError(err, 'tasks.run success');

    // Then try and stop the task, which is PENDING
    tasks.stopIfPending({ MessageId: 'pending' }, function(err, stopped) {
      assert.ifError(err, 'tasks.stopIfPending success');
      assert.ok(stopped, 'reports that the task was stopped');
      assert.deepEqual(context.ecs.describeTasks, [
        { tasks: ['e3278f8cf0a7f9b795d5f91d3739f72d'] }
      ], 'described the task launched to process this message id');
      assert.deepEqual(context.ecs.stopTask, [
        { task: 'e3278f8cf0a7f9b795d5f91d3739f72d' }
      ], 'called stopTask on the correct task');
      tasks.stop();
      assert.end();
    });
  });
});
