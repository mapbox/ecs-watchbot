module.exports.Resources = {
  WatchbotUser: {
    Type: 'AWS::IAM::User',
    Description: 'An AWS user with permission to publish the the work topic',
    Properties: {
      Path: '/service/',
      Policies: [
        {
          PolicyName: {
            'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, 'publish-to-sns']]
          },
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: ['sns:Publish'],
                Resource: [{ Ref: 'WatchbotWorkTopic' }]
              }
            ]
          }
        }
      ]
    }
  },
  WatchbotUserKey: {
    Type: 'AWS::IAM::AccessKey',
    Description: 'AWS access keys to authenticate as the Watchbot user',
    Properties: {
      Status: 'Active',
      UserName: { Ref: 'WatchbotUser' }
    }
  }
};

module.exports.Outputs = {
  WatchbotAccessKeyId: {
    Description: 'An access key with permission to publish messages to Watchbot',
    Value: { Ref: 'WatchbotUserKey' }
  },
  WatchbotSecretAccessKey: {
    Description: 'A secret access key with permission to publish messages to Watchbot',
    Value: { 'Fn::GetAtt': ['WatchbotUserKey', 'SecretAccessKey'] }
  }
};
