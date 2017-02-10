module.exports = {};

module.exports.describeStacks = {
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

module.exports.describeStackResources = {
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

module.exports.describeStackResources = {
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

module.exports.describeTaskDefinitionSoftMem = {
  taskDefinition: {
    containerDefinitions: [
      {
        cpu: 256,
        memoryReservation: 128
      }
    ]
  }
};

module.exports.describeTaskDefinitionHardMem = {
  taskDefinition: {
    containerDefinitions: [
      {
        cpu: 256,
        memory: 128
      }
    ]
  }
};

module.exports.describeTaskDefinitionBothMem = {
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

module.exports.listContainerInstances = {
  containerInstanceArns: [
    'arn:aws:ecs:us-east-1:123456789000:container-instance/00000000-ffff-0000-ffff-000000000000',
    'arn:aws:ecs:us-east-1:123456789000:container-instance/ffffffff-0000-ffff-0000-ffffffffffff'
  ]
};

module.exports.listContainerInstancesPage0 = {
  containerInstanceArns: [module.exports.listContainerInstances.containerInstanceArns[0]]
};

module.exports.listContainerInstancesPage1 = {
  containerInstanceArns: [module.exports.listContainerInstances.containerInstanceArns[1]]
};

module.exports.describeContainerInstances = {
  containerInstances: [
    {
      ec2InstanceId: 'i-00000000000000000',
      remainingResources: [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 184306
        }
      ]
    },
    {
      ec2InstanceId: 'i-fffffffffffffffff',
      remainingResources: [
        {
          name: 'CPU',
          integerValue: 32768
        },
        {
          name: 'MEMORY',
          integerValue: 183986
        }
      ]
    }
  ]
};

module.exports.describeContainerInstances0 = {
  containerInstances: [module.exports.describeContainerInstances.containerInstances[0]]
};

module.exports.describeContainerInstances1 = {
  containerInstances: [module.exports.describeContainerInstances.containerInstances[1]]
};
