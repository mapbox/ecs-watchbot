var test = require('tape');
var watchbot = require('..');
var cf = require('@mapbox/cloudfriend');
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');

var pkg = require(path.resolve(__dirname, '..', 'package.json'));
var version = pkg.version;

test('[template] bare-bones, all defaults, no references', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var watch = watchbot.template({
    notificationEmail: 'devnull@mapbox.com',
    cluster: cluster,
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
  assert.ok(watch.Resources.WatchbotDeadLetterQueue, 'dead letter queue');
  assert.ok(watch.Resources.WatchbotDeadLetterAlarm, 'dead letter alarm');
  assert.ok(watch.Resources.WatchbotTopic, 'topic');
  assert.ok(watch.Resources.WatchbotQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.WatchbotQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.WatchbotTaskEventQueue, 'task event queue');
  assert.ok(watch.Resources.WatchbotTaskEventRule, 'task event rule');
  assert.ok(watch.Resources.WatchbotTaskEventQueuePolicy, 'task event queue policy');
  assert.ok(watch.Resources.WatchbotFailedWorkerPlacementMetric, 'failed worker metric');
  assert.ok(watch.Resources.WatchbotWorkerDurationMetric, 'worker duration metric');
  assert.ok(watch.Resources.WatchbotWorkerPendingMetric, 'worker pending metric');
  assert.ok(watch.Resources.WatchbotMessageReceivesMetric, 'message receives metric');
  assert.ok(watch.Resources.WatchbotWatcherConcurrencyMetric, 'watcher concurrency metric');
  assert.ok(watch.Resources.WatchbotWorkerErrorsMetric, 'worker errors metric');
  assert.ok(watch.Resources.WatchbotWorkerErrorsAlarm, 'worker errors alarm');
  assert.equal(watch.Resources.WatchbotWorkerErrorsAlarm.Properties.Threshold, 10, 'worker errors alarm threshold');
  assert.ok(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), 'notify after retry');
  assert.notOk(watch.Resources.WatchbotWorker.Properties.ContainerDefinitions[0].Privileged, 'privileged is false');
  assert.equal(watch.Resources.WatchbotWorker.Properties.ContainerDefinitions[0].Memory, 64, 'sets default hard memory limit');
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
  assert.deepEqual(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-2, -1), [{ Name: 'LogLevel', Value: 'info' }], 'log level env var');
  assert.deepEqual(watch.Resources.WatchbotWatcher.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'AlarmOnEachFailure', Value: 'false' }], 'alarm on failure env var');

  assert.deepEqual(/^\d+\.\d+\.\d+$/.test(watch.Metadata.EcsWatchbotVersion), true, 'ecs-watchbot version metadata');

  assert.deepEqual(watch.ref.logGroup, cf.ref('WatchbotLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('WatchbotTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('WatchbotQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('WatchbotQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.queueName, cf.getAtt('WatchbotQueue', 'QueueName'), 'queueName ref');
  assert.notOk(watch.ref.accessKeyId, 'accessKeyId ref');
  assert.notOk(watch.ref.secretAccessKey, 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');
  assert.notOk(watch.ref.progressTable, 'progressTable ref');

  assert.ok(watch.Outputs.ClusterArn, 'cluster arn output exists');
  assert.equal(watch.Outputs.ClusterArn.Value, cluster, 'cluster arn ref');

  assert.end();
});

test('[template] webhooks but no key, no references', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: cluster,
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    watchers: 2,
    workers: 2,
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data,/mnt/tmp',
    reservation: {
      memory: 512,
      cpu: 4096
    },
    messageTimeout: 300,
    messageRetention: 3000,
    alarmThreshold: 10,
    alarmPeriods: 6,
    privileged: true
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
  assert.ok(watch.Resources.testDeadLetterQueue, 'dead letter queue');
  assert.ok(watch.Resources.testDeadLetterAlarm, 'dead letter alarm');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testTaskEventQueue, 'task event queue');
  assert.ok(watch.Resources.testTaskEventRule, 'task event rule');
  assert.ok(watch.Resources.testTaskEventQueuePolicy, 'task event queue policy');
  assert.ok(watch.Resources.testFailedWorkerPlacementMetric, 'failed worker metric');
  assert.ok(watch.Resources.testWorkerDurationMetric, 'worker duration metric');
  assert.ok(watch.Resources.testWorkerPendingMetric, 'worker pending metric');
  assert.ok(watch.Resources.testMessageReceivesMetric, 'message receives metric');
  assert.ok(watch.Resources.testWatcherConcurrencyMetric, 'watcher concurrency metric');
  assert.ok(watch.Resources.testWorkerErrorsMetric, 'worker errors metric');
  assert.ok(watch.Resources.testWorkerErrorsAlarm, 'worker errors alarm');
  assert.equal(watch.Resources.testWorkerErrorsAlarm.Properties.Threshold, 10, 'worker errors alarm threshold');
  assert.ok(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-3, -2), 'notify after retry');
  assert.ok(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Privileged, 'privileged is true');
  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 1, 'default worker permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.equal(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Memory, 512, 'non-default memory reservation');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');
  assert.notOk(watch.Resources.testProgressTable, 'progress table');
  assert.notOk(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.ok(watch.Resources.testWorker.Properties.ContainerDefinitions[0].MountPoints.every((pt) => { return pt.ContainerPath && pt.SourceVolume; }), 'mount point properties');
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[0], { Name: 'mnt-0', Host: { SourcePath: '/var/tmp' } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[1], { Name: 'mnt-1', Host: { SourcePath: '/mnt/data' } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[2], { Name: 'mnt-2', Host: {} });

  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.queueName, cf.getAtt('testQueue', 'QueueName'), 'queueName ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.notOk(watch.ref.webhookKey, 'webhookKey ref');
  assert.notOk(watch.ref.progressTable, 'progressTable ref');

  assert.ok(watch.Outputs.ClusterArn, 'cluster arn output exists');
  assert.equal(watch.Outputs.ClusterArn.Value, cluster, 'cluster arn ref');

  assert.end();
});

