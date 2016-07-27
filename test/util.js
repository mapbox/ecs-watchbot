var AWS = require('aws-sdk');
var tape = require('tape');
var crypto = require('crypto');
var util = require('util');

module.exports.mock = function(name, callback) {
  tape(name, function(assert) {
    var sqs = AWS.SQS;
    var sns = AWS.SNS;
    var ecs = AWS.ECS;
    var log = console.log.bind(console);

    var context = {
      sqs: {
        receiveMessage: [],
        deleteMessage: [],
        changeMessageVisibility: []
      },
      sns: {
        publish: []
      },
      ecs: {
        runTask: [],
        describeTasks: [],
        describeTaskDefinition: [],
        describeContainerInstances: [],
        listContainerInstances: []
      },
      logs: []
    };

    AWS.SQS = function(config) { context.sqs.config = config; };
    AWS.SQS.prototype.receiveMessage = function(params, callback) {
      context.sqs.receiveMessage.push(params);
      if (!context.sqs.messages || !context.sqs.messages.length)
        return callback(null, { Messages: [] });
      var max = params.MaxNumberOfMessages || 1;

      var error = false;
      var msgs = context.sqs.messages.splice(0, max).map(function(msg) {
        if (msg.MessageId === 'error') error = true;
        msg.Attributes.ApproximateReceiveCount++;
        if (msg.Attributes.ApproximateReceiveCount === 1)
          msg.Attributes.ApproximateFirstReceiveTimestamp = 20;
        return msg;
      });

      if (error) return callback(new Error('Mock SQS error'));
      callback(null, { Messages: msgs });
    };
    AWS.SQS.prototype.deleteMessage = function(params, callback) {
      context.sqs.deleteMessage.push(params);
      if (params.ReceiptHandle === 'missing')
        return callback(new Error('Message does not exist or is not available for visibility timeout change'));
      if (params.ReceiptHandle === 'error')
        return callback(new Error('Mock SQS error'));
      callback();
    };
    AWS.SQS.prototype.changeMessageVisibility = function(params, callback) {
      context.sqs.changeMessageVisibility.push(params);
      if (params.ReceiptHandle === 'missing')
        return callback(new Error('Message does not exist or is not available for visibility timeout change'));
      if (params.ReceiptHandle === 'error')
        return callback(new Error('Mock SQS error'));
      callback();
    };

    AWS.SNS = function(config) { context.sns.config = config; };
    AWS.SNS.prototype.publish = function(params, callback) {
      context.sns.publish.push(params);
      callback();
    };

    var tasks = {};
    context.ecs.resourceFail = 0;

    AWS.ECS = function(config) { context.ecs.config = config; };
    AWS.ECS.prototype.runTask = function(params, callback) {
      context.ecs.runTask.push(params);

      if (params.overrides.containerOverrides[0].environment[0].name === 'error')
        return callback(new Error('Mock ECS error'));

      if (params.overrides.containerOverrides[0].environment[0].name === 'failure')
        return callback(null, { tasks: [], failures: [{ reason: 'unrecognized' }] });

      if (params.overrides.containerOverrides[0].environment[0].name === 'resources') {
        if (context.ecs.resourceFail === 0) {
          context.ecs.resourceFail++;
          return callback(null, { tasks: [], failures: [{ reason: 'RESOURCE:MEMORY' }] });
        }
      }

      var messageId = params.overrides.containerOverrides[0].environment.find(function(item) {
        return item.name === 'MessageId';
      });
      if (messageId && messageId.value === 'ecs-error') return callback(new Error('Mock ECS error'));
      if (messageId && messageId.value === 'ecs-failure') {
        if (context.ecs.resourceFail === 0) {
          context.ecs.resourceFail++;
          return callback(null, { tasks: [], failures: [{ reason: 'RESOURCE:MEMORY' }] });
        }
      }
      if (messageId && messageId.value === 'ecs-unrecognized')
        return callback(null, { tasks: [], failures: [{ reason: 'unrecognized' }] });

      var arn = crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
      tasks[arn] = params.overrides.containerOverrides[0].environment;

      callback(null, {
        tasks: [{ taskArn: arn }]
      });
    };
    AWS.ECS.prototype.describeTasks = function(params, callback) {
      context.ecs.describeTasks.push(params);

      if (params.tasks.find(function(arn) {
        var env = tasks[arn];
        var exitCode = env.find(function(item) {
          return item.name === 'exit';
        });
        var messageId = env.find(function(item) {
          return item.name === 'MessageId';
        });
        return (exitCode && exitCode.value === 'error') || (messageId && messageId.value === 'task-failure');
      })) return callback(new Error('Mock ECS error'));

      var data = {};
      data.tasks = params.tasks.reduce(function(status, arn) {
        var env = tasks[arn];
        var exitCode = env.find(function(item) {
          return item.name === 'exit';
        });
        var messageId = env.find(function(item) {
          return item.name === 'MessageId';
        });

        if (exitCode && exitCode.value === 'mismatch') {
          status.push({
            clusterArn: 'cluster-arn',
            containerInstanceArn: 'instance-arn',
            taskArn: arn,
            lastStatus: 'STOPPED',
            stoppedReason: 'mismatched',
            overrides: { containerOverrides: [{ environment: env }] },
            containers: [{ exitCode: 0 }, { exitCode: 1 }]
          });

          delete tasks[arn];
        } else if (exitCode && exitCode.value === 'match') {
          status.push({
            clusterArn: 'cluster-arn',
            containerInstanceArn: 'instance-arn',
            taskArn: arn,
            lastStatus: 'STOPPED',
            stoppedReason: 'match',
            overrides: { containerOverrides: [{ environment: env }] },
            containers: [{ exitCode: 0 }, { exitCode: 0 }]
          });
        } else if (exitCode && exitCode.value !== 'pending') {
          status.push({
            clusterArn: 'cluster-arn',
            containerInstanceArn: 'instance-arn',
            taskArn: arn,
            lastStatus: 'STOPPED',
            stoppedReason: exitCode.value,
            overrides: { containerOverrides: [{ environment: env }] },
            containers: [{ exitCode: Number(exitCode.value) }]
          });
          delete tasks[arn];
        } else if (messageId && /^finish/.test(messageId.value)) {
          var exit = messageId.value.match(/^finish-(\d)$/)[1];
          status.push({
            clusterArn: 'cluster-arn',
            containerInstanceArn: 'instance-arn',
            taskArn: arn,
            lastStatus: 'STOPPED',
            stoppedReason: exit,
            overrides: { containerOverrides: [{ environment: env }] },
            containers: [{ exitCode: Number(exit) }]
          });
          delete tasks[arn];
        }

        return status;
      }, []);

      callback(null, data);
    };
    AWS.ECS.prototype.describeTaskDefinition = function(params, callback) {
      context.ecs.describeTaskDefinition.push(params);
      setImmediate(function() {
        if (context.ecs.failTask) return callback(new Error('Mock ECS error'));
        callback(null, {
          taskDefinition: {
            containerDefinitions: [
              { cpu: 0, memory: 5 }
            ]
          }
        });
      });
    };
    AWS.ECS.prototype.listContainerInstances = function(params, callback) {
      context.ecs.listContainerInstances.push(params);
      setImmediate(function() {
        if (context.ecs.failInstances) return callback(new Error('Mock ECS error'));

        var instances = context.ecs.instances || ['arn:aws:ecs:us-east-1:1234567890:some/fake'];
        var startFrom = !params.nextToken ? 0 : instances.indexOf(params.nextToken) + 1;
        var sent = instances.slice(startFrom, startFrom + 1);

        callback(null, {
          containerInstanceArns: sent,
          nextToken: startFrom === instances.length - 1 ? undefined : sent.slice(-1)[0]
        });
      });
    };
    AWS.ECS.prototype.describeContainerInstances = function(params, callback) {
      context.ecs.describeContainerInstances.push(params);
      setImmediate(function() {
        if (context.ecs.fail) return callback(new Error('Mock ECS error'));
        callback(null, {
          containerInstances: [
            {
              registeredResources: [
                { name: 'CPU', integerValue: context.ecs.cpu || 100 },
                { name: 'MEMORY', integerValue: context.ecs.memory || 100 }
              ],
              remainingResources: [
                { name: 'CPU', integerValue: context.ecs.cpu || 100 },
                { name: 'MEMORY', integerValue: context.ecs.memory || 100 }
              ]
            }
          ]
        });
      });
    };

    console.log = function() {
      var msg = util.format.apply(null, arguments);
      context.logs.push(msg);
      log(msg);
    };

    var end = assert.end.bind(assert);
    delete assert.plan;
    assert.end = function(err) {
      AWS.SQS = sqs;
      AWS.SNS = sns;
      AWS.ECS = ecs;
      console.log = log;
      if (err) end(err);
      else end();
    };

    callback.call(context, assert);
  });
};

module.exports.collectionsEqual = function(assert, a, b, msg) {
  if (a.length !== b.length) return assert.deepEqual(a, b, msg);

  function stringify(item) {
    var str = JSON.stringify(item);
    str = str.replace(/\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT/g, '${date}'); // sanitize dates as strings
    return str;
  }

  var compare = b.map(stringify);
  var equal = a.map(stringify).reduce(function(equal, item) {
    if (compare.indexOf(item) === -1) return false;
    return equal;
  }, a.length === b.length);
  if (equal) assert.pass(msg);
  else assert.deepEqual(a, b, msg);
};
