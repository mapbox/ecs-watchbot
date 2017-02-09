var AWS = require('@mapbox/mock-aws-sdk-js');
var file = require('../lib/capacity');
var sinon = require('sinon');
var test = require('tape');

test('[capacity] getClusterArn - describeStacks error', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var error = 'some error';

  AWS.stub('CloudFormation', 'describeStacks', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(error);
  });

  file.getClusterArn(argv, (err, res) => {
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[capacity] getClusterArn', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var describeStacks = {
    Stacks: [
      {
        StackId: 'arn:aws:cloudformation:us-east-1:123456789000:stack/cats-api-staging/00000000-ffff-0000-ffff-000000000000',
        StackName: 'cats-api-staging',
        Outputs: [
          {
            OutputKey: 'ClusterArn',
            OutputValue: 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000',
            Description: 'Service cluster ARN'
          },
          {
            OutputKey: 'SomeOtherOutputKey',
            OutputValue: 'SomeOtherOutputValue',
            Description: 'Decoy output!'
          }
        ]
      }
    ]
  };

  AWS.stub('CloudFormation', 'describeStacks', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(null, describeStacks);
  });

  file.getClusterArn(argv, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.equal(res, describeStacks.Stacks[0].Outputs[0].OutputValue);
    AWS.CloudFormation.restore();
    assert.end();
  });
});

test('[capacity] getReservations - describeStackResources error', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var error = 'some error';

  AWS.stub('CloudFormation', 'describeStackResources', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(error);
  });

  AWS.stub('ECS', 'describeTaskDefinition', (params, callback) => {
    assert.ifError(params, 'ecs.describeTaskDefinition should not be called');
  });

  file.getReservations(argv, (err, res) => {
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - describeTaskDefinition error', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var error = 'some error';
  var describeStackResources = {
    StackResources: [
      {
        StackName: 'cats-api-staging',
        StackId: 'arn:aws:cloudformation:us-east-1:123456789000:stack/cats-api-staging/00000000-ffff-0000-ffff-000000000000',
        LogicalResourceId: 'WatchbotWorker',
        PhysicalResourceId: 'arn:aws:ecs:us-east-1:123456789000:task-definition/cats-api-staging-WatchbotWorker-000000000000:1',
        ResourceType: 'AWS::ECS::TaskDefinition',
        Timestamp: '2017-02-09T18:31:48.982Z',
        ResourceStatus: 'CREATE_COMPLETE'
      }
    ]
  };

  AWS.stub('CloudFormation', 'describeStackResources', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(null, describeStackResources);
  });

  AWS.stub('ECS', 'describeTaskDefinition', (params, callback) => {
    assert.deepEqual(params, { taskDefinition: describeStackResources.StackResources[0].PhysicalResourceId });
    return callback(error);
  });

  file.getReservations(argv, (err, res) => {
    assert.equal(err.message, error);
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - soft memory', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var describeStackResources = {
    StackResources: [
      {
        StackName: 'cats-api-staging',
        StackId: 'arn:aws:cloudformation:us-east-1:123456789000:stack/cats-api-staging/00000000-ffff-0000-ffff-000000000000',
        LogicalResourceId: 'WatchbotWorker',
        PhysicalResourceId: 'arn:aws:ecs:us-east-1:123456789000:task-definition/cats-api-staging-WatchbotWorker-000000000000:1',
        ResourceType: 'AWS::ECS::TaskDefinition',
        Timestamp: '2017-02-09T18:31:48.982Z',
        ResourceStatus: 'CREATE_COMPLETE'
      }
    ]
  };
  var describeTaskDefinition = {
    taskDefinition: {
      containerDefinitions: [
        {
          cpu: 256,
          memoryReservation: 128
        }
      ]
    }
  };

  AWS.stub('CloudFormation', 'describeStackResources', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(null, describeStackResources);
  });

  AWS.stub('ECS', 'describeTaskDefinition', (params, callback) => {
    assert.deepEqual(params, { taskDefinition: describeStackResources.StackResources[0].PhysicalResourceId });
    return callback(null, describeTaskDefinition);
  });

  file.getReservations(argv, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - hard memory', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var describeStackResources = {
    StackResources: [
      {
        StackName: 'cats-api-staging',
        StackId: 'arn:aws:cloudformation:us-east-1:123456789000:stack/cats-api-staging/00000000-ffff-0000-ffff-000000000000',
        LogicalResourceId: 'WatchbotWorker',
        PhysicalResourceId: 'arn:aws:ecs:us-east-1:123456789000:task-definition/cats-api-staging-WatchbotWorker-000000000000:1',
        ResourceType: 'AWS::ECS::TaskDefinition',
        Timestamp: '2017-02-09T18:31:48.982Z',
        ResourceStatus: 'CREATE_COMPLETE'
      }
    ]
  };
  var describeTaskDefinition = {
    taskDefinition: {
      containerDefinitions: [
        {
          cpu: 256,
          memory: 128
        }
      ]
    }
  };

  AWS.stub('CloudFormation', 'describeStackResources', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(null, describeStackResources);
  });

  AWS.stub('ECS', 'describeTaskDefinition', (params, callback) => {
    assert.deepEqual(params, { taskDefinition: describeStackResources.StackResources[0].PhysicalResourceId });
    return callback(null, describeTaskDefinition);
  });

  file.getReservations(argv, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] getReservations - both memories', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var describeStackResources = {
    StackResources: [
      {
        StackName: 'cats-api-staging',
        StackId: 'arn:aws:cloudformation:us-east-1:123456789000:stack/cats-api-staging/00000000-ffff-0000-ffff-000000000000',
        LogicalResourceId: 'WatchbotWorker',
        PhysicalResourceId: 'arn:aws:ecs:us-east-1:123456789000:task-definition/cats-api-staging-WatchbotWorker-000000000000:1',
        ResourceType: 'AWS::ECS::TaskDefinition',
        Timestamp: '2017-02-09T18:31:48.982Z',
        ResourceStatus: 'CREATE_COMPLETE'
      }
    ]
  };
  var describeTaskDefinition = {
    taskDefinition: {
      containerDefinitions: [
        {
          cpu: 256,
          memory: 128,
          memoryReservation: 64
        }
      ]
    }
  };

  AWS.stub('CloudFormation', 'describeStackResources', (params, callback) => {
    assert.deepEqual(params, { StackName: argv.stack });
    return callback(null, describeStackResources);
  });

  AWS.stub('ECS', 'describeTaskDefinition', (params, callback) => {
    assert.deepEqual(params, { taskDefinition: describeStackResources.StackResources[0].PhysicalResourceId });
    return callback(null, describeTaskDefinition);
  });

  file.getReservations(argv, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, { Memory: 128, Cpu: 256 });
    AWS.CloudFormation.restore();
    AWS.ECS.restore();
    assert.end();
  });
});

