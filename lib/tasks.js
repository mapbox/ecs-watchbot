var AWS = require('aws-sdk');

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
 * @param {string} [startedBy=watchbot] - the desired `startedBy` string for worker tasks
 * @returns {object} a {@link tasks} object
 */
module.exports = function(cluster, taskDefinition, containerName, concurrency, startedBy) {
  var ecs = new AWS.ECS({
    region: cluster.split(':')[3],
    params: { cluster: cluster }
  });

  /**
   * An ECS task runner and status tracker
   */
  var tasks = {};
  var tasksInFlight = tasks.inFlight = {};

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
    if (Object.keys(tasksInFlight).length >= concurrency) {
      var err = new Error('Above desired concurrency');
      err.code = 'AboveConcurrency';
      return callback(err);
    }

    ecs.runTask({
      startedBy: startedBy || 'watchbot',
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
    }, function(err, data) {
      if (err) return callback(err);

      data.tasks.forEach(function(task) {
        tasksInFlight[task.taskArn] = true;
      });

      if (data.failures && data.failures.length) {
        if (/^RESOURCE:(CPU|MEMORY)$/.test(data.failures[0].reason))
          return setTimeout(tasks.run, 5000, env, callback);

        err = new Error(data.failures[0].reason);
        err.code = 'NotRun';
        return callback(err);
      }

      callback();
    });
  };

  /**
   * Possible task outcomes
   *
   * @property {string} success - indicates that the container(s) provided an
   * exit code 0. The SQS message should be deleted.
   * @property {string} fail - indicates that the container(s) provided an exit
   * code 3. The SQS message should be deleted and a notification sent.
   * @property {string} noop - indicates that the container(s) provided an exit
   * code 3. The SQS message should be deleted and a notification sent.
   * @property {string} retry - indicates that container(s) provided an unknown
   * or mismatched exit code. The SQS message should be returned and a
   * notification sent.
   */
  tasks.outcome = {
    success: 'delete',
    noop: 'immediate',
    fail: 'delete & notify',
    retry: 'return & notify'
  };

  /**
   * Checks the status of all pending tasks
   *
   * @param {function} callback - a function to handle the response. Will be
   * provided a {@link taskStatus} object.
   */
  tasks.poll = function(callback) {
    if (!Object.keys(tasksInFlight).length) {
      var taskStatus = [];
      taskStatus.free = concurrency;
      return callback(null, taskStatus);
    }

    var finished = [];
    var inFlightArns = Object.keys(tasksInFlight);
    poll(inFlightArns, finished, callback);

    function poll(arns, finishedTasks, callback) {
      ecs.describeTasks({ tasks: arns.splice(0, 100) }, function(err, data) {
        if (err) return callback(err);

        /**
         * An array of {@link finishedTask} objects
         *
         * @property {number} free - the difference between current and maximum
         * desired task concurrency.
         */
        var stoppedTasks = data.tasks.filter(function(task) {
          return task.lastStatus === 'STOPPED';
        }).map(function(task) {
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
          var finishedTask = {
            arns: {
              cluster: task.clusterArn,
              instance: task.containerInstanceArn,
              task: task.taskArn
            },
            reason: task.stoppedReason,
            env: task.overrides.containerOverrides[0].environment.reduce(function(env, item) {
              env[item.name] = item.value;
              return env;
            }, {}),
            outcome: task.containers.reduce(function(outcome, container) {
              var containerOutcome = (function() {
                if (container.exitCode === 0) return tasks.outcome.success;
                if (container.exitCode === 3) return tasks.outcome.fail;
                if (container.exitCode === 4) return tasks.outcome.noop;
                return tasks.outcome.retry;
              })();
              if (!outcome) return containerOutcome;
              if (outcome !== containerOutcome) return tasks.outcome.retry;
              return containerOutcome;
            }, null)
          };

          delete tasksInFlight[task.taskArn];
          return finishedTask;
        });

        finishedTasks = finishedTasks.concat(stoppedTasks);
        if (arns.length) return poll(arns, finishedTasks, callback);

        finishedTasks.free = concurrency - Object.keys(tasksInFlight).length;
        callback(null, finishedTasks);
      });
    }
  };

  return tasks;
};
