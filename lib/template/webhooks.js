module.exports.Resources = {
  WatchbotWebhookApi: {
    Type: 'AWS::ApiGateway::RestApi',
    Properties: {
      Name: { 'Fn::Join': ['-', ['watchbot-webhook', { Ref: 'AWS::StackName' }]] },
      FailOnWarnings: true
    }
  },
  WatchbotWebhookDeployment: {
    Type: 'AWS::ApiGateway::Deployment',
    DependsOn: 'WatchbotWebhookMethod',
    Properties: {
      RestApiId: { Ref: 'WatchbotWebhookApi' },
      StageName: 'watchbot',
      StageDescription: {
        HttpMethod: '*',
        ResourcePath: '/*',
        ThrottlingBurstLimit: 20,
        ThrottlingRateLimit: 5
      }
    }
  },
  WatchbotWebhookMethod: {
    Type: 'AWS::ApiGateway::Method',
    Properties: {
      RestApiId: { Ref: 'WatchbotWebhookApi' },
      ResourceId: { Ref: 'WatchbotWebhookResource' },
      ApiKeyRequired: true,
      AuthorizationType: 'None',
      HttpMethod: 'POST',
      Integration: {
        Type: 'AWS',
        IntegrationHttpMethod: 'POST',
        IntegrationResponses: [
          { StatusCode: 200 },
          { StatusCode: 500, SelectionPattern: '^error.*' }
        ],
        Uri: {
          'Fn::Join': [
            '', [
              'arn:aws:apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              { 'Fn::GetAtt': ['WatchbotWebhookFunction', 'Arn'] },
              '/invocations'
            ]
          ]
        }
      },
      MethodResponses: [
        { StatusCode: '200', ResponseModels: { 'application/json': 'Empty' } },
        { StatusCode: '500', ResponseModels: { 'application/json': 'Empty' } }
      ]
    }
  },
  WatchbotWebhookResource: {
    Type: 'AWS::ApiGateway::Resource',
    Properties: {
      ParentId: { 'Fn::GetAtt': ['WatchbotWebhookApi', 'RootResourceId'] },
      RestApiId: { Ref: 'WatchbotWebhookApi' },
      PathPart: 'webhooks'
    }
  },
  WatchbotWebhookFunctionRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Sid: 'webhookrole',
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole'
          }
        ]
      },
      Policies: [
        {
          PolicyName: 'WatchbotWebhookPolicy',
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Action: ['logs:*'],
                Resource: ['arn:aws:logs:*:*:*']
              },
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
  WatchbotWebhookFunction: {
    Type: 'AWS::Lambda::Function',
    Properties: {
      Code: {
        ZipFile: {
          'Fn::Join': [
            '\n', [
              'var AWS = require("aws-sdk");',
              { 'Fn::Join': ['', ['var sns = new AWS.SNS({ region: "', { Ref: 'AWS::Region' }, '" });']] },
              { 'Fn::Join': ['', ['var topic = "', { Ref: 'WatchbotWorkTopic' }, '";']] },
              'module.exports.webhooks = function(event, context) {',
              '  var params = {',
              '    TopicArn: topic,',
              '    Subject: event.Subject || "webhook",',
              '    Message: event.Message || JSON.stringify(event)',
              '  };',
              '  sns.publish(params, function(err) {',
              '    if (err) return context.done("error: " + err.message);',
              '    context.done(null, "success");',
              '  });',
              '};'
            ]
          ]
        }
      },
      Role: { 'Fn::GetAtt': ['WatchbotWebhookFunctionRole', 'Arn'] },
      Description: { 'Fn::Join': ['', ['watchbot webhooks for ', { Ref: 'AWS::StackName' }]] },
      Handler: 'index.webhooks',
      Runtime: 'nodejs',
      Timeout: 30,
      MemorySize: 128
    }
  },
  WatchbotWebhookPermission: {
    Type: 'AWS::Lambda::Permission',
    Properties:{
      FunctionName: { Ref: 'WatchbotWebhookFunction' },
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: {
        'Fn::Join': [
          '', [
            'arn:aws:execute-api:',
            { Ref: 'AWS::Region' }, ':',
            { Ref: 'AWS::AccountId' }, ':',
            { Ref: 'WatchbotWebhookApi' }, '/*'
          ]
        ]
      }
    }
  }
};

module.exports.Outputs = {
  WatchbotWebhookEndpoint: {
    Description: 'The HTTPS endpoint used to send webhooks to Watchbot',
    Value: {
      'Fn::Join': [
        '', [
          'https://',
          { Ref: 'WatchbotWebhookApi' },
          '.execute-api.',
          { Ref: 'AWS::Region' },
          '.amazonaws.com/watchbot/webhooks'
        ]
      ]
    }
  }
};
