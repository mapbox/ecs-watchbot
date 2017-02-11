#!/usr/bin/env node

var fastlog = require('fastlog')('watchbot');
var _ = require('underscore');
var sendNotification = require('../lib/notifications')(process.env.NotificationTopic).send;
var watchbot = require('..');

var required = [
  'Cluster',
  'TaskDefinition',
  'Concurrency',
  'QueueUrl',
  'TaskEventQueueUrl',
  'NotificationTopic',
  'StackName',
  'ExponentialBackoff',
  'LogGroupArn',
  'AlarmOnEachFailure'
];

var missing = _.difference(required, Object.keys(process.env));
if (missing.length) {
  var err = new Error('Missing from environment: ' + missing.join(', '));
  fastlog.error(err);
  sendNotification('[watchbot] config error', err.message);
  process.exit(1);
}

/**
 * The main Watchbot loop. This function runs continuously on one or more containers,
 * each of which is responsible for polling SQS and spawning tasks to process
 * messages, while maintaining a predefined task concurrency and reporting any failed
 * processing tasks.
 */
watchbot.main(process.env);
