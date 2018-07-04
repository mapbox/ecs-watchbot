'use strict';

const test = require('tape');
const wbg = require('../bin/watchbot-binary-generator');
const AWS = require('@mapbox/mock-aws-sdk-js');
const cp = require('child_process');
const util = require('util');
const exec = util.promisify(cp.exec);
const sinon = require('sinon');

test('getTagForSha: commit found', async (assert) => {
  const execStub = sinon.stub(wbg, 'exec').callsFake((command) => {
    assert.equals(command, 'git ls-remote --tags https://github.com/mapbox/ecs-watchbot');
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });

  const commit = 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6';

  const tag = await wbg.getTagForSha(commit);
  assert.ok(tag, 'tag exists for this commit');
  assert.equals(tag, 'v4.1.1');
  execStub.restore();
  assert.end();
});

test('getTagForSha: commit not found', async (assert) => {
  const execStub = sinon.stub(wbg, 'exec').callsFake((command) => {
    assert.equals(command, 'git ls-remote --tags https://github.com/mapbox/ecs-watchbot');
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });

  const commit = '123456';
  const tag = await wbg.getTagForSha(commit);
  assert.ok(!tag, 'tag does not exist for this commit');
  assert.end();
});
