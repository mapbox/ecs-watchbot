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
      availablePaginated(data.containerInstanceArns, function(err, available) {
        if (err) return callback(err);
        status.availableInstances = status.availableInstances.concat(available);
        if (data.nextToken) return listInstances(data.nextToken, callback);
        callback();
      });
    });
  }

  function availablePaginated(instances, callback) {
    ecs.describeContainerInstances({ containerInstances: instances, cluster: cluster }, function(err, data) {
      if (err) return callback(err);
      return callback(null, data.containerInstances);
    });
  }

  (function update() {
    status.instances = status.availableInstances = [];
    listInstances(undefined, function(err) {
      if (err) return resources.emit('error', err);
      if (!status.instances.length) return resources.emit('error', 'No instances found in the cluster');
      resources.emit('HasInstances');
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
    if (!status.instances.length) return resources.once('HasInstances', resources.available.bind(null, callback));
    status.registered = { cpu: 0, memory: 0 };
    status.available = { cpu: 0, memory: 0 };
    status.availableInstances.forEach(function(instance) {
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
  };

  resources.adequate = function(tasks) {
    var cpu = status.required.cpu * tasks;
    var memory = status.required.memory * tasks;
    return status.available.cpu >= cpu && status.available.memory >= memory;
  };

  return resources;
};
