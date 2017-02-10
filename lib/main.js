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
 * @param {string} config.TaskEventQueueUrl - the URL for the SQS queue containing task-state events
 * @param {string} config.StackName - the name of the CFN stack
 * @param {boolean} config.ExponentialBackoff - whether to retry with backoff
 * @param {string} [config.LogLevel=info] - fastlog log level
 * @returns {object} an event emitter that will emit an `finish` event if the
 * main loop is stopped.
 */
module.exports = function(config) {
  var template = '[${timestamp}] [${category}]';
  var log = fastlog('watchbot', config.LogLevel || 'info', template);
  var emitter = new events.EventEmitter();

  var sendNotification = require('../lib/notifications')(config.NotificationTopic).send;
  var tasks = require('../lib/tasks')(
    config.Cluster,
    config.TaskDefinition,
    config.ContainerName,
    Number(config.Concurrency),
    config.TaskEventQueueUrl,
    config.StackName
  ).on('error', function(err) {
    log.error('Error in tasks: %s', err.message);
  });

  var messages = require('../lib/messages')(
    config.QueueUrl,
    config.NotificationTopic,
    config.StackName,
    Boolean(config.ExponentialBackoff),
    config.LogGroupArn
  );

  (function status() {
    log.info(JSON.stringify({
      max: config.Concurrency,
      concurrency: Object.keys(tasks.inFlight).length,
      messages: Object.keys(messages.inFlight).length
    }));

    setTimeout(status, 60000).unref();
  })();

  (function main() {
    log.debug('[debug] starting loop');
    log.debug('[debug] should stop: %s', stop);
    if (stop) {
      emitter.emit('finish');
      tasks.stop();
      return stop = false;
    }

    // First, poll for status of any running tasks
    log.debug('[debug] poll tasks');
    tasks.poll(function(err, status) {
      if (err) {
        log.error(err);
        sendNotification('[watchbot] task polling error', err.message);
        return setTimeout(main, 1000, config, emitter);
      }

      // If there are no free tasks, wait a second before polling tasks again
      log.debug('[debug] %s tasks in-flight: %s', Object.keys(tasks.inFlight).length, Object.keys(tasks.inFlight).join(', '));
      log.debug('[debug] task polling result: %j', status);
      log.debug('[debug] free tasks: %s/%s', status.free, config.Concurrency);
      if (!status || !status.free)
        return setTimeout(main, 1000, config, emitter);

      gotTasks(status);
    });

    // There are free tasks indicated by the `status` array
    function gotTasks(status) {
      var queue = d3.queue(10);

      // Handle each finished task
      status.forEach(function(finishedTask) {

        // retry before notifying, if it's been set in options.notifyAfterRetries
        var lessThanConfiguredRetries = +finishedTask.env.ApproximateReceiveCount <= +config.NotifyAfterRetries;
        if (lessThanConfiguredRetries && finishedTask.outcome === tasks.outcome.retry)
          finishedTask.outcome = tasks.outcome.noop;


        log.info(
          '[%s] %s',
          finishedTask.env.MessageId,
          JSON.stringify({
            outcome: tasks.report(finishedTask.outcome),
            reason: finishedTask.reason,
            duration: Math.ceil(finishedTask.duration / 1000)
          })
        );
        queue.defer(messages.complete, finishedTask);
      });

      queue.awaitAll(function(err) {
        if (err) {
          log.error(err);
          sendNotification('[watchbot] message completion error', err.message);
        }

        completedTasks(status);
      });
    }

    function completedTasks(status) {
      log.debug('[debug] poll for %s messages', status.free);
      messages.poll(status.free, function(err, envs) {
        if (err) {
          log.error(err);
          sendNotification('[watchbot] message polling error', err.message);
        }

        // If there are no messages, wait a second before repeating
        log.debug('[debug] %s messages in flight: %s', Object.keys(messages.inFlight).length, Object.keys(messages.inFlight).join(', '));
        log.debug('[debug] messages received: %s', envs ? envs.length : 0);
        if (!envs || !envs.length)
          return setTimeout(main, 1000, config, emitter);

        messagesPolled(envs);
      });
    }

    // There are messages to process
    function messagesPolled(envs) {
      var queue = d3.queue(10);

      // Run a task for each message
      envs.forEach(function(env) {
        queue.defer(function(next) {
          tasks.run(env, function(err) {
            if (!err) {
              log.info(
                '[%s] %s',
                env.MessageId,
                JSON.stringify({
                  subject: env.Subject,
                  message: env.Message.length < 2048 ? env.Message : env.Message.substr(0, 2048),
                  receives: env.ApproximateReceiveCount
                })
              );
              return next();
            }

            log.warn(
              '[%s] %s',
              env.MessageId,
              JSON.stringify({
                failedPlacement: 'true',
                reason: err.message
              })
            );

            messages.complete({
              arns: {},
              reason: err.message,
              env: env,
              outcome: err.code === 'NotRun' ? tasks.outcome.noop : tasks.outcome.retry
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
        log.debug('[debug] ran tasks');
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