test('[capacity] listInstances - single page', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var cluster = 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000';
  var listContainerInstances = {
    containerInstanceArns: [
      'arn:aws:ecs:us-east-1:123456789000:container-instance/00000000-ffff-0000-ffff-000000000000',
      'arn:aws:ecs:us-east-1:123456789000:container-instance/ffffffff-0000-ffff-0000-ffffffffffff'
    ]
  };
  var describeContainerInstances = {
    "containerInstances": [
      {
        "ec2InstanceId": "i-00000000000000000",
        "remainingResources": [
          {
            "name": "CPU",
            "integerValue": 32768
          },
          {
            "name": "MEMORY",
            "integerValue": 184306
          }
        ]
      },
      {
        "ec2InstanceId": "i-fffffffffffffffff",
        "remainingResources": [
          {
            "name": "CPU",
            "integerValue": 32768
          },
          {
            "name": "MEMORY",
            "integerValue": 183986
          }
        ]
      }
    ]
  };

  AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, listContainerInstances);
    }
  });

  AWS.stub('ECS', 'describeContainerInstances', (params, callback) => {
    assert.deepEqual(params, { cluster: cluster, containerInstances: listContainerInstances.containerInstanceArns });
    callback(null, describeContainerInstances);
  });

  file.listInstances(argv, cluster, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, {
      'i-00000000000000000': [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 184306
        }
      ],
      'i-fffffffffffffffff': [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 183986
        }
      ]
    });
    AWS.ECS.restore();
    assert.end();
  })
});

test('[capacity] listInstances - multiple pages', (assert) => {
  var argv = { region: 'us-east-1', stack: 'cats-api-staging' };
  var cluster = 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000';
  var listContainerInstances1 = {
    containerInstanceArns: [
      'arn:aws:ecs:us-east-1:123456789000:container-instance/00000000-ffff-0000-ffff-000000000000'
    ]
  };
  var listContainerInstances2 = {
    containerInstanceArns: [
      'arn:aws:ecs:us-east-1:123456789000:container-instance/ffffffff-0000-ffff-0000-ffffffffffff'
    ]
  };
  var describeContainerInstances = {
    "containerInstances": [
      {
        "ec2InstanceId": "i-00000000000000000",
        "remainingResources": [
          {
            "name": "CPU",
            "integerValue": 32768
          },
          {
            "name": "MEMORY",
            "integerValue": 184306
          }
        ]
      },
      {
        "ec2InstanceId": "i-fffffffffffffffff",
        "remainingResources": [
          {
            "name": "CPU",
            "integerValue": 32768
          },
          {
            "name": "MEMORY",
            "integerValue": 183986
          }
        ]
      }
    ]
  };

  AWS.stub('ECS', 'listContainerInstances').returns({
    eachPage: (callback) => {
      callback(null, listContainerInstances1, () => {
        callback(null, listContainerInstances2, () => {
          callback();
        });
      });
    }
  });

  AWS.stub('ECS', 'describeContainerInstances', (params, callback) => {
    assert.deepEqual(params, { cluster: 'arn:aws:ecs:us-east-1:123456789000:cluster/some-cluster-Cluster-000000000000', containerInstances: [ 'arn:aws:ecs:us-east-1:123456789000:container-instance/00000000-ffff-0000-ffff-000000000000' ] });
    callback(null, describeContainerInstances);
  });

  file.listInstances(argv, cluster, (err, res) => {
    assert.ifError(err, 'should not error');
    assert.deepEqual(res, {
      'i-00000000000000000': [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 184306
        }
      ],
      'i-fffffffffffffffff': [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 183986
        }
      ]
    });
    AWS.ECS.restore();
    assert.end();
  })
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
  var expected = Math.min((resources[0][0].integerValue/reservation.Cpu).toFixed(0), (resources[0][1].integerValue/reservation.Memory).toFixed(0)) +
                 Math.min((resources[1][0].integerValue/reservation.Cpu).toFixed(0), (resources[1][1].integerValue/reservation.Memory).toFixed(0)) +
                 Math.min((resources[2][0].integerValue/reservation.Cpu).toFixed(0), (resources[2][1].integerValue/reservation.Memory).toFixed(0));
  assert.equal(result, expected, 'should equal sum of tasks per instance based on most limited resource');
  assert.end();
});