test('[template] include all resources, no references', function(assert) {
  var cluster = 'arn:aws:ecs:us-east-1:123456789012:cluster/fake';
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    notificationEmail: 'devnull@mapbox.com',
    cluster: cluster,
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: 2,
    workers: 2,
    mounts: {
      container: ['/var/tmp', '/mnt/data', '/mnt/tmp'],
      host: ['/var/tmp', '/mnt/data', '']
    },
    logAggregationFunction: 'arn:aws:lambda:us-east-1:123456789000:function:log-fake-test',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: 4096
    },
    messageTimeout: 300,
    messageRetention: 3000,
    errorThreshold: 11,
    alarmThreshold: 10,
    alarmPeriods: 6,
    debugLogs: true,
    alarmOnEachFailure: true
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
  assert.ok(watch.Resources.testDeadLetterQueue, 'dead letter queue');
  assert.ok(watch.Resources.testDeadLetterAlarm, 'dead letter alarm');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testTaskEventQueue, 'task event queue');
  assert.ok(watch.Resources.testTaskEventRule, 'task event rule');
  assert.ok(watch.Resources.testTaskEventQueuePolicy, 'task event queue policy');
  assert.ok(watch.Resources.testFailedWorkerPlacementMetric, 'failed worker metric');
  assert.ok(watch.Resources.testWorkerDurationMetric, 'worker duration metric');
  assert.ok(watch.Resources.testWorkerPendingMetric, 'worker pending metric');
  assert.ok(watch.Resources.testMessageReceivesMetric, 'message receives metric');
  assert.ok(watch.Resources.testWatcherConcurrencyMetric, 'watcher concurrency metric');
  assert.ok(watch.Resources.testWorkerErrorsMetric, 'worker errors metric');
  assert.ok(watch.Resources.testWorkerErrorsAlarm, 'worker errors alarm');
  assert.equal(watch.Resources.testWorkerErrorsAlarm.Properties.Threshold, 11, 'worker errors alarm threshold');
  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 2, 'default and user-defined worker permissions');
  assert.deepEqual(watch.Resources.testWorkerRole.Properties.Policies[1].PolicyDocument.Statement, [{ Effect: 'Allow', Actions: '*', Resources: '*' }], 'user-defined permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Command, ['bash'], 'sets worker command');
  assert.equal(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Cpu, 4096, 'reserves cpu');
  assert.equal(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Memory, 512, 'sets hard memory limit');
  assert.equal(watch.Resources.testWorker.Properties.ContainerDefinitions[0].MemoryReservation, 128, 'sets soft memory limit');
  assert.ok(watch.Resources.testService, 'service');
  assert.ok(watch.Resources.testProgressTable, 'progress table');
  assert.equal(watch.Resources.testProgressTable.Properties.ProvisionedThroughput.ReadCapacityUnits, 30);
  assert.equal(watch.Resources.testProgressTable.Properties.ProvisionedThroughput.WriteCapacityUnits, 30);
  assert.ok(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'ProgressTable', Value: cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref('testProgressTable')]) }], 'progress table env var');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-2, -1), [{ Name: 'LogLevel', Value: 'debug' }], 'log level env var');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'AlarmOnEachFailure', Value: 'true' }], 'alarm on failure env var');
  assert.ok(watch.Resources.testWorker.Properties.ContainerDefinitions[0].MountPoints.every((pt) => { return pt.ContainerPath && pt.SourceVolume; }), 'mount point properties');
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[0], { Name: 'mnt-0', Host: { SourcePath: '/var/tmp' } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[1], { Name: 'mnt-1', Host: { SourcePath: '/mnt/data' } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[2], { Name: 'mnt-2', Host: {} });

  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.queueName, cf.getAtt('testQueue', 'QueueName'), 'queueName ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.deepEqual(watch.ref.webhookKey, cf.ref('testWebhookKey'), 'webhookKey ref');
  assert.deepEqual(watch.ref.progressTable, cf.ref('testProgressTable'), 'progressTable ref');

  assert.ok(watch.Outputs.ClusterArn, 'cluster arn output exists');
  assert.equal(watch.Outputs.ClusterArn.Value, cluster, 'cluster arn ref');

  assert.end();
});

