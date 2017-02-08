#!/usr/bin/env node

var AWS = require('aws-sdk');
var argv = require('minimist')(process.argv.slice(2));

getClusterArn(argv, function(err, clusterArn) {
  if (err) print(err);
  if (clusterArn) print(clusterArn);
});

function getClusterArn(argv, callback) {
  /* Confirm that region and stack are provided */
  if (!argv.region || !argv.stack) {
    var text = 'Usage:   worker-capacity --region <region>  --stack <stack_name>\n';
    text += 'Example: worker-capacity --region us-east-1 --stack ecs-telephone-staging';
    return callback(text);
  }

  /* Get the CloudFormation template */
  var cloudformation = new AWS.CloudFormation({ region: argv.region });
  cloudformation.describeStacks({ StackName: argv.stack }, function(err, res) {
    if (err) return callback(new Error(err));
    return callback(null, res.Stacks[0].Parameters.find(function(p) { return p.ParameterKey === 'Cluster' }).ParameterValue);
  });
}

function print(message) {
  console.log('\n' + message + '\n');
};
