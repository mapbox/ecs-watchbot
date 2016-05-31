module.exports.Parameters = {
  WatchbotMessageTimeout: {
    Description: 'Approx. number of seconds per job',
    Type: 'Number',
    Default: 600
  },
  WatchbotMessageRetentionPeriod: {
    Description: 'Number of seconds before a message is dropped from the queue',
    Type: 'Number',
    Default: 1209600
  }
};

module.exports.Resources = {
  WatchbotQueue: {
    Type: 'AWS::SQS::Queue',
    Description: 'Watchbot\'s backlog of messages to process',
    Properties: {
      VisibilityTimeout: { Ref: 'WatchbotMessageTimeout' },
      QueueName: { Ref: 'AWS::StackName' },
      MessageRetentionPeriod: { Ref: 'WatchbotMessageRetentionPeriod' }
    }
  },
  WatchbotWorkTopic: {
    Type: 'AWS::SNS::Topic',
    Description: 'Send messages to this topic to trigger tasks',
    Properties: {
      Subscription: [
        {
          Endpoint: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] },
          Protocol: 'sqs'
        }
      ]
    }
  },
  WatchbotQueuePolicy: {
    Type: 'AWS::SQS::QueuePolicy',
    Description: 'A policy allowing the work topic to enqueue messages',
    Properties: {
      Queues: [{ Ref: 'WatchbotQueue' }],
      PolicyDocument: {
        Version: '2008-10-17',
        Id: 'WatchbotQueue',
        Statement: [
          {
            Sid: 'SendSomeMessages',
            Effect: 'Allow',
            Principal: { AWS: '*' },
            Action: ['sqs:SendMessage'],
            Resource: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] },
            Condition: {
              ArnEquals: {
                'aws:SourceArn': { Ref: 'WatchbotWorkTopic' }
              }
            }
          }
        ]
      }
    }
  }
};

module.exports.Outputs = {
  WatchbotSns: {
    Description: 'The ARN of Watchbot\'s SNS topic. Send messages to this topic to be processed by Watchbot',
    Value: { Ref: 'WatchbotWorkTopic' }
  },
  WatchbotQueueUrl: {
    Description: 'The URL of Watchbot\'s SQS queue',
    Value: { Ref: 'WatchbotQueue' }
  },
  WatchbotQueueArn: {
    Description: 'The ARN of Watchbot\'s SQS queue',
    Value: { 'Fn::GetAtt': ['WatchbotQueue', 'Arn'] }
  },
  WatchbotQueueName: {
    Description: 'The name of Watchbot\'s SQS queue',
    Value: { 'Fn::GetAtt': ['WatchbotQueue', 'QueueName'] }
  }
};
