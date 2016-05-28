module.exports.Resources = {
  WatchbotWebhookKey: {
    Type: 'AWS::ApiGateway::ApiKey',
    DependsOn: 'WatchbotWebhookDeployment',
    Properties: {
      Name: { 'Fn::Join': ['', ['watchbot-webhook-', { Ref: 'AWS::StackName' }]] },
      Enabled: true,
      StageKeys: [{ RestApiId: { Ref: 'WatchbotWebhookApi' }, StageName: 'watchbot' }]
    }
  }
};

module.exports.Outputs = {
  WatchbotWebhookKey: {
    Description: 'The API key required to send webhooks to Watchbot',
    Value: { Ref: 'WatchbotWebhookKey' }
  }
};
