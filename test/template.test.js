var test = require('tape');
var watchbot = require('..');
var cf = require('cloudfriend');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');

var pkg = require(path.resolve(__dirname, '..', 'package.json'));
var version = pkg.version;

test('[template] bare-bones, all defaults, no references', function(assert) {
  var watch = watchbot.template({
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256'
  });

  assert.notOk(watch.Resources.WatchbotUser, 'user');
  assert.notOk(watch.Resources.WatchbotUserKey, 'user key');
  assert.notOk(watch.Resources.WatchbotWebhookApi, 'api');
  assert.notOk(watch.Resources.WatchbotWebhookDeployment, 'deployment');
  assert.notOk(watch.Resources.WatchbotWebhookMethod, 'method');
  assert.notOk(watch.Resources.WatchbotWebhookResource, 'resource');
  assert.notOk(watch.Resources.WatchbotWebhookFunctionRole, 'function role');
  assert.notOk(watch.Resources.WatchbotWebhookFunction, 'function');
  assert.notOk(watch.Resources.WatchbotWebhookPermission, 'permission');
  assert.notOk(watch.Resources.WatchbotWebhookKey, 'key');
  assert.ok(watch.Resources.WatchbotNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.WatchbotLogGroup, 'log group');
  assert.notOk(watch.Resources.WatchbotLogForwarding, 'log forwarding function');
  assert.ok(watch.Resources.WatchbotQueue, 'queue');
  assert.ok(watch.Resources.WatchbotTopic, 'topic');
  assert.ok(watch.Resources.WatchbotQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.WatchbotQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), 'notify after retry');
  assert.deepEqual(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), [ { Name: 'NotifyAfterRetries', Value: 1 } ], 'notify after retry default value');
  assert.ok(watch.Resources.WatchbotWorkerRole, 'worker role');
  assert.equal(watch.Resources.WatchbotWorkerRole.Properties.Policies.length, 1, 'default worker permissions');
  assert.ok(watch.Resources.WatchbotWatcherRole, 'watcher role');
  assert.ok(watch.Resources.WatchbotWorker, 'worker');
  assert.notOk(watch.Resources.WatchbotWorker.Properties.Volumes, 'no mounts, no volumes');
  assert.notOk(watch.Resources.WatchbotWorker.Properties.ContainerDefinitions[0].MountPoints, 'no mounts, no mount points');
  assert.equal(watch.Resources.WatchbotWorker.Properties.ContainerDefinitions[0].Memory, 64, 'default memory reservation');
  assert.ok(watch.Resources.WatchbotWatcher, 'watcher');
  var image = watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Image;
  var tag = image['Fn::Join'][1].slice(-2).join(''); // phew
  assert.ok((new RegExp('ecs-watchbot:v' + version + '$')).test(tag), 'defaults to correct watchbotVersion');
  assert.ok(watch.Resources.WatchbotService, 'service');
  assert.notOk(watch.Resources.WatchbotProgressTable, 'progress table');
  assert.notOk(watch.Resources.WatchbotProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'LogLevel', Value: 'info' }], 'log level env var');

  assert.deepEqual(/^\d+\.\d+\.\d+$/.test(watch.Metadata.EcsWatchbotVersion), true, 'ecs-watchbot version metadata');

  assert.deepEqual(watch.ref.logGroup, cf.ref('WatchbotLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('WatchbotTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('WatchbotQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('WatchbotQueue', 'Arn'), 'queueArn ref');
  assert.notOk(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.notOk(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');
  assert.notOk(watch.ref.progressTable, 'progressTable ref');

  assert.end();
});

test('[template] webhooks but no key, no references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    watchers: 2,
    workers: 2,
    backoff: false,
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data',
    reservation: {
      memory: 512,
      cpu: 4096
    },
    messageTimeout: 300,
    messageRetention: 3000,
    alarmThreshold: 10,
    alarmPeriods: 6,
    notifyAfterRetries: 2
  });

  assert.ok(watch.Resources.testUser, 'user');
  assert.ok(watch.Resources.testUserKey, 'user key');
  assert.ok(watch.Resources.testWebhookApi, 'api');
  assert.ok(watch.Resources.testWebhookDeployment, 'deployment');
  assert.ok(watch.Resources.testWebhookMethod, 'method');
  assert.ok(watch.Resources.testWebhookResource, 'resource');
  assert.ok(watch.Resources.testWebhookFunctionRole, 'function role');
  assert.ok(watch.Resources.testWebhookFunction, 'function');
  assert.ok(watch.Resources.testWebhookPermission, 'permission');
  assert.notOk(watch.Resources.testWebhookKey, 'key');
  assert.ok(watch.Resources.testNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.testLogGroup, 'log group');
  assert.notOk(watch.Resources.testLogForwarding, 'log forwarding function');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), 'notify after retry');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), [ { Name: 'NotifyAfterRetries', Value: 2 } ], 'notify after retry default value');
  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 1, 'default worker permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.equal(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Memory, 512, 'non-default memory reservation');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');
  assert.notOk(watch.Resources.testProgressTable, 'progress table');
  assert.notOk(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');
  assert.notOk(watch.ref.progressTable, 'progressTable ref');

  assert.end();
});

