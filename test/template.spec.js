'use strict';

/* NOTE: this scipt is meant to be run via Jest, not Tape */
/* eslint-disable no-undef */

const assert = require('assert');
const template = require('../lib/template');
const cf = require('@mapbox/cloudfriend');

test('[template]', () => {
  assert.throws(
    () => template(),
    /options.service is required/,
    'throws when missing required options'
  );

  const builtWithDefaults = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(builtWithDefaults).toMatchSnapshot('defaults');

  const setsAllOptions = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    permissions: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::bucket/*'
      }
    ],
    env: {
      MyKey: 'MyValue'
    },
    prefix: 'Soup',
    family: 'abc-123',
    maxSize: 90,
    mounts: '/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: cf.ref('Gitsha')
    },
    privileged: true,
    reduce: true,
    messageTimeout: 300,
    messageRetention: 1096,
    deadletterThreshold: 50,
    deadletterAlarm: true,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(setsAllOptions).toMatchSnapshot('all-properties');

  const setsAllCPUNumber = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    permissions: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::bucket/*'
      }
    ],
    env: {
      MyKey: 'MyValue'
    },
    prefix: 'Soup',
    family: 'abc-123',
    maxSize: 90,
    mounts: '/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: 1024
    },
    privileged: true,
    reduce: true,
    messageTimeout: 300,
    messageRetention: 1096,
    deadletterThreshold: 50,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(setsAllCPUNumber).toMatchSnapshot('all-properties-CPU');

  const setsAllNoCPU = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    permissions: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::bucket/*'
      }
    ],
    env: {
      MyKey: 'MyValue'
    },
    prefix: 'Soup',
    family: 'abc-123',
    maxSize: 90,
    mounts: '/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128
    },
    privileged: true,
    reduce: true,
    messageTimeout: 300,
    messageRetention: 1096,
    deadletterThreshold: 50,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(setsAllNoCPU).toMatchSnapshot('all-properties-no-CPU');

  const setsAllLowCPU = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    permissions: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::bucket/*'
      }
    ],
    env: {
      MyKey: 'MyValue'
    },
    prefix: 'Soup',
    family: 'abc-123',
    maxSize: 90,
    mounts: '/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: 0
    },
    privileged: true,
    reduce: true,
    messageTimeout: 300,
    messageRetention: 1096,
    deadletterThreshold: 50,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(setsAllLowCPU).toMatchSnapshot('all-properties-low-CPU');


  const fifo = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    notificationEmail: 'hello@mapbox.pagerduty.com',
    fifo: true
  }));

  expect(fifo).toMatchSnapshot('fifo');

  const fifoMaxSize = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    notificationEmail: 'hello@mapbox.pagerduty.com',
    fifo: true,
    maxSize: 50
  }));

  expect(fifoMaxSize).toMatchSnapshot('fifoMaxSize');
});
