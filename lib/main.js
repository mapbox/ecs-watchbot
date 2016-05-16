var events = require('events');
var fastlog = require('fastlog');
var d3 = require('d3-queue');
var stop = false;

/**
 * The main Watchbot loop
 *
 * @static
 * @memberof watchbot
 * @name main
 * @param {object} config - configuration parameters
 * @param {string} config.NotificationTopic - the ARN for the notification SNS topic
 * @param {string} config.Cluster - the ARN for the ECS cluster
 * @param {string} config.TaskDefinition - the ARN for the worker task definition
 * @param {string} config.ContainerName - the name of the container defined by the TaskDefinition
 * @param {number} config.Concurrency - the number of concurrent tasks
 * @param {string} config.QueueUrl - the URL for the SQS queue
 * @param {string} config.StackName - the name of the CFN stack
 * @param {boolean} config.ExponentialBackoff - whether to retry with backoff
 * @param {string} [config.LogLevel=info] - fastlog log level
 * @returns {object} an event emitter that will emit an `finish` event if the
 * main loop is stopped.
 */
module.exports = function(config) {
  var log = fastlog('watchbot', config.LogLevel || 'info');
  var emitter = new events.EventEmitter();

  var sendNotification = require('../lib/notifications')(config.NotificationTopic).send;
  var tasks = require('../lib/tasks')(
    config.Cluster,
    config.TaskDefinition,
    config.ContainerName,
    Number(config.Concurrency)
  );

  var messages = require('../lib/messages')(
    config.QueueUrl,
    config.NotificationTopic,
    config.StackName,
    Boolean(config.ExponentialBackoff)
  );

  (function main() {
    log.debug('starting loop');
    log.debug('should stop: %s', stop);
    if (stop) {
      emitter.emit('finish');
      return stop = false;
    }

    // First, poll for status of any running tasks
    log.debug('poll tasks');
    tasks.poll(function(err, status) {
      if (err) {
        log.error(err);
        sendNotification('[watchbot] task polling error', err.message);
        return setTimeout(main, 1000, config, emitter);
      }

      // If there are no free tasks, wait a second before polling tasks again
      log.debug('free tasks: %s', status.free);
      if (!status || !status.free)
        return setTimeout(main, 1000, config, emitter);

      gotTasks(status);
    });

    // There are free tasks indicated by the `status` array
    function gotTasks(status) {
      var queue = d3.queue(10);

      // Handle each finished task
      status.forEach(function(finishedTask) {
        log.info('[%s] finished | outcome: %s', finishedTask.env.MessageId, finishedTask.outcome);
        queue.defer(messages.complete, finishedTask);
      });

      queue.awaitAll(function(err) {
        if (err) {
          log.error(err);
          sendNotification('[watchbot] message completion error', err.message);
        }

        // Poll SQS for up to `status.free` number of messages
        log.debug('poll messages');
        messages.poll(status.free, function(err, envs) {
          if (err) {
            log.error(err);
            sendNotification('[watchbot] message polling error', err.message);
          }

          // If there are no messages, wait a second before repeating
          log.debug('messages received: %s', envs ? envs.length : 0);
          if (!envs || !envs.length)
            return setTimeout(main, 1000, config, emitter);

          messagesPolled(envs);
        });
      });
    }

    // There are messages to process
    function messagesPolled(envs) {
      var queue = d3.queue(10);

      // Run a task for each message
      envs.forEach(function(env) {
        log.info('[%s] received %s: %s', env.MessageId, env.Subject, env.Message);
        queue.defer(function(next) {
          tasks.run(env, function(err) {
            if (!err) return next();

            log.error(err);

            messages.complete({
              reason: 'task failed to run',
              env: env,
              outcome: tasks.outcome.retry
            }, function(err) {
              if (err) {
                log.error(err);
                sendNotification('[watchbot] message completion error', err.message);
              }
              next();
            });
          });
        });
      });

      queue.awaitAll(function() {
        // Wait a second before repeating the process
        log.debug('ran tasks');
        return setTimeout(main, 1000, config, emitter);
      });
    }
  })();

  return emitter;
};

/**
 * Signals the main loop to shut down.
 *
 * @memberof watchbot.main
 */
module.exports.end = function() {
  stop = true;
};
