var AWS = require('aws-sdk');
var events = require('events');

module.exports = function(cluster, taskDef) {
  var ecs = new AWS.ECS({
    region: cluster.split(':')[3]
  });

  var resources = new events.EventEmitter();

  var status = {
    instances: [],
    registered: { cpu: 0, memory: 0 },
    available: { cpu: 0, memory: 0 },
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

  function checkResources(callback) {
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

      callback();
    });
  }

  (function update() {
    status.instances = [];
    listInstances(undefined, function(err) {
      if (err) return resources.emit('error', err);
      checkResources(function(err) {
        if (err) return resources.emit('error', err);
        resources.emit('update', status.available);
        setTimeout(update, 1000).unref();
      });
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

  resources.registered = function() {
    return status.registered;
  };

  resources.available = function() {
    return status.available;
  };

  resources.adequate = function(tasks) {
    var cpu = status.required.cpu * tasks;
    var memory = status.required.memory * tasks;

    return status.available.cpu >= cpu && status.available.memory >= memory;
  };

  return resources;
};
