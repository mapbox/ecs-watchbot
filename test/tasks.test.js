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
  var env = { resources: 'true' };
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
              environment: [{ name: 'resources', value: 'true' }]
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
              environment: [{ name: 'resources', value: 'true' }]
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
    { exit: '0', MessageId: 'exit-0' },
    { exit: '1', MessageId: 'exit-1' },
    { exit: '2', MessageId: 'exit-2' },
    { exit: '3', MessageId: 'exit-3' },
    { exit: '4', MessageId: 'exit-4' },
    { exit: 'mismatch', MessageId: 'exit-mismatch' },
    { exit: 'match', MessageId: 'exit-match' },
    { exit: 'pending', MessageId: 'pending' }
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
            '51132ba12780cd8e8ca20f2b370014a7',
            '3b173b3134d614ddacb14a1cbd5c404f',
            'e084e0cd00585de1ab8ed22f9572b81a',
            '3168cb93242f95b0e63aaca9605b9681',
            '21650064140c25de55653663f6cb3be1',
            '056e67721ac63a57e291dac9d5302787',
            '66f3dbb2f4f36c060a47d23bab3ddf7e',
            '03089b80274750892c1528c2d317f5a8'
          ]
        }
      ], 'expected ecs.describeTasks request');

      util.collectionsEqual(assert, taskStatus, [
        { reason: '0', env: { exit: '0', MessageId: 'exit-0' }, outcome: 'delete' },
        { reason: '1', env: { exit: '1', MessageId: 'exit-1' }, outcome: 'return & notify' },
        { reason: '2', env: { exit: '2', MessageId: 'exit-2' }, outcome: 'return & notify' },
        { reason: '3', env: { exit: '3', MessageId: 'exit-3' }, outcome: 'delete & notify' },
        { reason: '4', env: { exit: '4', MessageId: 'exit-4' }, outcome: 'immediate' },
        { reason: 'match', env: { exit: 'match', MessageId: 'exit-match' }, outcome: 'delete' },
        { reason: 'mismatched', env: { exit: 'mismatch', MessageId: 'exit-mismatch' }, outcome: 'return & notify' }
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
