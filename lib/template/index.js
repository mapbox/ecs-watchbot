/**
 * Creates a bare-bones CloudFormation template for a Watchbot stack
 *
 * @static
 * @memberof watchbot
 * @name template
 * @param {object} options - configuration details
 * @param {string} options.description - a description to set for the template
 * @param {boolean} options.provideUser - set to true to provide a keypair with
 * permission to send work to the queue.
 * @param {boolean} options.useWebhooks - set to true to enable a webhook endpoint
 * allowing an HTTPS POST request to add work to the queue.
 * @param {boolean} options.useWebhookKey - require an API key in order to POST
 * to the webhook endpoint
 * @param {object} options.taskEnv - a set of key-value pairs to provide as environment
 * variables to **all** tasks.
 * @returns {object} a CloudFormation template. `JSON.stringify` this object and
 * save it to a file in order to deploy the stack.
 */
module.exports = function(options) {
  options = options || {};
  
  var modules = [
    require('./alarms'),
    require('./queue'),
    require('./watcher'),
    require('./worker')
  ];

  if (options.provideUser) modules.push(require('./user'));
  if (options.useWebhooks) modules.push(require('./webhooks'));
  if (options.useWebhooks && options.useWebhookKey) modules.push(require('./webhooks-key'));

  var template = modules.reduce(function(template, m) {
    if (m.Parameters) Object.keys(m.Parameters).forEach(function(name) {
      template.Parameters[name] = m.Parameters[name];
    });
    if (m.Resources) Object.keys(m.Resources).forEach(function(name) {
      template.Resources[name] = m.Resources[name];
    });
    if (m.Outputs) Object.keys(m.Outputs).forEach(function(name) {
      template.Outputs[name] = m.Outputs[name];
    });
    return template;
  }, {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: options.description,
    Parameters: {
      WatchbotCluster: {
        Description: 'The ARN of the ECS cluster to run on',
        Type: 'String'
      },
      WatchbotClusterRole: {
        Description: 'An IAM role that can be assumed by EC2s in the ECS cluster',
        Type: 'String'
      }
    },
    Resources: {},
    Outputs: {}
  });

  if (options.mountData) {
    template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].MountPoints = template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].MountPoints || [];
    template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].MountPoints.push({ ContainerPath: '/mnt/data', SourceVolume: 'data' });
    template.Resources.WatchbotTask.Properties.Volumes = template.Resources.WatchbotTask.Properties.Volumes || [];
    template.Resources.WatchbotTask.Properties.Volumes.push({ Name: 'data', Host: { SourcePath: '/mnt/data' } });
  }

  var taskEnv = options.taskEnv || [];

  template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].Environment = Object.keys(taskEnv).map(function(key) {
    return { Name: key, Value: taskEnv[key] };
  });

  return template;
};
