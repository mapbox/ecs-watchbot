var util = require('./util');
var watchbot = require('..');
var d3 = require('d3-queue');

util.mock('[tasks] run - below concurrency', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { key: 'value' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
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
    assert.end();
  });
});

util.mock('[tasks] run - above concurrency', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 0;
  var env = [
    { name: 'error', value: 'true' }
  ];

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.message, 'Above desired concurrency', 'expected error message');
    assert.equal(err.code, 'AboveConcurrency', 'expected error code');
    assert.end();
  });
});

util.mock('[tasks] run - runTask request error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { error: 'true' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.message, 'Mock ECS error', 'ecs.runTask error passed to callback');
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (out of memory)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { resourceMemory: 'true' };
  var context = this;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (err) return assert.end(err);
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
      },
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
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (out of cpu)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { resourceCpu: 'true' };
  var context = this;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (err) return assert.end(err);
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
      },
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
    ], 'expected runTask requestss');
    assert.end();
  });
});

util.mock('[tasks] run - runTask failure (unrecognized reason)', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { failure: 'true' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (!err) return assert.end('should have failed');
    assert.equal(err.code, 'NotRun', 'ecs.runTask failure passed to callback');
    assert.end();
  });
});

util.mock('[tasks] poll - no tasks in progress', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.poll(function(err, taskStatus) {
    if (err) return assert.end(err);
    assert.equal(taskStatus.free, 10, 'reports 10 free tasks');
    assert.deepEqual(context.ecs.describeTasks.length, 0, 'no ecs.describeTasks requests');
    assert.end();
  });
});

util.mock('[tasks] poll - one of each outcome', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var envs = [
    { exit: '0', MessageId: 'exit-0', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: '1', MessageId: 'exit-1', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: '2', MessageId: 'exit-2', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: '3', MessageId: 'exit-3', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: '4', MessageId: 'exit-4', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: 'mismatch', MessageId: 'exit-mismatch', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: 'match', MessageId: 'exit-match', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: 'pending', MessageId: 'pending', ApproximateReceiveCount: 1, NotifyAfterRetries: 1 },
    { exit: '4', MessageId: 'exit-4b', ApproximateReceiveCount: 4, NotifyAfterRetries: 3 }
  ];
  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  var queue = d3.queue();

  envs.forEach(function(env) {
    queue.defer(tasks.run, env);
  });

  queue.awaitAll(function(err) {
    if (err) return assert.end(err);

    tasks.poll(function(err, taskStatus) {
      if (err) return assert.end(err);

      assert.deepEqual(context.ecs.config, {
        region: 'us-east-1',
        params: { cluster: cluster }
      }, 'ecs client initialized properly');

      // expected task ARNs are md5sums of request properties, see util.mock
      util.collectionsEqual(assert, context.ecs.describeTasks, [
        {
          tasks: [
            '4ca83fd4c7e2d10ceda920b826063fc3',
            '495423f1a89b0e5d780561699bf0dce5',
            '49447c1f973ea2a3cb8c0cfb51f7956a',
            '4c1dd2ab214a2a2a75f613233bfb9705',
            'edfa90b62f9fbbb38d64e783af52b5b0',
            '172fa66e32880775cbee01517041230a',
            'ad2f5ed217a07800770c07d23cff6118',
            '9ef2cce83188ac78127e84e756b042ac',
            '39b47d9e1b57136f138424d414dc1f4b'
          ]
        }
      ], 'expected ecs.describeTasks request');

      util.collectionsEqual(assert, taskStatus, [
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '4ca83fd4c7e2d10ceda920b826063fc3' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: '0', MessageId: 'exit-0' }, outcome: 'delete', reason: '0' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '495423f1a89b0e5d780561699bf0dce5' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: '1', MessageId: 'exit-1' }, outcome: 'return & notify', reason: '1' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '49447c1f973ea2a3cb8c0cfb51f7956a' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: '2', MessageId: 'exit-2' }, outcome: 'return & notify', reason: '2' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '4c1dd2ab214a2a2a75f613233bfb9705' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: '3', MessageId: 'exit-3' }, outcome: 'delete & notify', reason: '3' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'edfa90b62f9fbbb38d64e783af52b5b0' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: '4', MessageId: 'exit-4' }, outcome: 'immediate', reason: '4' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '172fa66e32880775cbee01517041230a' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: 'mismatch', MessageId: 'exit-mismatch' }, outcome: 'return & notify', reason: 'mismatched' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: 'ad2f5ed217a07800770c07d23cff6118' }, env: { ApproximateReceiveCount: 1, NotifyAfterRetries: 1, exit: 'match', MessageId: 'exit-match' }, outcome: 'delete', reason: 'match' },
        { arns: { cluster: 'cluster-arn', instance: 'instance-arn', task: '39b47d9e1b57136f138424d414dc1f4b' }, env: { ApproximateReceiveCount: 4, MessageId: 'exit-4b', NotifyAfterRetries: 3, exit: '4' }, outcome: 'return & notify', reason: '4' }
      ], 'expected taskStatus reported');

      assert.equal(taskStatus.free, 9, 'correctly reports free workers');

      assert.end();
    });
  });
});

util.mock('[tasks] poll - describeTasks error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 10;
  var env = { exit: 'error' };

  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  tasks.run(env, function(err) {
    if (err) return assert.end(err);

    tasks.poll(function(err) {
      if (!err) return assert.end('should have failed');
      assert.equal(err.message, 'Mock ECS error', 'ecs.describeTasks error passed to callback');
      assert.end();
    });
  });
});

util.mock('[tasks] poll - more than 100 in flight', function(assert) {
  var context = this;
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var containerName = 'container';
  var concurrency = 200;
  var envs = [];
  for (var i = 0; i < 115; i++) envs.push({ exit: '0', MessageId: 'exit-0', iAm: i.toString() });
  var tasks = watchbot.tasks(cluster, taskDef, containerName, concurrency);
  var queue = d3.queue();

  envs.forEach(function(env) {
    queue.defer(tasks.run, env);
  });

  queue.awaitAll(function(err) {
    if (err) return assert.end(err);

    tasks.poll(function(err, taskStatus) {
      if (err) return assert.end(err);

      assert.equal(context.ecs.describeTasks[0].tasks.length, 100, '100 at a time');
      assert.equal(context.ecs.describeTasks[1].tasks.length, 15, 'gotta catch em all');
      assert.equal(taskStatus.free, 200, 'correctly reports free workers');

      assert.end();
    });
  });
});
