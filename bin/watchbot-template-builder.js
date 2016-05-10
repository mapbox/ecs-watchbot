#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var args = require('minimist')(process.argv.slice(2), {
  boolean: ['h', 'help', 'v', 'verbose'],
  string: ['e', 'env', 'd', 'description']
});
var inquirer = require('inquirer');
var watchbot = require('..');
var pkg = require('../package.json');

function help() {
  console.log('Usage: watchbot-template-builder [OPTIONS] <template-file>');
  console.log('');
  console.log('Options:');
  console.log(' --env, -e           environment variables to set (e.g. --env HOST=my-host)');
  console.log(' --description, -d   the template description');
  console.log(' --verbose, -v       also print the template to stdout');
  console.log(' --help, -h          show this message');
  console.log('');
}

console.log('watchbot template builder v%s\n', pkg.version);
if (args.help || args.h) return help();

var templateFile = args._[0];
var templateFilePath;
if (!templateFile) {
  console.error('Error: No output template file specified\n');
  return help();
}

try {
  templateFilePath = path.resolve(templateFile);
  templateFile = fs.createWriteStream(templateFilePath);
} catch (err) {
  console.error('Error: ' + err.message + '\n');
  return help();
}

var description = args.description || args.d;
var verbose = args.verbose || args.v;

var env = (args.env || args.e || []).map(function(pair) {
  return {
    name: pair.split('=')[0],
    value: pair.split('=')[1]
  };
});

var includeAnyResources = {
  type: 'confirm',
  name: 'includeAnyResources',
  message: 'Would you like any template parameters or resources provided as environment variables?'
};

var empty = watchbot.template();

var resources = Object.keys(empty.Parameters).reduce(function(obj, key) {
  var desc = empty.Parameters[key].Description;
  obj['[parameter] ' + key + ': ' + desc] = { name: key, value: { Ref: key } };
  return obj;
}, {});

resources = Object.keys(empty.Resources).reduce(function(obj, key) {
  var desc = empty.Resources[key].Description;
  obj['[resource] ' + key + ': ' + desc] = { name: key, value: { Ref: key } };
  return obj;
}, resources);

resources = Object.keys(empty.Outputs).reduce(function(obj, key) {
  var desc = empty.Outputs[key].Description;
  obj['[output] ' + key + ': ' + desc] = { name: key, value: { Ref: key } };
  return obj;
}, resources);

resources['[stack] StackName: the name of the created stack'] = { name: 'StackName', value: { Ref: 'AWS::StackName' } };
resources['[stack] StackArn: the ARN of the created stack'] = { name: 'StackArn', value: { Ref: 'AWS::StackId' } };
resources['[stack] StackRegion: the region the stack is created in'] = { name: 'StackRegion', value: { Ref: 'AWS::Region' } };
resources['[account] AccountId: your AWS Account ID'] = { name: 'AccountId', value: { Ref: 'AWS::AccountId' } };

var resourcesToInclude = {
  type: 'checkbox',
  name: 'resourcesToInclude',
  message: 'Select template resources:',
  choices: Object.keys(resources)
};

inquirer.prompt([includeAnyResources]).then(function(answers) {
  if (!answers.includeAnyResources) return output();
  inquirer.prompt([resourcesToInclude]).then(output);
});

function output(answers) {
  if (answers && answers.resourcesToInclude) {
    env = env.concat(answers.resourcesToInclude.map(function(key) {
      return resources[key];
    }));
  }

  env = env.reduce(function(env, envVar) {
    env[envVar.name] = envVar.value;
    return env;
  }, {});

  var template = watchbot.template(env);
  if (description) template.Description = description;
  template = JSON.stringify(watchbot.template(env), null, 4);
  if (verbose) console.log(template);
  templateFile.write(template);
  templateFile.end();
  templateFile.on('finish', function() {
    if (!verbose) console.log('Template written to %s\n', templateFilePath);
  });
}
