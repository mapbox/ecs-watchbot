#!/usr/bin/env node

var AWS = require('aws-sdk');
var argv = require('minimist')(process.argv.slice(2));
var queue = require('d3-queue').queue;

run(argv, (err, result) => {
  if (err) print(err);
  if (result.capacity) print(result.cluster + ' currently has enough space for an additional ' + result.capacity + ' ' + argv.stack + ' workers.')
});

function run(argv, callback) {
  getClusterArn(argv, (err, clusterArn) => {
    if (err) return callback(new Error(err));
    getReservations(argv, (err, rsvps) => {
      if (err) return callback(new Error(err));
      listInstances(clusterArn, (err, resources) => {
        if (err) return callback(new Error(err));
        var result = {
          capacity: calculateRoom(resources, rsvps),
          cluster: clusterArn.match(/arn:aws:ecs:.*:\d*:cluster\/(.*)/)[1]
        };
        return callback(null, result);
      });
    });
  });
}

function getClusterArn(argv, callback) {
  /* Confirm that region and stack are provided */
  if (!argv.region || !argv.stack) {
    var text = 'Usage:   worker-capacity --region <region>  --stack <stack_name>\n';
    text += 'Example: worker-capacity --region us-east-1 --stack ecs-telephone-staging';
    return callback(text);
  }

  /* Get the CloudFormation template */
  var cloudformation = new AWS.CloudFormation({ region: argv.region });
  cloudformation.describeStacks({ StackName: argv.stack }, (err, res) => {
    if (err) return callback(new Error(err));
    if (!res.Stacks[0] || !res.Stacks[0].Outputs.length) return callback(new Error('Check that the provided region and stack name are correct. You may need to re-create your stack to expose the Outputs property.'));

    var cluster = res.Stacks[0].Outputs.find((o) => { return o.OutputKey === 'ClusterArn'; });
    if (!cluster) return callback(new Error('Recreate your stack to expose the cluster ARN output.'));
    return callback(null, cluster.OutputValue);
  });
}

function getReservations(argv, callback) {
  var cloudformation = new AWS.CloudFormation({ region: argv.region });
  cloudformation.getTemplate({ StackName: argv.stack }, (err, res) => {
    if (err) return callback(new Error(err));
    var worker = JSON.parse(res.TemplateBody).Resources.WatchbotWorker.Properties.ContainerDefinitions[0];
    return callback(null, { Memory: worker.Memory, Cpu: worker.Cpu });
  });
}

function listInstances(cluster, callback) {
  var ecs = new AWS.ECS({ region: argv.region });
  var resources = {};

  ecs.listContainerInstances({ cluster: cluster }).eachPage((err, data, done) => {
    if (err) return callback(new Error(err));
    if (!data) return done();
    ecs.describeContainerInstances({ cluster: cluster, containerInstances: data.containerInstanceArns }, (err, data) => {
      if (err) return callback(new Error(err));
      data.containerInstances.forEach((i) => {
        resources[i.ec2InstanceId] = i.remainingResources;
      });
      return callback(null, resources);
    });
  });
}

function calculateRoom(resources, rsvps) {
  var taskCapacity = 0;
  for (var i in resources) {
    var cpu = resources[i].find((e) => { return e.name === 'CPU' }).integerValue;
    var memory = resources[i].find((e) => { return e.name === 'MEMORY' }).integerValue;
    var taskCapacityCpu = (cpu / rsvps.Cpu).toFixed(0);
    var taskCapacityMemory = (memory / rsvps.Memory).toFixed(0);
    taskCapacity += Math.min(taskCapacityCpu, taskCapacityMemory);
  };
  return taskCapacity;
}

function print(message) {
  console.log('\n' + message + '\n');
}
