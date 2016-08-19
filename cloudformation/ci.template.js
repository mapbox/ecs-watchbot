var cloudfriend = require('cloudfriend');

module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Resources: {
    User: {
      Type: 'AWS::IAM::User',
      Properties: {
        Policies: [
          {
            PolicyName: 'validate-templates',
            PolicyDocument: {
              Statement: [
                {
                  Action: 'cloudformation:ValidateTemplate',
                  Effect: 'Allow',
                  Resource: '*'
                }
              ]
            }
          }
        ]
      }
    },
    AccessKey: {
      Type: 'AWS::IAM::AccessKey',
      Properties: {
        UserName: cloudfriend.ref('User')
      }
    }
  },
  Outputs: {
    AccessKeyId: { Value: cloudfriend.ref('AccessKey') },
    SecretAccessKey: { Value: cloudfriend.getAtt('AccessKey', 'SecretAccessKey') }
  }
};
