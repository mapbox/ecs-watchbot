module.exports.Parameters = {
  TaskRepo: {
    Description: 'The name of the task repository',
    Type: 'String'
  },
  TaskGitSha: {
    Description: 'The SHA of the task repository to use',
    Type: 'String'
  },
  TaskMemory: {
    Description: 'The number of MB of memory to reserve for each task',
    Type: 'Number',
    Default: 128
  }
};

module.exports.Resources = {
  WatchbotTaskPolicy: {
    Type: 'AWS::IAM::Policy',
    Description: 'The IAM policy required by your task',
    Properties: {
      Roles: [{ Ref: 'WatchbotClusterRole' }],
      PolicyName: { 'Fn::Join': ['', ['watchbot-task-', { Ref: 'AWS::StackName' }]] },
      PolicyDocument: {
        Statement: []
      }
    }
  },
  WatchbotTask: {
    Type : 'AWS::ECS::TaskDefinition',
    Description: 'The task definition responsible for processing messages',
    DependsOn: 'WatchbotTaskPolicy',
    Properties: {
      ContainerDefinitions: [
        {
          Name: { Ref: 'TaskRepo' },
          Image: {
            'Fn::Join': [
              '', [
                { Ref: 'AWS::AccountId' },
                '.dkr.ecr.',
                { Ref: 'AWS::Region' },
                '.amazonaws.com/',
                { Ref: 'TaskRepo'},
                ':',
                { Ref: 'TaskGitSha' }
              ]
            ]
          },
          Memory: { Ref: 'TaskMemory' },
          Environment: undefined,
          MountPoints: undefined,
          LogConfiguration: {
            LogDriver: 'syslog',
            Options: {
              'syslog-address': 'udp://localhost:514'
            }
          }
        }
      ],
      Volumes: undefined
    }
  }
};
