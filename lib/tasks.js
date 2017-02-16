'use strict';

var AWS = require('aws-sdk');
var url = require('url');
var events = require('events');
var d3 = require('d3-queue');

function envToRunTaskParams(env, taskDefinition, containerName, startedBy) {
  return {
    startedBy: startedBy ? startedBy.slice(0, 36) : 'watchbot',
    taskDefinition: taskDefinition,
    overrides: {
      containerOverrides: [
        {
          name: containerName,
          environment: Object.keys(env).map(function(key) {
            return { name: key, value: env[key] };
          })
        }
      ]
    }
  };
}

/**
 * Creates tasks objects
 *
 * @static
 * @memberof watchbot
 * @name tasks
 * @param {string} cluster - the ARN of the ECS cluster to run tasks on
 * @param {string} taskDefinition - the ARN of the processing TaskDefinition to run
 * @param {string} containerName - the name of the container defined by the TaskDefinition
 * @param {number} concurrency - the desired task concurrency
 * @param {string} queue - the SQS URL that receives task-status events
 * @param {string} [startedBy=watchbot] - the desired `startedBy` string for worker tasks
 * @returns {object} a {@link tasks} object
 */
module.exports = function(cluster, taskDefinition, containerName, concurrency, queue, startedBy) {
  var ecs = new AWS.ECS({
    region: cluster.split(':')[3],
    params: { cluster: cluster }
  });

  var sqs = new AWS.SQS({
    region: url.parse(queue).host.split('.')[1],
    params: { QueueUrl: queue }
  });

  /**
   * An ECS task runner and status tracker
   */
  var tasks = new events.EventEmitter();

  var taskStateCache = new TaskStateCache(sqs).startPolling();
  taskStateCache.on('error', function(err) { tasks.emit('error', err); });
  tasks.stop = function() { taskStateCache.stopPolling(); };
  tasks.inFlight = taskStateCache.inFlight;

  /**
   * Runs a task if currently below desired concurrency
   *
   * @param {object} env - key-value pairs of environment variables to provide
   * to the task
   * @param {function} callback - a function to run when the task has been started.
   * An error object with code `AboveConcurrency` indicates that there are already
   * the maximum number of concurrent tasks running.
   */
  tasks.run = function(env, callback) {
    if (taskStateCache.inFlightCount >= concurrency) {
      var err = new Error('Above desired concurrency');
      err.code = 'AboveConcurrency';
      return callback(err);
    }

    var params = envToRunTaskParams(env, taskDefinition, containerName, startedBy);

    ecs.runTask(params, function(err, data) {
      if (err && (err.code === 'CannotStartContainerError' || err.code === 'CannotPullContainerError' || err.code === 'DockerTimeoutError') {
        err = new Error(err.message);
        err.code = 'NotRun';
        return callback(err);
      }
      if (err) return callback(err);

      data.tasks.forEach(function(task) {
        taskStateCache.taskStarted(task.taskArn);
      });

      if (data.failures && data.failures.length) {
        err = new Error(data.failures[0].reason);
        err.code = 'NotRun';
        return callback(err);
      }

      callback();
    });
  };

  tasks.outcome = outcome;

  tasks.report = function(outcome) {
    switch(outcome) {
    case tasks.outcome.success: return 'success';
    case tasks.outcome.noop: return 'no-op, will retry';
    case tasks.outcome.fail: return 'failed, removed from queue';
    case tasks.outcome.retry: return 'failed, will retry';
    }
  };

  /**
   * Checks the status of all pending tasks
   *
   * @param {function} callback - a function to handle the response. Will be
   * provided a {@link taskStatus} object.
   */
  tasks.poll = function(callback) {
    /**
     * An array of {@link finishedTask} objects
     *
     * @property {number} free - the difference between current and maximum
     * desired task concurrency.
     */
    var taskStatus = taskStateCache.completedTasks;
    taskStatus.free = concurrency - taskStateCache.inFlightCount;
    setImmediate(callback, null, taskStatus);
  };

  return tasks;
};

/**
 * Possible task outcomes
 *
 * @property {string} success - indicates that the container(s) provided an
 * exit code 0. The SQS message should be deleted.
 * @property {string} fail - indicates that the container(s) provided an exit
 * code 3. The SQS message should be deleted and a notification sent.
 * @property {string} noop - indicates that the container(s) provided an exit
 * code 4. The SQS message should be returned.
 * @property {string} retry - indicates that container(s) provided an unknown
 * or mismatched exit code. The SQS message should be returned and a
 * notification sent.
 */
var outcome = {
  success: 'delete',
  noop: 'immediate',
  fail: 'delete & notify',
  retry: 'return & notify'
};

function getMessages(sqs, callback) {
  sqs.receiveMessage({
    AttributeNames: [
      'SentTimestamp',
      'ApproximateFirstReceiveTimestamp',
      'ApproximateReceiveCount'
    ],
    WaitTimeSeconds: 20,
    MaxNumberOfMessages: 10
  }, function(err, data) {
    if (err) return callback(err);

    if (!data.Messages || !data.Messages.length)
      return callback(null, []);

    var finishedTasks = data.Messages.map(function(message) {
      var task = JSON.parse(message.Body).detail;
      var duration = +new Date(task.stoppedAt) - +new Date(task.startedAt);
      if (isNaN(duration)) duration = 0;

      /**
       * A task's reason for finishing
       * If exit code is 0, return success. If exit code does not equal 0 and
       * stopped container reason is provided return that. Otherwise, return
       * stopped task reason.
       */
      var success = task.containers.every(function(c) { return c.exitCode === 0; });
      var containerReason = task.containers.find(function(c) { return c.reason; });

      var taskReason;
      if (task.stoppedReason) taskReason = task.stoppedReason;
      if (containerReason) taskReason = containerReason.reason;
      if (success) taskReason = 'success';

      /**
       * An object providing information about the outcome of a task
       *
       * @name finishedTask
       * @property {object} arns - indentifiers for resources involved in running the task
       * @property {string} arns.cluster - the ECS cluster's ARN
       * @property {string} arns.instance - the EC2's ARN (use in ecs.describeContainerInstances requests)
       * @property {string} arns.task - the tasks ARN (use in ecs.describeTasks requests)
       * @property {string} reason - the ECS-provided reason that the task ended
       * @property {object} env - key-value pairs indicating the task's
       * environment variables
       * @property {string} outcome - one of the outcomes defined by {@link tasks.outcome}
       */
      return {
        reason: taskReason,

        duration: duration,

        removeEvent: function(callback) {
          sqs.deleteMessage({ ReceiptHandle: message.ReceiptHandle }, callback);
        },

        ignoreEvent: function(callback) {
          sqs.changeMessageVisibility({
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: 0
          }, callback);
        },

        arns: {
          cluster: task.clusterArn,
          instance: task.containerInstanceArn,
          task: task.taskArn
        },

        env: task.overrides.containerOverrides[0].environment.reduce(function(env, item) {
          env[item.name] = item.value;
          return env;
        }, {}),

        outcome: (function(container) {
          if (container.exitCode === 0) return outcome.success;
          if (container.exitCode === 3) return outcome.fail;
          if (container.exitCode === 4) return outcome.noop;
          return outcome.retry;
        })(task.containers[0])
      };
    });

    return callback(null, finishedTasks);
  });
}

class TaskStateCache extends events.EventEmitter {
  constructor(sqs) {
    super();
    this.sqs = sqs;
    this.inFlight = {};
    this.pendingCompletion = [];
  }

  startPolling() {
    setTimeout(() => this.poll(), 50);
    return this;
  }

  poll() {
    getMessages(this.sqs, (err, finishedTasks) => {
      if (err) this.emit('error', err);

      var queue = d3.queue(10);

      (finishedTasks || []).forEach((task) => {
        if (!this.inFlight[task.arns.task]) return queue.defer(task.ignoreEvent);
        this.pendingCompletion.push(task);
        queue.defer(task.removeEvent);
      });

      queue.awaitAll((err) => {
        if (err) this.emit('error', err);
        if (!this.stop) this.poll();
      });
    });
  }

  get inFlightCount() {
    return Object.keys(this.inFlight).length;
  }

  get completedTasks() {
    var completed = [].concat(this.pendingCompletion);
    this.pendingCompletion = [];
    return completed.map((task) => {
      this.taskCompleted(task.arns.task);
      delete task.removeEvent;
      delete task.ignoreEvent;
      return task;
    });
  }

  taskStarted(taskArn) {
    this.inFlight[taskArn] = true;
  }

  taskCompleted(taskArn) {
    delete this.inFlight[taskArn];
  }

  stopPolling() {
    this.stop = true;
  }
}

module.exports.envToRunTaskParams = envToRunTaskParams;
