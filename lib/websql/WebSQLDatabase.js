'use strict';

var Queue = require('tiny-queue');
var immediate = require('immediate');
var noop = require('noop-fn');

var WebSQLTransaction = require('./WebSQLTransaction');

function runTransaction(self, task) {
  function onTransactionComplete(err) {
    function done() {
      self._running = false;

      immediate(function () {
        immediate(function () {
          runNextTransaction(self);
        });
        if (err) {
          task.errorCallback(err);
        } else {
          task.successCallback();
        }
      });
    }
    if (err) {
      self._db.exec([
        {sql: 'ROLLBACK;', args: []},
        {sql: 'END TRANSACTION;', args: []}
      ], false, done);
    } else {
      self._db.exec([
        {sql: 'END TRANSACTION;', args: []}
      ], false, done);
    }
  }

  var txn = new WebSQLTransaction(self, task.readOnly, onTransactionComplete);

  function execTransaction() {
    task.txnCallback(txn);
    txn._checkDone();
  }

  self._db.exec([{sql: 'BEGIN TRANSACTION;', args: []}], false, function () {
    immediate(execTransaction);
  });
}

function runNextTransaction(self) {
  if (self._running) {
    return;
  }
  var task = self._txnQueue.shift();

  if (!task) {
    return;
  }

  self._running = true;
  runTransaction(self, task);
}

function TransactionTask(readOnly, txnCallback, errorCallback, successCallback) {
  this.readOnly = readOnly;
  this.txnCallback = txnCallback;
  this.errorCallback = errorCallback;
  this.successCallback = successCallback;
}

function createTransaction(self, readOnly, txnCallback, errorCallback, successCallback) {
  txnCallback = txnCallback;
  errorCallback = errorCallback || noop;
  successCallback = successCallback || noop;

  if (typeof txnCallback !== 'function') {
    throw new Error('The callback provided as parameter 1 is not a function.');
  }

  self._txnQueue.push(new TransactionTask(readOnly, txnCallback, errorCallback, successCallback));
  runNextTransaction(self);
}

function WebSQLDatabase(dbVersion, db) {
  this.version = dbVersion;
  this._db = db;
  this._txnQueue = new Queue();
  this._running = false;
}

WebSQLDatabase.prototype.transaction = function (txnCallback, errorCallback, successCallback) {
  createTransaction(this, false, txnCallback, errorCallback, successCallback);
};

WebSQLDatabase.prototype.readTransaction = function (txnCallback, errorCallback, successCallback) {
  createTransaction(this, true, txnCallback, errorCallback, successCallback);
};

module.exports = WebSQLDatabase;