'use strict';

module.exports = JSON.stringify({
  widgets: [
    {
      type: 'metric',
      x: 0,
      y: 0,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotQueue: ApproximateNumberOfMessagesNotVisible, ApproximateNumberOfMessagesVisible',
        metrics: [
          ['AWS/SQS', 'ApproximateNumberOfMessagesNotVisible', 'QueueName', '${AWS::StackName}-WatchbotQueue', { period: 60 }],
          ['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', '${AWS::StackName}-WatchbotQueue', { period: 60 }]
        ],
        region: '${AWS::Region}',
        period: 60,
        yAxis: {
          left: {
            min: 0
          }
        }
      }
    },
    {
      type: 'metric',
      x: 0,
      y: 12,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotQueue: NumberOfMessagesDeleted',
        metrics: [
          ['AWS/SQS', 'NumberOfMessagesDeleted', 'QueueName', '${AWS::StackName}-WatchbotQueue', { period: 60 }]
        ],
        region: '${AWS::Region}',
        period: 60,
        yAxis: {
          left: {
            min: 0
          }
        }
      }
    },
    {
      type: 'metric',
      x: 12,
      y: 12,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotService: RunningCapacity, DesiredCapacity',
        metrics: [
          ['Mapbox/ecs-cluster', 'RunningCapacity', 'ClusterName', '${Cluster}', 'ServiceName', '${WatchbotService}', { period: 60 }],
          ['.', 'DesiredCapacity', '.', '.', '.', '.', { period: 60 }]
        ],
        region: '${AWS::Region}',
        period: 60
      }
    },
    {
      type: 'metric',
      x: 12,
      y: 12,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'Scaling as a function of the rate of processing',
        metrics: [
          ['Mapbox/ecs-cluster', 'RunningCapacity', 'ClusterName', '${Cluster}', 'ServiceName', '${WatchbotService}', { period: 60 }],
          ['.', 'DesiredCapacity', '.', '.', '.', '.', { period: 60 }],
          ['AWS/SQS', 'NumberOfMessagesDeleted', 'QueueName', '${AWS::StackName}-WatchbotQueue', { period: 60 }]
        ],
        region: '${AWS::Region}',
        period: 60
      }
    },
    {
      type: 'metric',
      x: 0,
      y: 18,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotService: CPUUtilization, MemoryUtilization',
        metrics: [
          ['AWS/ECS', 'CPUUtilization', 'ServiceName', '${WatchbotService}', 'ClusterName', '${Cluster}', { period: 60 }],
          ['.', 'MemoryUtilization', '.', '.', '.', '.', { period: 60 }]
        ],
        region: '${AWS::Region}',
        period: 300
      }
    }]
});