test('[template] include all resources, no references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: 2,
    workers: 2,
    backoff: false,
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data',
    logAggregationFunction: 'arn:aws:lambda:us-east-1:123456789000:function:log-fake-test',
    reservation: {
      memory: 512,
      cpu: 4096
    },
    messageTimeout: 300,
    messageRetention: 3000,
    alarmThreshold: 10,
    alarmPeriods: 6,
    debugLogs: true
  });

  assert.ok(watch.Resources.testUser, 'user');
  assert.ok(watch.Resources.testUserKey, 'user key');
  assert.ok(watch.Resources.testWebhookApi, 'api');
  assert.ok(watch.Resources.testWebhookDeployment, 'deployment');
  assert.ok(watch.Resources.testWebhookMethod, 'method');
  assert.ok(watch.Resources.testWebhookResource, 'resource');
  assert.ok(watch.Resources.testWebhookFunctionRole, 'function role');
  assert.ok(watch.Resources.testWebhookFunction, 'function');
  assert.ok(watch.Resources.testWebhookPermission, 'permission');
  assert.ok(watch.Resources.testWebhookKey, 'key');
  assert.ok(watch.Resources.testNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.testLogGroup, 'log group');
  assert.ok(watch.Resources.testLogForwarding, 'log forwarding function');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');

  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 2, 'default and user-defined worker permissions');
  assert.deepEqual(watch.Resources.testWorkerRole.Properties.Policies[1].PolicyDocument.Statement, [{ Effect: 'Allow', Actions: '*', Resources: '*' }], 'user-defined permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Command, ['bash'], 'sets worker command');
  assert.ok(watch.Resources.testService, 'service');
  assert.ok(watch.Resources.testProgressTable, 'progress table');
  assert.ok(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'ProgressTable', Value: cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref('testProgressTable')]) }], 'progress table env var');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'LogLevel', Value: 'debug' }], 'log level env var');

  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.deepEqual(watch.ref.webhookKey, cf.ref('testWebhookKey'), 'webhookKey ref');
  assert.deepEqual(watch.ref.progressTable, cf.ref('testProgressTable'), 'progressTable ref');

  assert.end();
});

test('[template] include all resources, all references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    notificationEmail: cf.ref('AlarmEmail'),
    cluster: cf.ref('Cluster'),
    watchbotVersion: cf.ref('WatchbotVersion'),
    service: 'my-service',
    serviceVersion: cf.ref('GitSha'),
    env: { SomeKey: cf.ref('SomeResource'), AnotherKey: cf.ref('SomeParameter') },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: cf.ref('NumWatchers'),
    workers: cf.ref('NumWorkers'),
    backoff: cf.ref('UseBackoff'),
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data',
    logAggregationFunction: cf.ref('LogAggregationFunction'),
    reservation: {
      memory: cf.ref('MemoryReservation'),
      cpu: cf.ref('CpuReservation')
    },
    messageTimeout: cf.ref('MessageTimeout'),
    messageRetention: cf.ref('MessageRetention'),
    alarmThreshold: cf.ref('AlarmThreshold'),
    alarmPeriods: cf.ref('AlarmPeriods')
  });

  assert.ok(watch.Resources.testUser, 'user');
  assert.ok(watch.Resources.testUserKey, 'user key');
  assert.ok(watch.Resources.testWebhookApi, 'api');
  assert.ok(watch.Resources.testWebhookDeployment, 'deployment');
  assert.ok(watch.Resources.testWebhookMethod, 'method');
  assert.ok(watch.Resources.testWebhookResource, 'resource');
  assert.ok(watch.Resources.testWebhookFunctionRole, 'function role');
  assert.ok(watch.Resources.testWebhookFunction, 'function');
  assert.ok(watch.Resources.testWebhookPermission, 'permission');
  assert.ok(watch.Resources.testWebhookKey, 'key');
  assert.ok(watch.Resources.testNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.testLogGroup, 'log group');
  assert.ok(watch.Resources.testLogForwarding, 'log forwarding function');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 2, 'default and user-defined worker permissions');
  assert.deepEqual(watch.Resources.testWorkerRole.Properties.Policies[1].PolicyDocument.Statement, [{ Effect: 'Allow', Actions: '*', Resources: '*' }], 'user-defined permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');
  assert.ok(watch.Resources.testProgressTable, 'progress table');
  assert.ok(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'ProgressTable', Value: cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref('testProgressTable')]) }], 'progress table env var');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment[3], { Name: 'Concurrency', Value: cf.ref('NumWorkers') });
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment[7], { Name: 'ExponentialBackoff', Value: cf.ref('UseBackoff') });

  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.deepEqual(watch.ref.webhookKey, cf.ref('testWebhookKey'), 'webhookKey ref');
  assert.deepEqual(watch.ref.progressTable, cf.ref('testProgressTable'), 'progressTable ref');

  assert.end();
});

test('[template] resources are valid', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: 2,
    workers: 2,
    backoff: false,
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data',
    logAggregationFunction: 'arn:aws:lambda:us-east-1:123456789000:function:log-fake-test',
    reservation: {
      memory: 512,
      cpu: 4096
    },
    messageTimeout: 300,
    messageRetention: 3000,
    alarmThreshold: 10,
    alarmPeriods: 6
  });

  var tmp = path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex') + '.json');
  fs.writeFileSync(tmp, JSON.stringify({ Resources: watch.Resources }));

  cf.validate(tmp).then(function() {
    assert.pass('valid');
    assert.end();
  }).catch(function(err) {
    assert.ifError(err, 'invalid');
    assert.end();
  });
});

test('[template] multi-watchbot merge', function(assert) {
  var one = watchbot.template({
    prefix: 'one',
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256'
  });

  var two = watchbot.template({
    prefix: 'two',
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256'
  });

  assert.doesNotThrow(function() {
    watchbot.merge(one, two);
  }, 'can build multiple watchbots in a single template');

  assert.end();
});
