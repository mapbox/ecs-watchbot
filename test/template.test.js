var test = require('tape');
var watchbot = require('..');
var cf = require('cloudfriend');

test('[template] bare-bones, all defaults, no references', function(assert) {
  var watch = watchbot.template({
    prefix: 'test',
    notificationEmail: 'devnull@mapbox.com',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    clusterRole: 'cluster-Role',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256'
  });

  assert.ok(watch.Resources.testNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.testLogGroup, 'log group');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.refs.logGroup, 'logGroup ref');
  assert.ok(watch.refs.topic, 'topic ref');
  assert.ok(watch.refs.workerPolicy, 'workerPolicy ref');

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
  assert.ok(watch.Resources.testWebhookKey, 'key');
  assert.ok(watch.Resources.testNotificationTopic, 'notification topic');
  assert.ok(watch.Resources.testLogGroup, 'log group');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.refs.logGroup, 'logGroup ref');
  assert.ok(watch.refs.topic, 'topic ref');
  assert.ok(watch.refs.workerPolicy, 'workerPolicy ref');
  assert.ok(watch.refs.accessKeyId, 'accessKeyId ref');
  assert.ok(watch.refs.secretAccessKey, 'secretAccessKey ref');
  assert.ok(watch.refs.webhookKey, 'webhookKey ref');

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
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testWorkerPolicy, 'worker policy');
  assert.ok(watch.Resources.testWatcherPolicy, 'watcher policy');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');

  assert.ok(watch.refs.logGroup, 'logGroup ref');
  assert.ok(watch.refs.topic, 'topic ref');
  assert.ok(watch.refs.workerPolicy, 'workerPolicy ref');
  assert.ok(watch.refs.accessKeyId, 'accessKeyId ref');
  assert.ok(watch.refs.secretAccessKey, 'secretAccessKey ref');
  assert.ok(watch.refs.webhookKey, 'webhookKey ref');

  assert.end();
});
