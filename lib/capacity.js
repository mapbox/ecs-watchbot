var AWS = require('aws-sdk');

module.exports = {};
module.exports.run = run;
module.exports.getClusterArn = getClusterArn;
module.exports.getReservations = getReservations;
module.exports.listInstances = listInstances;
module.exports.calculateRoom = calculateRoom;

function run(argv, callback) {
  /* Confirm that region and stack are provided */
  var usage = 'Usage:   worker-capacity <region> <stack_name>\n';
  usage += 'Example: worker-capacity us-east-1 cats-api-staging';

  if (argv.length !== 2) return callback(usage);
  argv = { region: argv[0], stack: argv[1] };

  /* Run functions */
  getClusterArn(argv, (err, clusterArn) => {
    if (err) return callback(err);
    getReservations(argv, (err, reservations) => {
      if (err) return callback(err);
      listInstances(argv, clusterArn, (err, resources) => {
        if (err) return callback(err);
        var result = {
          capacity: calculateRoom(resources, reservations),
          cluster: clusterArn.match(/arn:aws:ecs:.*:\d*:cluster\/(.*)/)[1],
          stack: argv.stack
        };
        return callback(null, result);
      });
    });
  });
}

function getClusterArn(argv, callback) {
  var cfn = new AWS.CloudFormation({ region: argv.region });

  cfn.describeStacks({ StackName: argv.stack }, (err, res) => {
    if (err) return callback(new Error(err));
    if (!res.Stacks[0] || !res.Stacks[0].Outputs.length) return callback(new Error('Check that the provided region and stack name are correct. You may need to re-create your stack to expose the Outputs property.'));

    var cluster = res.Stacks[0].Outputs.find((o) => { return o.OutputKey === 'ClusterArn'; });
    if (!cluster) return callback(new Error('Recreate your stack to expose the cluster ARN output.'));
    return callback(null, cluster.OutputValue);
  });
}

function getReservations(argv, callback) {
  var cfn = new AWS.CloudFormation({ region: argv.region });
  var ecs = new AWS.ECS({ region: argv.region });

  cfn.describeStackResources({ StackName: argv.stack }, (err, res) => {
    if (err) return callback(new Error(err));
    var worker = res.StackResources.find((r) => { return r.LogicalResourceId === 'WatchbotWorker'; }).PhysicalResourceId;
    ecs.describeTaskDefinition({ taskDefinition: worker }, (err, res) => {
      if (err) return callback(new Error(err));
      var def = res.taskDefinition.containerDefinitions[0];
      return callback(null, {
        Memory: def.memory || def.memoryReservation,
        Cpu: def.cpu
      });
    });
  });
}

function listInstances(argv, cluster, callback) {
  var ecs = new AWS.ECS({ region: argv.region });

  var resources = [];
  ecs.listContainerInstances({ cluster: cluster }).eachPage((err, data, done) => {
    if (err) return callback(new Error(err));
    if (!data) return callback(null, resources);
    ecs.describeContainerInstances({ cluster: cluster, containerInstances: data.containerInstanceArns }, (err, data) => {
      if (err) return callback(new Error(err));
      data.containerInstances.forEach((i) => { resources.push(i.remainingResources); });
      done();
    });
  });
}

function calculateRoom(resources, reservations) {
  return resources.reduce(function(memo, instance) {
    var workerCpu = instance.find((e) => { return e.name === 'CPU'; }).integerValue / reservations.Cpu;
    var workerMemory = instance.find((e) => { return e.name === 'MEMORY'; }).integerValue / reservations.Memory;
    return memo + Number(Math.min(workerCpu, workerMemory).toFixed(0));
  }, 0);
}