test('[template] include all resources, all references', function(assert) {
  var stackName = 'some-stack-name';
  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    readCapacityUnits: 20,
    writeCapacityUnits: 20,
    notificationEmail: cf.ref('AlarmEmail'),
    cluster: cf.ref('Cluster'),
    watchbotVersion: cf.ref('WatchbotVersion'),
    service: 'my-service',
    serviceVersion: cf.ref('GitSha'),
    env: { SomeKey: cf.ref('SomeResource'), AnotherKey: cf.ref('SomeParameter') },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: cf.ref('NumWatchers'),
    workers: cf.ref('NumWorkers'),
    mounts: {
      container: [cf.sub('/var/tmp/${stack}', { stack: cf.ref(stackName) }), '/mnt/data', '/mnt/tmp'],
      host: [cf.sub('/var/tmp/${stack}', { stack: cf.ref(stackName) }), '/mnt/data', '']
    },
    logAggregationFunction: cf.ref('LogAggregationFunction'),
    reservation: {
      memory: cf.ref('MemoryReservation'),
      cpu: cf.ref('CpuReservation')
    },
    messageTimeout: cf.ref('MessageTimeout'),
    messageRetention: cf.ref('MessageRetention'),
    alarmThreshold: cf.ref('AlarmThreshold'),
    errorThreshold: cf.ref('Errors'),
    alarmPeriods: cf.ref('AlarmPeriods'),
    alarmOnEachFailure: cf.ref('AlarmOnFailures')
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
  assert.equal(watch.Resources.testLogForwarding.Condition, 'testUseLogForwarding', 'log forwarding function is conditional');
  assert.deepEqual(watch.Conditions.testUseLogForwarding, cf.notEquals(cf.ref('LogAggregationFunction'), ''), 'log forwarding condition provided');
  assert.ok(watch.Resources.testQueue, 'queue');
  assert.ok(watch.Resources.testDeadLetterQueue, 'dead letter queue');
  assert.ok(watch.Resources.testDeadLetterAlarm, 'dead letter alarm');
  assert.ok(watch.Resources.testTopic, 'topic');
  assert.ok(watch.Resources.testQueuePolicy, 'queue policy');
  assert.ok(watch.Resources.testQueueSizeAlarm, 'queue alarm');
  assert.ok(watch.Resources.testTaskEventQueue, 'task event queue');
  assert.ok(watch.Resources.testTaskEventRule, 'task event rule');
  assert.ok(watch.Resources.testTaskEventQueuePolicy, 'task event queue policy');
  assert.ok(watch.Resources.testFailedWorkerPlacementMetric, 'failed worker metric');
  assert.ok(watch.Resources.testWorkerDurationMetric, 'worker duration metric');
  assert.ok(watch.Resources.testWorkerPendingMetric, 'worker pending metric');
  assert.ok(watch.Resources.testMessageReceivesMetric, 'message receives metric');
  assert.ok(watch.Resources.testWatcherConcurrencyMetric, 'watcher concurrency metric');
  assert.ok(watch.Resources.testWorkerErrorsMetric, 'worker errors metric');
  assert.ok(watch.Resources.testWorkerErrorsAlarm, 'worker errors alarm');
  assert.deepEqual(watch.Resources.testWorkerErrorsAlarm.Properties.Threshold, cf.ref('Errors'), 'worker errors alarm threshold');
  assert.ok(watch.Resources.testWorkerRole, 'worker role');
  assert.equal(watch.Resources.testWorkerRole.Properties.Policies.length, 2, 'default and user-defined worker permissions');
  assert.deepEqual(watch.Resources.testWorkerRole.Properties.Policies[1].PolicyDocument.Statement, [{ Effect: 'Allow', Actions: '*', Resources: '*' }], 'user-defined permissions');
  assert.ok(watch.Resources.testWatcherRole, 'watcher role');
  assert.ok(watch.Resources.testWorker, 'worker');
  assert.ok(watch.Resources.testWatcher, 'watcher');
  assert.ok(watch.Resources.testService, 'service');
  assert.ok(watch.Resources.testProgressTable, 'progress table');
  assert.equal(watch.Resources.testProgressTable.Properties.ProvisionedThroughput.ReadCapacityUnits, 20, 'progressTable read capacity');
  assert.equal(watch.Resources.testProgressTable.Properties.ProvisionedThroughput.WriteCapacityUnits, 20, 'progressTable write capacity');
  assert.ok(watch.Resources.testProgressTablePermission, 'progress table permission');
  assert.deepEqual(watch.Resources.testWorker.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'ProgressTable', Value: cf.join(['arn:aws:dynamodb:', cf.region, ':', cf.accountId, ':table/', cf.ref('testProgressTable')]) }], 'progress table env var');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment[3], { Name: 'Concurrency', Value: cf.ref('NumWorkers') }, 'sets Concurrency');
  assert.deepEqual(watch.Resources.testWatcher.Properties.ContainerDefinitions[0].Environment.slice(-1), [{ Name: 'AlarmOnEachFailure', Value: cf.ref('AlarmOnFailures') }], 'alarm on failure env var');
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[0], { Name: 'mnt-0', Host: { SourcePath: { 'Fn::Sub': ['/var/tmp/${stack}', { stack: { Ref: 'some-stack-name' } }] } } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[1], { Name: 'mnt-1', Host: { SourcePath: '/mnt/data' } });
  assert.deepEqual(watch.Resources.testWorker.Properties.Volumes[2], { Name: 'mnt-2', Host: {} });
  assert.deepEqual(watch.ref.logGroup, cf.ref('testLogGroup'), 'logGroup ref');
  assert.deepEqual(watch.ref.topic, cf.ref('testTopic'), 'topic ref');
  assert.deepEqual(watch.ref.queueUrl, cf.ref('testQueue'), 'queueUrl ref');
  assert.deepEqual(watch.ref.queueArn, cf.getAtt('testQueue', 'Arn'), 'queueArn ref');
  assert.deepEqual(watch.ref.queueName, cf.getAtt('testQueue', 'QueueName'), 'queueName ref');
  assert.deepEqual(watch.ref.accessKeyId, cf.ref('testUserKey'), 'accessKeyId ref');
  assert.deepEqual(watch.ref.secretAccessKey, cf.getAtt('testUserKey', 'SecretAccessKey'), 'secretAccessKey ref');
  assert.deepEqual(watch.ref.webhookKey, cf.ref('testWebhookKey'), 'webhookKey ref');
  assert.deepEqual(watch.ref.progressTable, cf.ref('testProgressTable'), 'progressTable ref');

  assert.ok(watch.Outputs.ClusterArn, 'cluster arn output exists');
  assert.deepEqual(watch.Outputs.ClusterArn.Value, cf.ref('Cluster'), 'cluster arn ref');

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
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data,/mnt/tmp',
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

