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
    clusterRole: 'cluster-Role',
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
  assert.ok(watch.Resources.WatchbotWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.WatchbotWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.WatchbotWorker, 'worker');
  assert.notOk(watch.Resources.WatchbotWorker.Properties.Volumes, 'no mounts, no volumes');
  assert.notOk(watch.Resources.WatchbotWorker.Properties.ContainerDefinitions[0].MountPoints, 'no mounts, no mount points');
  assert.ok(watch.Resources.WatchbotWatcher, 'watcher');
  var image = watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Image;
  var tag = image['Fn::Join'][1].slice(-2).join(''); // phew
  assert.ok((new RegExp('ecs-watchbot:v' + version + '$')).test(tag), 'defaults to correct watchbotVersion');
  assert.ok(watch.Resources.WatchbotService, 'service');
  assert.ok(watch.ref.logGroup, 'logGroup ref');
  assert.ok(watch.ref.topic, 'topic ref');
  assert.notOk(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.notOk(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');

  assert.end();
});

test('[template] webhooks but no key, no references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    clusterRole: 'cluster-Role',
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
    alarmPeriods: 6
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
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.ref.logGroup, 'logGroup ref');
  assert.ok(watch.ref.topic, 'topic ref');
  assert.ok(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.ok(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');

  assert.end();
});

test('[template] include all resources, no references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    clusterRole: 'cluster-Role',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
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
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Command, ['bash'], 'sets worker command');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.ref.logGroup, 'logGroup ref');
  assert.ok(watch.ref.topic, 'topic ref');
  assert.ok(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.ok(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.ok(watch.ref.webhookKey, 'webhookKey ref');

  assert.end();
});

test('[template] include all resources, all references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    notificationEmail: cf.ref('AlarmEmail'),
    cluster: cf.ref('Cluster'),
    clusterRole: cf.ref('ClusterRole'),
    watchbotVersion: cf.ref('WatchbotVersion'),
    service: 'my-service',
    serviceVersion: cf.ref('GitSha'),
    env: { SomeKey: cf.ref('SomeResource'), AnotherKey: cf.ref('SomeParameter') },
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
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.ref.logGroup, 'logGroup ref');
  assert.ok(watch.ref.topic, 'topic ref');
  assert.ok(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.ok(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.ok(watch.ref.webhookKey, 'webhookKey ref');

  assert.end();
});

test('[template] resources are valid', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    clusterRole: 'cluster-Role',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
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
