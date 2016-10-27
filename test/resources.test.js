var util = require('./util');
var watchbot = require('..');

util.mock('[resources] describeTaskDefinition error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  context.ecs.failTask = true;

  watchbot.resources(cluster, taskDef)
    .on('error', function(err) {
      assert.equal(err.message, 'Mock ECS error', 'expected error emitted');
      assert.end();
    });
});

util.mock('[resources] listInstances error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  context.ecs.failInstances = true;

  watchbot.resources(cluster, taskDef)
    .on('error', function(err) {
      assert.equal(err.message, 'Mock ECS error', 'expected error emitted');
      assert.end();
    });
});

util.mock('[resources] listInstances pagination', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  context.ecs.instances = [
    'arn:aws:ecs:us-east-1:1234567890:some/fake0',
    'arn:aws:ecs:us-east-1:1234567890:some/fake1'
  ];

  var resources = watchbot.resources(cluster, taskDef);

  setTimeout(function() {
    assert.deepEqual(resources.status.instances, context.ecs.instances, 'returned all instances');
    assert.end();
  }, 1000);
});

util.mock('[resources] availableInstances', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  var resources = watchbot.resources(cluster, taskDef).on('HasInstances', function() {
    assert.pass('emitted hasInstances event');
    assert.end();
  });
});

util.mock('[resources] availableInstances error', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  context.ecs.fail = true;

  watchbot.resources(cluster, taskDef)
    .on('error', function(err) {
      assert.equal(err.message, 'Mock ECS error', 'expected error emitted');
      assert.end();
    });
});

util.mock('[resources] update error: no instances', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';
  var context = this;

  context.ecs.instances = [];

  watchbot.resources(cluster, taskDef)
    .on('error', function(err) {
      assert.equal(err, 'No instances found in the cluster', 'expected error emitted');
      assert.end();
    });
});

util.mock('[resources] available', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';

  var resources = watchbot.resources(cluster, taskDef).on('update', function() {
    assert.pass('emitted update event');
  });

  resources.available(function(err) {
    if (err) assert.end(err);

    assert.deepEqual(resources.status, {
      instances: ['arn:aws:ecs:us-east-1:1234567890:some/fake'],
      availableInstances: [
        {
          registeredResources: [
            { integerValue: 100, name: 'CPU' },
            { integerValue: 100, name: 'MEMORY' }
          ],
          remainingResources: [
            { integerValue: 100, name: 'CPU' },
            { integerValue: 100, name: 'MEMORY' }
          ]
        }
      ],
      registered: { cpu: 100, memory: 100 },
      available: { cpu: 100, memory: 100 },
      required: { cpu: 0, memory: 5 }
    }, 'collected expected resource info');

    assert.end();
  });
});

util.mock('[resources] adequate', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var taskDef = 'arn:aws:ecs:us-east-1:123456789012:task-definition/fake:1';

  var resources = watchbot.resources(cluster, taskDef);

  resources.available(function(err) {
    if (err) return assert.end(err);

    assert.ok(resources.adequate(10), 'adequate resources for 10 tasks');
    assert.notOk(resources.adequate(100), 'inadequate resources for 100 tasks');
    assert.end();
  });
});