test('[template] notificationTopic vs notificationEmail', function(assert) {
  assert.throws(function() {
    watchbot.template({
      prefix: 'test',
      user: true,
      webhook: true,
      webhookKey: true,
      reduce: true,
      notificationEmail: 'devnull@mapbox.com',
      notificationTopic: 'arn:aws:sns:us-east-1:123456789000:fake-topic',
      cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
      watchbotVersion: 'v0.0.7',
      service: 'my-service',
      serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
      command: ['bash'],
      env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
      permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
      watchers: 2,
      workers: 2,
      mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data,/mnt/tmp',
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
  }, /Cannot provide both notificationTopic and notificationEmail./);

  var watch = watchbot.template({
    prefix: 'test',
    user: true,
    webhook: true,
    webhookKey: true,
    reduce: true,
    notificationTopic: 'arn:aws:sns:us-east-1:123456789000:fake-topic',
    cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/fake',
    watchbotVersion: 'v0.0.7',
    service: 'my-service',
    serviceVersion: '7a55878c2adbfcfed0ec2c2d5b29fe6c87c19256',
    command: ['bash'],
    env: { SomeKey: 'SomeValue', AnotherKey: 'AnotherValue' },
    permissions: [{ Effect: 'Allow', Actions: '*', Resources: '*' }],
    watchers: 2,
    workers: 2,
    mounts: '/var/tmp:/var/tmp,/mnt/data:/mnt/data,/mnt/tmp',
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
