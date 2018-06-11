const cf = require('@mapbox/cloudfriend');

module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'ecs-clusters ci resources for validating the template',
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
                  Action: ['cloudformation:ValidateTemplate'],
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
        UserName: cf.ref('User')
      }
    }
  },
  Outputs: {
    AccessKeyId: { Value: cf.ref('AccessKey') },
    SecretAccessKey: { Value: cf.getAtt('AccessKey', 'SecretAccessKey') }
  }
};

