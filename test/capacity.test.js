var AWS = require('@mapbox/mock-aws-sdk-js');
var file = require('../lib/capacity');
var fixtures = require('./fixtures/capacity');
var test = require('tape');

var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
var cluster = 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000';
var error = 'some error';

test('[capacity] run - missing region', (assert) => {
  file.run(['cats-api-staging'], (err) => {
    assert.equal(err, 'Usage:   worker-capacity <region> <stack_name>\nExample: worker-capacity us-east-1 cats-api-staging');
    assert.end();
  });
});

test('[capacity] run - missing stack', (assert) => {
  file.run(['us-east-1'], (err) => {
    assert.equal(err, 'Usage:   worker-capacity <region> <stack_name>\nExample: worker-capacity us-east-1 cats-api-staging');
    assert.end();
  });
});

test('[capacity] run', (assert) => {
  AWS.stub('CloudFormation', 'describeStacks').yields(null, fixtures.describeStacks);
  AWS.stub('CloudFormation', 'describeStackResources').yields(null, fixtures.describeStackResources);
  AWS.stub('ECS', 'describeTaskDefinition').yields(null, fixtures.describeTaskDefinitionBothMem);
  AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, fixtures.listContainerInstancesPage0, () => {
        callback(null, fixtures.listContainerInstancesPage1, () => {
          callback();
        });
      });
    }
  });
  var describeContainerInstances = AWS.stub('ECS', 'describeContainerInstances');
  describeContainerInstances.onCall(0).yields(null, fixtures.describeContainerInstances0);
  describeContainerInstances.onCall(1).yields(null, fixtures.describeContainerInstances1);

  file.run(['us-east-1', 'cats-api-staging'], (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { capacity: 256, cluster: 'some-cluster-Cluster-000000000000', stack: 'cats-api-staging' });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getClusterArn - describeStacks error', (assert) => {
  var describeStacks = AWS.stub('CloudFormation', 'describeStacks').yields(error);

  file.getClusterArn(argv, (err) => {
    assert.deepEqual(describeStacks.firstCall.args[0], { StackName: argv.stack });
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[capacity] getClusterArn', (assert) => {
  var describeStacks = AWS.stub('CloudFormation', 'describeStacks').yields(null, fixtures.describeStacks);

  file.getClusterArn(argv, (err, res) => {
    assert.deepEqual(describeStacks.firstCall.args[0], { StackName: argv.stack });
    assert.ifError(err, 'should not error');
    assert.equal(res, fixtures.describeStacks.Stacks[0].Outputs[0].OutputValue);
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[capacity] getReservations - describeStackResources error', (assert) => {
  var describeStackResources = AWS.stub('CloudFormation', 'describeStackResources').yields(error);
  var describeTaskDefinition = AWS.stub('ECS', 'describeTaskDefinition');

  file.getReservations(argv, (err) => {
    assert.deepEqual(describeStackResources.firstCall.args[0], { StackName: argv.stack });
    assert.equal(describeTaskDefinition.called, false, 'ecs.describeTaskDefinition should not be called');
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - describeTaskDefinition error', (assert) => {
  var describeStackResources = AWS.stub('CloudFormation', 'describeStackResources').yields(null, fixtures.describeStackResources);
  var describeTaskDefinition = AWS.stub('ECS', 'describeTaskDefinition').yields(error);

  file.getReservations(argv, (err) => {
    assert.deepEqual(describeStackResources.firstCall.args[0], { StackName: argv.stack });
    assert.deepEqual(describeTaskDefinition.firstCall.args[0], { taskDefinition: fixtures.describeStackResources.StackResources[0].PhysicalResourceId });
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - soft memory', (assert) => {
  var describeStackResources = AWS.stub('CloudFormation', 'describeStackResources').yields(null, fixtures.describeStackResources);
  var describeTaskDefinition = AWS.stub('ECS', 'describeTaskDefinition').yields(null, fixtures.describeTaskDefinitionSoftMem);

  file.getReservations(argv, (err, res) => {
    assert.deepEqual(describeStackResources.firstCall.args[0], { StackName: argv.stack });
    assert.deepEqual(describeTaskDefinition.firstCall.args[0], { taskDefinition: fixtures.describeStackResources.StackResources[0].PhysicalResourceId });
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - hard memory', (assert) => {
  var describeStackResources = AWS.stub('CloudFormation', 'describeStackResources').yields(null, fixtures.describeStackResources);
  var describeTaskDefinition = AWS.stub('ECS', 'describeTaskDefinition').yields(null, fixtures.describeTaskDefinitionHardMem);

  file.getReservations(argv, (err, res) => {
    assert.deepEqual(describeStackResources.firstCall.args[0], { StackName: argv.stack });
    assert.deepEqual(describeTaskDefinition.firstCall.args[0], { taskDefinition: fixtures.describeStackResources.StackResources[0].PhysicalResourceId });
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - both memories', (assert) => {
  var describeStackResources = AWS.stub('CloudFormation', 'describeStackResources').yields(null, fixtures.describeStackResources);
  var describeTaskDefinition = AWS.stub('ECS', 'describeTaskDefinition').yields(null, fixtures.describeTaskDefinitionBothMem);

  file.getReservations(argv, (err, res) => {
    assert.deepEqual(describeStackResources.firstCall.args[0], { StackName: argv.stack });
    assert.deepEqual(describeTaskDefinition.firstCall.args[0], { taskDefinition: fixtures.describeStackResources.StackResources[0].PhysicalResourceId });
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] listInstances - listContainerInstances error', (assert) => {
  var listContainerInstances = AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(error);
    }
  });
  var describeContainerInstances = AWS.stub('ECS', 'describeContainerInstances');

  file.listInstances(argv, cluster, (err) => {
    assert.deepEqual(listContainerInstances.firstCall.args, [{ cluster: cluster }]);
    assert.equal(describeContainerInstances.called, false, 'should not have called ecs.describeContainerInstances');
    assert.equal(err.message, error);
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] listInstances - describeContainerInstances error', (assert) => {
  var listContainerInstances = AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, fixtures.listContainerInstances, () => {
        callback();
      });
    }
  });
  var describeContainerInstances = AWS.stub('ECS', 'describeContainerInstances').yields(error);

  file.listInstances(argv, cluster, (err) => {
    assert.deepEqual(listContainerInstances.firstCall.args[0], { cluster: cluster });
    assert.deepEqual(describeContainerInstances.firstCall.args[0], { cluster: cluster, containerInstances: fixtures.listContainerInstances.containerInstanceArns });
    assert.equal(err.message, error);
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] listInstances - single page', (assert) => {
  var listContainerInstances = AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, listContainerInstances, () => {
        callback();
      });
    }
  });
  var describeContainerInstances = AWS.stub('ECS', 'describeContainerInstances').yields(null, fixtures.describeContainerInstances);

  file.listInstances(argv, cluster, (err, res) => {
    assert.deepEqual(listContainerInstances.firstCall.args[0], { cluster: cluster });
    assert.deepEqual(describeContainerInstances.firstCall.args[0], { cluster: cluster, containerInstances: listContainerInstances.containerInstanceArns });
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, [
      [{ name: 'CPU', integerValue: 32768 }, { name: 'MEMORY', integerValue: 184306 }],
      [{ name: 'CPU', integerValue: 32768 }, { name: 'MEMORY', integerValue: 183986 }]
    ]);
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] listInstances - multiple pages', (assert) => {
  var listContainerInstances = AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, fixtures.listContainerInstancesPage0, () => {
        callback(null, fixtures.listContainerInstancesPage1, () => {
          callback();
        });
      });
    }
  });
  var describeContainerInstances = AWS.stub('ECS', 'describeContainerInstances');
  describeContainerInstances.onCall(0).yields(null, fixtures.describeContainerInstances0);
  describeContainerInstances.onCall(1).yields(null, fixtures.describeContainerInstances1);

  file.listInstances(argv, cluster, (err, res) => {
    assert.deepEqual(listContainerInstances.firstCall.args[0], { cluster: cluster });
    assert.deepEqual(describeContainerInstances.firstCall.args[0], {
      cluster: 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000',
      containerInstances: ['arn:aws:ecs:us-east-1:123456789000:container-instance/00000000-ffff-0000-ffff-000000000000']
    });
    assert.deepEqual(describeContainerInstances.secondCall.args[0], {
      cluster: 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000',
      containerInstances: ['arn:aws:ecs:us-east-1:123456789000:container-instance/ffffffff-0000-ffff-0000-ffffffffffff']
    });
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, [
      [{ name: 'CPU', integerValue: 32768 }, { name: 'MEMORY', integerValue: 184306 }],
      [{ name: 'CPU', integerValue: 32768 }, { name: 'MEMORY', integerValue: 183986 }]
    ]);
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] calculateRoom - no room', (assert) => {
  var reservation = { Cpu: '256', Memory: '512' };
  var noCpu = [[{ name: 'CPU', integerValue: '0' }, { name: 'MEMORY', integerValue: '1000' }]];
  var noMem = [[{ name: 'CPU', integerValue: '1000' }, { name: 'MEMORY', integerValue: '0' }]];

  assert.equal(file.calculateRoom(noCpu, reservation), 0, 'should return room for 0 workers if no CPU remaining');
  assert.equal(file.calculateRoom(noMem, reservation), 0, 'should return room for 0 workers if no memory remaining');
  assert.end();
});

test('[capacity] calculateRoom - room', (assert) => {
  var reservation = { Cpu: '256', Memory: '512' };
  var resources = [
    [{ name: 'CPU', integerValue: '20000' }, { name: 'MEMORY', integerValue: '30000' }],
    [{ name: 'CPU', integerValue: '40000' }, { name: 'MEMORY', integerValue: '40000' }],
    [{ name: 'CPU', integerValue: '60000' }, { name: 'MEMORY', integerValue: '50000' }]
  ];

  var result = file.calculateRoom(resources, reservation);
  assert.equal(result, 235, 'should equal sum of tasks per instance based on most limited resource');
  assert.end();
});
