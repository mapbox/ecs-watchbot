module.exports.Parameters = {
  WatchbotQueueSizeAlarm: {
    Description: 'Queue depth that triggers alarm',
    Type: 'Number',
    Default: 40
  },
  WatchbotQueueSizeAlarmPeriod: {
    Description: 'Number of 5-min periods of elevated queue depth that will trigger an alarm',
    Type: 'Number',
    Default: 24
  }
};

module.exports.Resources = {
  WatchbotWatchbotQueueSizeAlarm: {
    Type: 'AWS::CloudWatch::Alarm',
    Description: 'An alarm that is tripped when too many messages are in Watchbot\'s queue',
    Properties: {
      AlarmDescription: {
        'Fn::Join': [
          ' ', [
            'Alarm if more than',
            { Ref: 'WatchbotQueueSizeAlarm' },
            'messages in the queue for ',
            { Ref: 'WatchbotQueueSizeAlarmPeriod' },
            'consecutive 5 minute periods'
          ]
        ]
      },
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Namespace: 'AWS/SQS',
      Statistic: 'Average',
      Period: '300',
      EvaluationPeriods: { Ref: 'WatchbotQueueSizeAlarmPeriod' },
      Threshold: { Ref: 'WatchbotQueueSizeAlarm' },
      AlarmActions: [{ Ref: 'WatchbotNotificationTopic' }],
      Dimensions: [
        {
          Name: 'QueueName',
          Value: { 'Fn::GetAtt': ['WatchbotQueue', 'QueueName'] }
        }
      ],
      ComparisonOperator: 'GreaterThanThreshold'
    }
  }
};
