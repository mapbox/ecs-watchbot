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
        title: 'WatchbotQueue: Visible and NotVisible Messages',
        metrics: [
          ['AWS/SQS', 'ApproximateNumberOfMessagesNotVisible', 'QueueName', '${WatchbotQueue}', { period: 60 }],
          ['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', '${WatchbotQueue}', { period: 60 }]
        ],
        stat: 'Sum',
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
        metrics: [
          ['AWS/SQS', 'ApproximateAgeOfOldestMessage', 'QueueName', '${WatchbotQueue}', { stat: 'Maximum' }],
          ['...', { stat: 'p99' }],
          ['...'],
          ['...', { stat: 'p50' }]
        ],
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotQueue: Age of Oldest Message (sec)',
        stat: 'Average',
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
        title: 'WatchbotQueue: Worker Duration (msec)',
        metrics: [
          ['Mapbox/ecs-watchbot', '${Prefix}WorkerDuration-${AWS::StackName}', { stat: 'Maximum' }],
          ['...', { stat: 'p99' }],
          ['...'],
          ['...', { stat: 'p50' }]
        ],
        region: '${AWS::Region}',
        stat: 'Average',
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
        title: 'WatchbotQueue: Deleted messages',
        metrics: [
          ['AWS/SQS', 'NumberOfMessagesDeleted', 'QueueName', '${WatchbotQueue}', { period: 60 }]
        ],
        stat: 'Sum',
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
        title: 'Concurrency vs Throughput',
        metrics: [
          ['Mapbox/ecs-cluster', 'RunningCapacity', 'ClusterName', '${Cluster}', 'ServiceName', '${WatchbotService}', { period: 60 , yAxis: 'right'  }],
          ['.', 'DesiredCapacity', '.', '.', '.', '.', { period: 60, yAxis: 'right'  }],
          ['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', '${WatchbotQueue}', { period: 60, stat: 'Sum' , yAxis: 'left' }]
        ],
        region: '${AWS::Region}',
        period: 60,
        yAxis: {
          right: {
            min: 0
          }
        }
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
    },
    {
      type: 'metric',
      x: 12,
      y: 18,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'WatchbotDeadLetterQueue: Visible and NotVisible Messages',
        metrics: [
          ['AWS/SQS', 'ApproximateNumberOfMessagesNotVisible', 'QueueName', '${WatchbotDeadLetterQueue}', { period: 60 }],
          ['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', '${WatchbotDeadLetterQueue}', { period: 60 }]
        ],
        stat: 'Sum',
        region: '${AWS::Region}',
        period: 60,
        yAxis: {
          left: {
            min: 0
          }
        }
      }
    }]
});
