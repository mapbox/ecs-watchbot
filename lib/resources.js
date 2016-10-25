var AWS = require('aws-sdk');
var events = require('events');

module.exports = function(cluster, taskDef) {
  var ecs = new AWS.ECS({
    region: cluster.split(':')[3]
  });

  var resources = new events.EventEmitter();

  var status = resources.status = {
    instances: [],
    registered: { cpu: 0, memory: 0 },
    available: { cpu: Infinity, memory: Infinity },
    required: { cpu: 0, memory: 0 }
  };

  function listInstances(next, callback) {
    ecs.listContainerInstances({ nextToken: next, cluster: cluster }, function(err, data) {
      if (err) return callback(err);
      status.instances = status.instances.concat(data.containerInstanceArns);
      if (data.nextToken) return listInstances(data.nextToken, callback);
      callback();
    });
  }

  (function update() {
    status.instances = [];
    listInstances(undefined, function(err) {
      if (err) return resources.emit('error', err);
      setTimeout(update, 10000).unref();
    });
  })();

  (function required() {
    ecs.describeTaskDefinition({ taskDefinition: taskDef }, function(err, data) {
      if (err) return resources.emit('error', err);
      data.taskDefinition.containerDefinitions.forEach(function(container) {
        status.required.cpu += container.cpu;
        status.required.memory += container.memory;
      });
    });
  })();

  resources.available = function(callback) {
    var attempts = 0;
    var poller = setInterval(function() {
      attempts++;
      if (status.instances.length !== 0) {
        clearInterval(poller);
        wrapper();
      } else if (status.instances.length === 0 && attempts === 5) {
        clearInterval(poller);
        callback(new Error('No instances available after 5 polling attempts 1 second apart'));
      }
    }, 1000);

    function wrapper() {
      ecs.describeContainerInstances({ containerInstances: status.instances, cluster: cluster }, function(err, data) {
        if (err) return callback(err);

        status.registered = { cpu: 0, memory: 0 };
        status.available = { cpu: 0, memory: 0 };
        data.containerInstances.forEach(function(instance) {
          status.registered.cpu += instance.registeredResources.find(function(resource) {
            return resource.name === 'CPU';
          }).integerValue;
          status.registered.memory += instance.registeredResources.find(function(resource) {
            return resource.name === 'MEMORY';
          }).integerValue;
          status.available.cpu += instance.remainingResources.find(function(resource) {
            return resource.name === 'CPU';
          }).integerValue;
          status.available.memory += instance.remainingResources.find(function(resource) {
            return resource.name === 'MEMORY';
          }).integerValue;
        });

        resources.emit('update');
        callback();
      });
    }
  };

  resources.adequate = function(tasks) {
    var cpu = status.required.cpu * tasks;
    var memory = status.required.memory * tasks;
    return status.available.cpu >= cpu && status.available.memory >= memory;
  };

  return resources;
};
