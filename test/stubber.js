'use strict';

const sinon = require('sinon');
const Logger = require('../lib/logger');

module.exports = (cls) => {
  const stub = sinon.createStubInstance(cls);
  stub.logger = sinon.createStubInstance(Logger);

  stub.setup = () => {
    sinon.stub(cls, 'create').returns(stub);
    return stub;
  };

  stub.teardown = () => {
    cls.create.restore();
  };

  return stub;
};
