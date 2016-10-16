(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*global window:false, self:false, define:false, module:false */

/**
 * @license IDBWrapper - A cross-browser wrapper for IndexedDB
 * Copyright (c) 2011 - 2013 Jens Arps
 * http://jensarps.de/
 *
 * Licensed under the MIT (X11) license
 */

(function (name, definition, global) {
  if (typeof define === 'function') {
    define(definition);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = definition();
  } else {
    global[name] = definition();
  }
})('IDBStore', function () {

  'use strict';

  var defaultErrorHandler = function (error) {
    throw error;
  };

  var defaults = {
    storeName: 'Store',
    storePrefix: 'IDBWrapper-',
    dbVersion: 1,
    keyPath: 'id',
    autoIncrement: true,
    onStoreReady: function () {
    },
    onError: defaultErrorHandler,
    indexes: []
  };

  /**
   *
   * The IDBStore constructor
   *
   * @constructor
   * @name IDBStore
   * @version 2.1.0
   *
   * @param {Object} [kwArgs] An options object used to configure the store and
   *  set callbacks
   * @param {String} [kwArgs.storeName='Store'] The name of the store
   * @param {String} [kwArgs.storePrefix='IDBWrapper-'] A prefix that is
   *  internally used to construct the name of the database, which will be
   *  kwArgs.storePrefix + kwArgs.storeName
   * @param {Number} [kwArgs.dbVersion=1] The version of the store
   * @param {String} [kwArgs.keyPath='id'] The key path to use. If you want to
   *  setup IDBWrapper to work with out-of-line keys, you need to set this to
   *  `null`
   * @param {Boolean} [kwArgs.autoIncrement=true] If set to true, IDBStore will
   *  automatically make sure a unique keyPath value is present on each object
   *  that is stored.
   * @param {Function} [kwArgs.onStoreReady] A callback to be called when the
   *  store is ready to be used.
   * @param {Function} [kwArgs.onError=throw] A callback to be called when an
   *  error occurred during instantiation of the store.
   * @param {Array} [kwArgs.indexes=[]] An array of indexData objects
   *  defining the indexes to use with the store. For every index to be used
   *  one indexData object needs to be passed in the array.
   *  An indexData object is defined as follows:
   * @param {Object} [kwArgs.indexes.indexData] An object defining the index to
   *  use
   * @param {String} kwArgs.indexes.indexData.name The name of the index
   * @param {String} [kwArgs.indexes.indexData.keyPath] The key path of the index
   * @param {Boolean} [kwArgs.indexes.indexData.unique] Whether the index is unique
   * @param {Boolean} [kwArgs.indexes.indexData.multiEntry] Whether the index is multi entry
   * @param {Function} [onStoreReady] A callback to be called when the store
   * is ready to be used.
   * @example
      // create a store for customers with an additional index over the
      // `lastname` property.
      var myCustomerStore = new IDBStore({
        dbVersion: 1,
        storeName: 'customer-index',
        keyPath: 'customerid',
        autoIncrement: true,
        onStoreReady: populateTable,
        indexes: [
          { name: 'lastname', keyPath: 'lastname', unique: false, multiEntry: false }
        ]
      });
   * @example
      // create a generic store
      var myCustomerStore = new IDBStore({
        storeName: 'my-data-store',
        onStoreReady: function(){
          // start working with the store.
        }
      });
   */
  var IDBStore = function (kwArgs, onStoreReady) {

    if (typeof onStoreReady == 'undefined' && typeof kwArgs == 'function') {
      onStoreReady = kwArgs;
    }
    if (Object.prototype.toString.call(kwArgs) != '[object Object]') {
      kwArgs = {};
    }

    for (var key in defaults) {
      this[key] = typeof kwArgs[key] != 'undefined' ? kwArgs[key] : defaults[key];
    }

    this.dbName = this.storePrefix + this.storeName;
    this.dbVersion = parseInt(this.dbVersion, 10) || 1;

    var env = typeof window == 'object' ? window : self;
    this.idb = env.indexedDB || env.webkitIndexedDB || env.mozIndexedDB;
    this.keyRange = env.IDBKeyRange || env.webkitIDBKeyRange || env.mozIDBKeyRange;

    this.features = {
      hasAutoIncrement: !env.mozIndexedDB
    };

    this.consts = {
      'READ_ONLY':         'readonly',
      'READ_WRITE':        'readwrite',
      'VERSION_CHANGE':    'versionchange',
      'NEXT':              'next',
      'NEXT_NO_DUPLICATE': 'nextunique',
      'PREV':              'prev',
      'PREV_NO_DUPLICATE': 'prevunique'
    };

    var _done, _reject;
    this.ready = new Promise(function(done, reject){
      _done = done;
      _reject = reject;
    });

    this.onStoreReady = function(){
      _done();
    };
    this.onError = function(){
      _reject();
    };

    this.openDB();
  };

  IDBStore.prototype = /** @lends IDBStore */ {

    /**
     * A pointer to the IDBStore ctor
     *
     * @type IDBStore
     */
    constructor: IDBStore,

    /**
     * The version of IDBStore
     *
     * @type String
     */
    version: '2.1.0',

    /**
     * A reference to the IndexedDB object
     *
     * @type Object
     */
    db: null,

    /**
     * The full name of the IndexedDB used by IDBStore, composed of
     * this.storePrefix + this.storeName
     *
     * @type String
     */
    dbName: null,

    /**
     * The version of the IndexedDB used by IDBStore
     *
     * @type Number
     */
    dbVersion: null,

    /**
     * A reference to the objectStore used by IDBStore
     *
     * @type Object
     */
    store: null,

    /**
     * The store name
     *
     * @type String
     */
    storeName: null,

    /**
     * The key path
     *
     * @type String
     */
    keyPath: null,

    /**
     * Whether IDBStore uses autoIncrement
     *
     * @type Boolean
     */
    autoIncrement: null,

    /**
     * The indexes used by IDBStore
     *
     * @type Array
     */
    indexes: null,

    /**
     * A hashmap of features of the used IDB implementation
     *
     * @type Object
     * @proprty {Boolean} autoIncrement If the implementation supports
     *  native auto increment
     */
    features: null,

    /**
     * The callback to be called when the store is ready to be used
     *
     * @type Function
     */
    onStoreReady: null,

    /**
     * The callback to be called if an error occurred during instantiation
     * of the store
     *
     * @type Function
     */
    onError: null,

    /**
     * The internal insertID counter
     *
     * @type Number
     * @private
     */
    _insertIdCount: 0,

    /**
     * Opens an IndexedDB; called by the constructor.
     *
     * Will check if versions match and compare provided index configuration
     * with existing ones, and update indexes if necessary.
     *
     * Will call this.onStoreReady() if everything went well and the store
     * is ready to use, and this.onError() is something went wrong.
     *
     * @private
     *
     */
    openDB: function () {

      var openRequest = this.idb.open(this.dbName, this.dbVersion);
      var preventSuccessCallback = false;

      openRequest.onerror = function (error) {

        var gotVersionErr = false;
        if ('error' in error.target) {
          gotVersionErr = error.target.error.name == 'VersionError';
        } else if ('errorCode' in error.target) {
          gotVersionErr = error.target.errorCode == 12;
        }

        if (gotVersionErr) {
          this.onError(new Error('The version number provided is lower than the existing one.'));
        } else {
          this.onError(error);
        }
      }.bind(this);

      openRequest.onsuccess = function (event) {

        if (preventSuccessCallback) {
          return;
        }

        if(this.db){
          this.onStoreReady();
          return;
        }

        this.db = event.target.result;

        if(typeof this.db.version == 'string'){
          this.onError(new Error('The IndexedDB implementation in this browser is outdated. Please upgrade your browser.'));
          return;
        }

        if(!this.db.objectStoreNames.contains(this.storeName)){
          // We should never ever get here.
          // Lets notify the user anyway.
          this.onError(new Error('Something is wrong with the IndexedDB implementation in this browser. Please upgrade your browser.'));
          return;
        }

        var emptyTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
        this.store = emptyTransaction.objectStore(this.storeName);

        // check indexes
        var existingIndexes = Array.prototype.slice.call(this.getIndexList());
        this.indexes.forEach(function(indexData){
          var indexName = indexData.name;

          if(!indexName){
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create index: No index name given.'));
            return;
          }

          this.normalizeIndexData(indexData);

          if(this.hasIndex(indexName)){
            // check if it complies
            var actualIndex = this.store.index(indexName);
            var complies = this.indexComplies(actualIndex, indexData);
            if(!complies){
              preventSuccessCallback = true;
              this.onError(new Error('Cannot modify index "' + indexName + '" for current version. Please bump version number to ' + ( this.dbVersion + 1 ) + '.'));
            }

            existingIndexes.splice(existingIndexes.indexOf(indexName), 1);
          } else {
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create new index "' + indexName + '" for current version. Please bump version number to ' + ( this.dbVersion + 1 ) + '.'));
          }

        }, this);

        if (existingIndexes.length) {
          preventSuccessCallback = true;
          this.onError(new Error('Cannot delete index(es) "' + existingIndexes.toString() + '" for current version. Please bump version number to ' + ( this.dbVersion + 1 ) + '.'));
        }

        preventSuccessCallback || this.onStoreReady();
      }.bind(this);

      openRequest.onupgradeneeded = function(/* IDBVersionChangeEvent */ event){

        this.db = event.target.result;

        if(this.db.objectStoreNames.contains(this.storeName)){
          this.store = event.target.transaction.objectStore(this.storeName);
        } else {
          var optionalParameters = { autoIncrement: this.autoIncrement };
          if (this.keyPath !== null) {
            optionalParameters.keyPath = this.keyPath;
          }
          this.store = this.db.createObjectStore(this.storeName, optionalParameters);
        }

        var existingIndexes = Array.prototype.slice.call(this.getIndexList());
        this.indexes.forEach(function(indexData){
          var indexName = indexData.name;

          if(!indexName){
            preventSuccessCallback = true;
            this.onError(new Error('Cannot create index: No index name given.'));
          }

          this.normalizeIndexData(indexData);

          if(this.hasIndex(indexName)){
            // check if it complies
            var actualIndex = this.store.index(indexName);
            var complies = this.indexComplies(actualIndex, indexData);
            if(!complies){
              // index differs, need to delete and re-create
              this.store.deleteIndex(indexName);
              this.store.createIndex(indexName, indexData.keyPath, { unique: indexData.unique, multiEntry: indexData.multiEntry });
            }

            existingIndexes.splice(existingIndexes.indexOf(indexName), 1);
          } else {
            this.store.createIndex(indexName, indexData.keyPath, { unique: indexData.unique, multiEntry: indexData.multiEntry });
          }

        }, this);

        if (existingIndexes.length) {
          existingIndexes.forEach(function(_indexName){
            this.store.deleteIndex(_indexName);
          }, this);
        }

      }.bind(this);
    },

    /**
     * Deletes the database used for this store if the IDB implementations
     * provides that functionality.
     */
    deleteDatabase: function () {
      if (this.idb.deleteDatabase) {
        this.idb.deleteDatabase(this.dbName);
      }
    },

    /*********************
     * data manipulation *
     *********************/

    /**
     * Puts an object into the store. If an entry with the given id exists,
     * it will be overwritten. This method has a different signature for inline
     * keys and out-of-line keys; please see the examples below.
     *
     * @param {*} [key] The key to store. This is only needed if IDBWrapper
     *  is set to use out-of-line keys. For inline keys - the default scenario -
     *  this can be omitted.
     * @param {Object} value The data object to store.
     * @returns {IDBTransaction} The transaction used for this operation.
     * @example
        // Storing an object, using inline keys (the default scenario):
        var myCustomer = {
          customerid: 2346223,
          lastname: 'Doe',
          firstname: 'John'
        };
        myCustomerStore.put(myCustomer, mySuccessHandler, myErrorHandler);
        // Note that passing success- and error-handlers is optional.
     * @example
        // Storing an object, using out-of-line keys:
       var myCustomer = {
         lastname: 'Doe',
         firstname: 'John'
       };
       myCustomerStore.put(2346223, myCustomer, mySuccessHandler, myErrorHandler);
      // Note that passing success- and error-handlers is optional.
     */
     put: function (key, value) {
       return new Promise(function(done, reject){
         if (this.keyPath !== null) {
           value = key;
         }

         var hasSuccess = false,
             result = null,
             putRequest;

         var putTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
         putTransaction.oncomplete = function () {
           var callback = hasSuccess ? done : reject;
           callback(result);
         };
         putTransaction.onabort = reject;
         putTransaction.onerror = reject;

         if (this.keyPath !== null) { // in-line keys
           this._addIdPropertyIfNeeded(value);
           putRequest = putTransaction.objectStore(this.storeName).put(value);
         } else { // out-of-line keys
           putRequest = putTransaction.objectStore(this.storeName).put(value, key);
         }
         putRequest.onsuccess = function (event) {
           hasSuccess = true;
           result = event.target.result;
         };

         putRequest.onerror = reject;
       }.bind(this));
     },

    /**
     * Retrieves an object from the store. If no entry exists with the given id,
     * the success handler will be called with null as first and only argument.
     *
     * @param {*} key The id of the object to fetch.
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    get: function (key) {
      return new Promise(function(done, reject){
        var hasSuccess = false,
            result = null;

        var getTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
        getTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        getTransaction.onabort = reject;
        getTransaction.onerror = reject;
        var getRequest = getTransaction.objectStore(this.storeName).get(key);
        getRequest.onsuccess = function (event) {
          hasSuccess = true;
          result = event.target.result;
        };
        getRequest.onerror = reject;
      }.bind(this));
    },
    /**
     * Removes an object from the store.
     *
     * @param {*} key The id of the object to remove.
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    remove: function (key) {
      return new Promise(function(done, reject){
        var hasSuccess = false,
            result = null;

        var removeTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
        removeTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        removeTransaction.onabort = reject;
        removeTransaction.onerror = reject;

        var deleteRequest = removeTransaction.objectStore(this.storeName)['delete'](key);
        deleteRequest.onsuccess = function (event) {
          hasSuccess = true;
          result = event.target.result;
        };
        deleteRequest.onerror = reject;
      }.bind(this));
    },

    /**
     * Runs a batch of put and/or remove operations on the store.
     *
     * @param {Array} dataArray An array of objects containing the operation to run
     *  and the data object (for put operations).
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    batch: function (dataArray) {
      return new Promise(function(done, reject){
        if(Object.prototype.toString.call(dataArray) != '[object Array]'){
          reject(new Error('dataArray argument must be of type Array.'));
        }
        var batchTransaction = this.db.transaction([this.storeName] , this.consts.READ_WRITE);
        batchTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(hasSuccess);
        };
        batchTransaction.onabort = reject;
        batchTransaction.onerror = reject;

        var count = dataArray.length;
        var called = false;
        var hasSuccess = false;

        var onItemSuccess = function () {
          count--;
          if (count === 0 && !called) {
            called = true;
            hasSuccess = true;
          }
        };

        dataArray.forEach(function (operation) {
          var type = operation.type;
          var key = operation.key;
          var value = operation.value;

          var onItemError = function (err) {
            batchTransaction.abort();
            if (!called) {
              called = true;
              reject(err, type, key);
            }
          };

          if (type == 'remove') {
            var deleteRequest = batchTransaction.objectStore(this.storeName)['delete'](key);
            deleteRequest.onsuccess = onItemSuccess;
            deleteRequest.onerror = onItemError;
          } else if (type == 'put') {
            var putRequest;
            if (this.keyPath !== null) { // in-line keys
              this._addIdPropertyIfNeeded(value);
              putRequest = batchTransaction.objectStore(this.storeName).put(value);
            } else { // out-of-line keys
              putRequest = batchTransaction.objectStore(this.storeName).put(value, key);
            }
            putRequest.onsuccess = onItemSuccess;
            putRequest.onerror = onItemError;
          }
        }, this);
      }.bind(this));
    },

    /**
     * Takes an array of objects and stores them in a single transaction.
     *
     * @param {Array} dataArray An array of objects to store
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    putBatch: function (dataArray) {
      var batchData = dataArray.map(function(item){
        return { type: 'put', value: item };
      });

      return this.batch(batchData);
    },

    /**
     * Takes an array of keys and removes matching objects in a single
     * transaction.
     *
     * @param {Array} keyArray An array of keys to remove
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    removeBatch: function (keyArray) {
      var batchData = keyArray.map(function(key){
        return { type: 'remove', key: key };
      });

      return this.batch(batchData);
    },

    /**
     * Takes an array of keys and fetches matching objects
     *
     * @param {Array} keyArray An array of keys identifying the objects to fetch
     * @param {String} [arrayType='sparse'] The type of array to pass to the
     *  success handler. May be one of 'sparse', 'dense' or 'skip'. Defaults to
     *  'sparse'. This parameter specifies how to handle the situation if a get
     *  operation did not throw an error, but there was no matching object in
     *  the database. In most cases, 'sparse' provides the most desired
     *  behavior. See the examples for details.
     * @returns {IDBTransaction} The transaction used for this operation.
     * @example
     // given that there are two objects in the database with the keypath
     // values 1 and 2, and the call looks like this:
     myStore.getBatch([1, 5, 2], reject, function (data) { … }, arrayType);

     // this is what the `data` array will be like:

     // arrayType == 'sparse':
     // data is a sparse array containing two entries and having a length of 3:
       [Object, 2: Object]
         0: Object
         2: Object
         length: 3
         __proto__: Array[0]
     // calling forEach on data will result in the callback being called two
     // times, with the index parameter matching the index of the key in the
     // keyArray.

     // arrayType == 'dense':
     // data is a dense array containing three entries and having a length of 3,
     // where data[1] is of type undefined:
       [Object, undefined, Object]
         0: Object
         1: undefined
         2: Object
         length: 3
         __proto__: Array[0]
     // calling forEach on data will result in the callback being called three
     // times, with the index parameter matching the index of the key in the
     // keyArray, but the second call will have undefined as first argument.

     // arrayType == 'skip':
     // data is a dense array containing two entries and having a length of 2:
       [Object, Object]
         0: Object
         1: Object
         length: 2
         __proto__: Array[0]
     // calling forEach on data will result in the callback being called two
     // times, with the index parameter not matching the index of the key in the
     // keyArray.
     */

    getBatch: function (keyArray, arrayType) {
      return new Promise(function(done, reject){
        arrayType || (arrayType = 'sparse');

        if(Object.prototype.toString.call(keyArray) != '[object Array]'){
          reject(new Error('keyArray argument must be of type Array.'));
        }
        var batchTransaction = this.db.transaction([this.storeName] , this.consts.READ_ONLY);
        batchTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        batchTransaction.onabort = reject;
        batchTransaction.onerror = reject;

        var data = [];
        var count = keyArray.length;
        var called = false;
        var hasSuccess = false;
        var result = null;

        var onItemSuccess = function (event) {
          if (event.target.result || arrayType == 'dense') {
            data.push(event.target.result);
          } else if (arrayType == 'sparse') {
            data.length++;
          }
          count--;
          if (count === 0) {
            called = true;
            hasSuccess = true;
            result = data;
          }
        };

        keyArray.forEach(function (key) {

          var onItemError = function (err) {
            called = true;
            result = err;
            reject(err);
            batchTransaction.abort();
          };

          var getRequest = batchTransaction.objectStore(this.storeName).get(key);
          getRequest.onsuccess = onItemSuccess;
          getRequest.onerror = onItemError;

        }, this);
      }.bind(this));
    },

    /**
     * Fetches all entries in the store.
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    getAll: function () {
      var getAllTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
      var store = getAllTransaction.objectStore(this.storeName);
      if (store.getAll) {
        return this._getAllNative(getAllTransaction, store);
      } else {
        return this._getAllCursor(getAllTransaction, store);
      }
    },

    /**
     * Implements getAll for IDB implementations that have a non-standard
     * getAll() method.
     *
     * @param {Object} getAllTransaction An open READ transaction.
     * @param {Object} store A reference to the store.
     * @private
     */
    _getAllNative: function (getAllTransaction, store) {
      return new Promise(function(done, reject){
        var hasSuccess = false,
            result = null;

        getAllTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        getAllTransaction.onabort = reject;
        getAllTransaction.onerror = reject;

        var getAllRequest = store.getAll();
        getAllRequest.onsuccess = function (event) {
          hasSuccess = true;
          result = event.target.result;
        };
        getAllRequest.onerror = reject;
      }.bind(this));
    },

    /**
     * Implements getAll for IDB implementations that do not have a getAll()
     * method.
     *
     * @param {Object} getAllTransaction An open READ transaction.
     * @param {Object} store A reference to the store.
     *  error occurred during the operation.
     * @private
     */
    _getAllCursor: function (getAllTransaction, store) {
      return new Promise(function(done, reject){
        var all = [],
            hasSuccess = false,
            result = null;

        getAllTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        getAllTransaction.onabort = reject;
        getAllTransaction.onerror = reject;

        var cursorRequest = store.openCursor();
        cursorRequest.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            all.push(cursor.value);
            cursor['continue']();
          }
          else {
            hasSuccess = true;
            result = all;
          }
        };
        cursorRequest.reject = reject;
      }.bind(this));
    },

    /**
     * Clears the store, i.e. deletes all entries in the store.
     *
     * @returns {IDBTransaction} The transaction used for this operation.
     */
    clear: function () {
      return new Promise(function(done, reject){
        var hasSuccess = false,
            result = null;

        var clearTransaction = this.db.transaction([this.storeName], this.consts.READ_WRITE);
        clearTransaction.oncomplete = function () {
          var callback = hasSuccess ? done : reject;
          callback(result);
        };
        clearTransaction.onabort = reject;
        clearTransaction.onerror = reject;

        var clearRequest = clearTransaction.objectStore(this.storeName).clear();
        clearRequest.onsuccess = function (event) {
          hasSuccess = true;
          result = event.target.result;
        };
        clearRequest.onerror = reject;
      }.bind(this));
    },

    /**
     * Checks if an id property needs to present on a object and adds one if
     * necessary.
     *
     * @param {Object} dataObj The data object that is about to be stored
     * @private
     */
    _addIdPropertyIfNeeded: function (dataObj) {
      if (!this.features.hasAutoIncrement && typeof dataObj[this.keyPath] == 'undefined') {
        dataObj[this.keyPath] = this._insertIdCount++ + Date.now();
      }
    },

    /************
     * indexing *
     ************/

    /**
     * Returns a DOMStringList of index names of the store.
     *
     * @return {DOMStringList} The list of index names
     */
    getIndexList: function () {
      return this.store.indexNames;
    },

    /**
     * Checks if an index with the given name exists in the store.
     *
     * @param {String} indexName The name of the index to look for
     * @return {Boolean} Whether the store contains an index with the given name
     */
    hasIndex: function (indexName) {
      return this.store.indexNames.contains(indexName);
    },

    /**
     * Normalizes an object containing index data and assures that all
     * properties are set.
     *
     * @param {Object} indexData The index data object to normalize
     * @param {String} indexData.name The name of the index
     * @param {String} [indexData.keyPath] The key path of the index
     * @param {Boolean} [indexData.unique] Whether the index is unique
     * @param {Boolean} [indexData.multiEntry] Whether the index is multi entry
     */
    normalizeIndexData: function (indexData) {
      indexData.keyPath = indexData.keyPath || indexData.name;
      indexData.unique = !!indexData.unique;
      indexData.multiEntry = !!indexData.multiEntry;
    },

    /**
     * Checks if an actual index complies with an expected index.
     *
     * @param {Object} actual The actual index found in the store
     * @param {Object} expected An Object describing an expected index
     * @return {Boolean} Whether both index definitions are identical
     */
    indexComplies: function (actual, expected) {
      var complies = ['keyPath', 'unique', 'multiEntry'].every(function (key) {
        // IE10 returns undefined for no multiEntry
        if (key == 'multiEntry' && actual[key] === undefined && expected[key] === false) {
          return true;
        }
        // Compound keys
        if (key == 'keyPath' && Object.prototype.toString.call(expected[key]) == '[object Array]') {
          var exp = expected.keyPath;
          var act = actual.keyPath;

          // IE10 can't handle keyPath sequences and stores them as a string.
          // The index will be unusable there, but let's still return true if
          // the keyPath sequence matches.
          if (typeof act == 'string') {
            return exp.toString() == act;
          }

          // Chrome/Opera stores keyPath squences as DOMStringList, Firefox
          // as Array
          if ( ! (typeof act.contains == 'function' || typeof act.indexOf == 'function') ) {
            return false;
          }

          if (act.length !== exp.length) {
            return false;
          }

          for (var i = 0, m = exp.length; i<m; i++) {
            if ( ! ( (act.contains && act.contains(exp[i])) || act.indexOf(exp[i] !== -1) )) {
              return false;
            }
          }
          return true;
        }
        return expected[key] == actual[key];
      });
      return complies;
    },

    /**********
     * cursor *
     **********/

    /**
     * Iterates over the store using the given options and calling onItem
     * for each entry matching the options.
     *
     * @param {Function} onItem A callback to be called for each match
     * @param {Object} [options] An object defining specific options
     * @param {Object} [options.index=null] An IDBIndex to operate on
     * @param {String} [options.order=ASC] The order in which to provide the
     *  results, can be 'DESC' or 'ASC'
     * @param {Boolean} [options.autoContinue=true] Whether to automatically
     *  iterate the cursor to the next result
     * @param {Boolean} [options.filterDuplicates=false] Whether to exclude
     *  duplicate matches
     * @param {Object} [options.keyRange=null] An IDBKeyRange to use
     * @param {Boolean} [options.writeAccess=false] Whether grant write access
     *  to the store in the onItem callback
     * @param {Function} [options.onEnd=null] A callback to be called after
     *  iteration has ended
     * @param {Function} [options.onError=throw] A callback to be called
     *  if an error occurred during the operation.
     * @returns {IDBTransaction} The transaction used for this operation.
     */
     iterate: function (onItem, options) {
       return new Promise(function(done, reject){
         options = mixin({
           index: null,
           order: 'ASC',
           autoContinue: true,
           filterDuplicates: false,
           keyRange: null,
           writeAccess: false,
           onEnd: null
         }, (options || {}));

         var directionType = options.order.toLowerCase() == 'desc' ? 'PREV' : 'NEXT';
         if (options.filterDuplicates) {
           directionType += '_NO_DUPLICATE';
         }

         var hasSuccess = false;
         var cursorTransaction = this.db.transaction([this.storeName], this.consts[options.writeAccess ? 'READ_WRITE' : 'READ_ONLY']);
         var cursorTarget = cursorTransaction.objectStore(this.storeName);
         if (options.index) {
           cursorTarget = cursorTarget.index(options.index);
         }

         cursorTransaction.oncomplete = function () {
           if (!hasSuccess) {
             reject(null);
             return;
           }
           done();
         };
         cursorTransaction.onabort = reject;
         cursorTransaction.onerror = reject;

         var cursorRequest = cursorTarget.openCursor(options.keyRange, this.consts[directionType]);
         cursorRequest.onerror = reject;
         cursorRequest.onsuccess = function (event) {
           var cursor = event.target.result;
           if (cursor) {
             onItem(cursor.value, cursor, cursorTransaction);
             if (options.autoContinue) {
               cursor['continue']();
             }
           } else {
             hasSuccess = true;
           }
         };
       }.bind(this));

     },

     /**
      * Runs a query against the store and passes an array containing matched
      * objects to the success handler.
      *
      * @param {Object} [options] An object defining specific query options
      * @param {Object} [options.index=null] An IDBIndex to operate on
      * @param {String} [options.order=ASC] The order in which to provide the
      *  results, can be 'DESC' or 'ASC'
      * @param {Boolean} [options.filterDuplicates=false] Whether to exclude
      *  duplicate matches
      * @param {Object} [options.keyRange=null] An IDBKeyRange to use
      * @param {Function} [options.reject=throw] A callback to be called if an error
      *  occurred during the operation.
      * @returns {IDBTransaction} The transaction used for this operation.
      */
     query: function (options) {
       options = options || {};
       var result = [];
       return this.iterate(function (item) {
         result.push(item);
       }, options)
       .then(function(){
         return Promise.resolve(result);
       });
     },

     /**
      *
      * Runs a query against the store, but only returns the number of matches
      * instead of the matches itself.
      *
      * @param {Object} [options] An object defining specific options
      * @param {Object} [options.index=null] An IDBIndex to operate on
      * @param {Object} [options.keyRange=null] An IDBKeyRange to use
      * @param {Function} [options.reject=throw] A callback to be called if an error
      *  occurred during the operation.
      * @returns {IDBTransaction} The transaction used for this operation.
      */
     count: function (done, options) {

       options = mixin({
         index: null,
         keyRange: null
       }, options || {});

       var reject = options.reject;

       var hasSuccess = false,
           result = null;

       var cursorTransaction = this.db.transaction([this.storeName], this.consts.READ_ONLY);
       cursorTransaction.oncomplete = function () {
         var callback = hasSuccess ? done : reject;
         callback(result);
       };
       cursorTransaction.onabort = reject;
       cursorTransaction.onerror = reject;

       var cursorTarget = cursorTransaction.objectStore(this.storeName);
       if (options.index) {
         cursorTarget = cursorTarget.index(options.index);
       }
       var countRequest = cursorTarget.count(options.keyRange);
       countRequest.onsuccess = function (evt) {
         hasSuccess = true;
         result = evt.target.result;
       };
       countRequest.reject = reject;

       return cursorTransaction;
     },

     /**************/
     /* key ranges */
     /**************/

     /**
      * Creates a key range using specified options. This key range can be
      * handed over to the count() and iterate() methods.
      *
      * Note: You must provide at least one or both of "lower" or "upper" value.
      *
      * @param {Object} options The options for the key range to create
      * @param {*} [options.lower] The lower bound
      * @param {Boolean} [options.excludeLower] Whether to exclude the lower
      *  bound passed in options.lower from the key range
      * @param {*} [options.upper] The upper bound
      * @param {Boolean} [options.excludeUpper] Whether to exclude the upper
      *  bound passed in options.upper from the key range
      * @param {*} [options.only] A single key value. Use this if you need a key
      *  range that only includes one value for a key. Providing this
      *  property invalidates all other properties.
      * @return {Object} The IDBKeyRange representing the specified options
      */
     makeKeyRange: function(options){
       /*jshint onecase:true */
       var keyRange,
           hasLower = typeof options.lower != 'undefined',
           hasUpper = typeof options.upper != 'undefined',
           isOnly = typeof options.only != 'undefined';

       switch(true){
         case isOnly:
           keyRange = this.keyRange.only(options.only);
           break;
         case hasLower && hasUpper:
           keyRange = this.keyRange.bound(options.lower, options.upper, options.excludeLower, options.excludeUpper);
           break;
         case hasLower:
           keyRange = this.keyRange.lowerBound(options.lower, options.excludeLower);
           break;
         case hasUpper:
           keyRange = this.keyRange.upperBound(options.upper, options.excludeUpper);
           break;
         default:
           throw new Error('Cannot create KeyRange. Provide one or both of "lower" or "upper" value, or an "only" value.');
       }

       return keyRange;

     }

   };

   /** helpers **/

   var empty = {};
   var mixin = function (target, source) {
     var name, s;
     for (name in source) {
       s = source[name];
       if (s !== empty[name] && s !== target[name]) {
         target[name] = s;
       }
     }
     return target;
   };

   IDBStore.version = IDBStore.prototype.version;

   return IDBStore;


}, this);

},{}],2:[function(require,module,exports){
"use strict";

var _notify = require("./notify");

var _notify2 = _interopRequireDefault(_notify);

var _pagebook = require("./pagebook");

var _pagebook2 = _interopRequireDefault(_pagebook);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var MENU_ITEM_ADD = "pagebook_ctxmenu_add";
var MENU_ITEM_ADD_ALL = "pagebook_ctxmenu_add_all";

chrome.contextMenus.create({
  id: MENU_ITEM_ADD,
  type: "normal",
  title: chrome.i18n.getMessage("contextmenus_add_title"),
  contexts: ["page"]
});

chrome.contextMenus.create({
  id: MENU_ITEM_ADD_ALL,
  type: "normal",
  title: chrome.i18n.getMessage("contextmenus_add_all_title"),
  contexts: ["page"]
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  switch (info.menuItemId) {
    case MENU_ITEM_ADD:
      add(tab);
      break;
    case MENU_ITEM_ADD_ALL:
      addAll();
      break;
    default:
      alert("知らんコマンド");
  }
});

var pagebook = new _pagebook2.default();
window.pagebook = pagebook;

function add(tab) {
  var id = tab.id;
  var title = tab.title;
  var url = tab.url;

  var a = document.createElement("a");
  a.setAttribute("href", url);

  if (a.protocol.startsWith("http")) {
    pagebook.add({ title: title, url: url }).then(function () {
      _notify2.default.send(id, "update", title + " " + url);
    });
  }
}

function addAll() {
  chrome.windows.getAll(function (windows) {
    windows.forEach(function (window) {
      chrome.tabs.getAllInWindow(window.id, function (tabs) {
        tabs.forEach(add);
      });
    });
  });
}

},{"./notify":3,"./pagebook":4}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Notify = function () {
  function Notify() {
    _classCallCheck(this, Notify);
  }

  _createClass(Notify, null, [{
    key: "send",
    value: function send(id, title, message) {
      chrome.notifications.create(String(id), { "type": "basic", "iconUrl": "assets/images/icon_48.png", title: title, message: message }, function (id) {
        setTimeout(function () {
          chrome.notifications.clear(id, function () {});
        }, 3000);
      });
    }
  }]);

  return Notify;
}();

exports.default = Notify;

},{}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _idbWrapperPromisify = require("idb-wrapper-promisify");

var _idbWrapperPromisify2 = _interopRequireDefault(_idbWrapperPromisify);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DB_NAME = "pagebook";
var DB_VERSION = 1;

var Pagebook = function () {
  function Pagebook() {
    _classCallCheck(this, Pagebook);
  }

  _createClass(Pagebook, [{
    key: "getStore",
    value: function getStore() {
      return new _idbWrapperPromisify2.default({
        storeName: DB_NAME,
        version: DB_VERSION,
        indexes: [{ name: "url", unique: true }]
      });
    }
  }, {
    key: "add",
    value: function add(param) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var store = _this.getStore();
        store.ready.then(function () {
          return store.put(param);
        }).then(function (id) {
          resolve();
        });
      });
    }
  }, {
    key: "findAll",
    value: function findAll() {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        var store = _this2.getStore();
        store.ready.then(function () {
          return store.getAll();
        }).then(function (entries) {
          resolve(entries);
        });
      });
    }
  }]);

  return Pagebook;
}();

exports.default = Pagebook;

},{"idb-wrapper-promisify":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiLXdyYXBwZXItcHJvbWlzaWZ5L2lkYnN0b3JlLmpzIiwic3JjL2JhY2tncm91bmQuanMiLCJzcmMvbm90aWZ5LmpzIiwic3JjL3BhZ2Vib29rLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3ZvQ0E7Ozs7QUFDQTs7Ozs7O0FBRUEsSUFBTSxnQkFBZ0Isc0JBQXRCO0FBQ0EsSUFBTSxvQkFBb0IsMEJBQTFCOztBQUVBLE9BQU8sWUFBUCxDQUFvQixNQUFwQixDQUEyQjtBQUN6QixNQUFJLGFBRHFCO0FBRXpCLFFBQU0sUUFGbUI7QUFHekIsU0FBTyxPQUFPLElBQVAsQ0FBWSxVQUFaLENBQXVCLHdCQUF2QixDQUhrQjtBQUl6QixZQUFVLENBQUMsTUFBRDtBQUplLENBQTNCOztBQU9BLE9BQU8sWUFBUCxDQUFvQixNQUFwQixDQUEyQjtBQUN6QixNQUFJLGlCQURxQjtBQUV6QixRQUFNLFFBRm1CO0FBR3pCLFNBQU8sT0FBTyxJQUFQLENBQVksVUFBWixDQUF1Qiw0QkFBdkIsQ0FIa0I7QUFJekIsWUFBVSxDQUFDLE1BQUQ7QUFKZSxDQUEzQjs7QUFPQSxPQUFPLFlBQVAsQ0FBb0IsU0FBcEIsQ0FBOEIsV0FBOUIsQ0FBMEMsVUFBQyxJQUFELEVBQU8sR0FBUCxFQUFlO0FBQ3ZELFVBQU8sS0FBSyxVQUFaO0FBQ0UsU0FBSyxhQUFMO0FBQ0UsVUFBSSxHQUFKO0FBQ0E7QUFDRixTQUFLLGlCQUFMO0FBQ0U7QUFDQTtBQUNGO0FBQ0UsWUFBTSxTQUFOO0FBUko7QUFVRCxDQVhEOztBQWFBLElBQUksV0FBVyx3QkFBZjtBQUNBLE9BQU8sUUFBUCxHQUFrQixRQUFsQjs7QUFFQSxTQUFTLEdBQVQsQ0FBYSxHQUFiLEVBQWtCO0FBQUEsTUFDVixFQURVLEdBQ1MsR0FEVCxDQUNWLEVBRFU7QUFBQSxNQUNOLEtBRE0sR0FDUyxHQURULENBQ04sS0FETTtBQUFBLE1BQ0MsR0FERCxHQUNTLEdBRFQsQ0FDQyxHQUREOztBQUVoQixNQUFJLElBQUksU0FBUyxhQUFULENBQXVCLEdBQXZCLENBQVI7QUFDQSxJQUFFLFlBQUYsQ0FBZSxNQUFmLEVBQXVCLEdBQXZCOztBQUVBLE1BQUksRUFBRSxRQUFGLENBQVcsVUFBWCxDQUFzQixNQUF0QixDQUFKLEVBQW1DO0FBQ2pDLGFBQVMsR0FBVCxDQUFhLEVBQUUsWUFBRixFQUFTLFFBQVQsRUFBYixFQUE2QixJQUE3QixDQUFrQyxZQUFNO0FBQ3RDLHVCQUFPLElBQVAsQ0FBWSxFQUFaLEVBQWdCLFFBQWhCLEVBQTZCLEtBQTdCLFNBQXNDLEdBQXRDO0FBQ0QsS0FGRDtBQUdEO0FBQ0Y7O0FBRUQsU0FBUyxNQUFULEdBQWtCO0FBQ2hCLFNBQU8sT0FBUCxDQUFlLE1BQWYsQ0FBc0IsbUJBQVc7QUFDL0IsWUFBUSxPQUFSLENBQWdCLGtCQUFVO0FBQ3hCLGFBQU8sSUFBUCxDQUFZLGNBQVosQ0FBMkIsT0FBTyxFQUFsQyxFQUFzQyxnQkFBUTtBQUM1QyxhQUFLLE9BQUwsQ0FBYSxHQUFiO0FBQ0QsT0FGRDtBQUdELEtBSkQ7QUFLRCxHQU5EO0FBT0Q7Ozs7Ozs7Ozs7Ozs7SUN4RG9CLE07Ozs7Ozs7eUJBQ1AsRSxFQUFJLEssRUFBTyxPLEVBQVM7QUFDOUIsYUFBTyxhQUFQLENBQXFCLE1BQXJCLENBQ0UsT0FBTyxFQUFQLENBREYsRUFFRSxFQUFFLFFBQVEsT0FBVixFQUFtQixXQUFXLDJCQUE5QixFQUEyRCxZQUEzRCxFQUFrRSxnQkFBbEUsRUFGRixFQUdFLGNBQU07QUFDSixtQkFBVyxZQUFNO0FBQ2YsaUJBQU8sYUFBUCxDQUFxQixLQUFyQixDQUEyQixFQUEzQixFQUErQixZQUFNLENBQUUsQ0FBdkM7QUFDRCxTQUZELEVBRUcsSUFGSDtBQUdELE9BUEg7QUFTRDs7Ozs7O2tCQVhrQixNOzs7Ozs7Ozs7OztBQ0FyQjs7Ozs7Ozs7QUFFQSxJQUFNLFVBQVUsVUFBaEI7QUFDQSxJQUFNLGFBQWEsQ0FBbkI7O0lBRXFCLFE7Ozs7Ozs7K0JBRVI7QUFDVCxhQUFPLGtDQUFhO0FBQ2xCLG1CQUFXLE9BRE87QUFFbEIsaUJBQVMsVUFGUztBQUdsQixpQkFBUyxDQUFDLEVBQUUsTUFBTSxLQUFSLEVBQWUsUUFBUSxJQUF2QixFQUFEO0FBSFMsT0FBYixDQUFQO0FBS0Q7Ozt3QkFFRyxLLEVBQU87QUFBQTs7QUFDVCxhQUFPLElBQUksT0FBSixDQUFZLFVBQUMsT0FBRCxFQUFVLE1BQVYsRUFBcUI7QUFDdEMsWUFBSSxRQUFRLE1BQUssUUFBTCxFQUFaO0FBQ0EsY0FBTSxLQUFOLENBQVksSUFBWixDQUFpQjtBQUFBLGlCQUFNLE1BQU0sR0FBTixDQUFVLEtBQVYsQ0FBTjtBQUFBLFNBQWpCLEVBQXlDLElBQXpDLENBQThDLGNBQU07QUFDbEQ7QUFDRCxTQUZEO0FBR0QsT0FMTSxDQUFQO0FBTUQ7Ozs4QkFFUztBQUFBOztBQUNSLGFBQU8sSUFBSSxPQUFKLENBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxZQUFJLFFBQVEsT0FBSyxRQUFMLEVBQVo7QUFDQSxjQUFNLEtBQU4sQ0FBWSxJQUFaLENBQWlCO0FBQUEsaUJBQU0sTUFBTSxNQUFOLEVBQU47QUFBQSxTQUFqQixFQUF1QyxJQUF2QyxDQUE0QyxtQkFBVztBQUNyRCxrQkFBUSxPQUFSO0FBQ0QsU0FGRDtBQUdELE9BTE0sQ0FBUDtBQU1EOzs7Ozs7a0JBMUJrQixRIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qZ2xvYmFsIHdpbmRvdzpmYWxzZSwgc2VsZjpmYWxzZSwgZGVmaW5lOmZhbHNlLCBtb2R1bGU6ZmFsc2UgKi9cblxuLyoqXG4gKiBAbGljZW5zZSBJREJXcmFwcGVyIC0gQSBjcm9zcy1icm93c2VyIHdyYXBwZXIgZm9yIEluZGV4ZWREQlxuICogQ29weXJpZ2h0IChjKSAyMDExIC0gMjAxMyBKZW5zIEFycHNcbiAqIGh0dHA6Ly9qZW5zYXJwcy5kZS9cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIChYMTEpIGxpY2Vuc2VcbiAqL1xuXG4oZnVuY3Rpb24gKG5hbWUsIGRlZmluaXRpb24sIGdsb2JhbCkge1xuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGRlZmluZShkZWZpbml0aW9uKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICB9IGVsc2Uge1xuICAgIGdsb2JhbFtuYW1lXSA9IGRlZmluaXRpb24oKTtcbiAgfVxufSkoJ0lEQlN0b3JlJywgZnVuY3Rpb24gKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgZGVmYXVsdEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgIHRocm93IGVycm9yO1xuICB9O1xuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICBzdG9yZU5hbWU6ICdTdG9yZScsXG4gICAgc3RvcmVQcmVmaXg6ICdJREJXcmFwcGVyLScsXG4gICAgZGJWZXJzaW9uOiAxLFxuICAgIGtleVBhdGg6ICdpZCcsXG4gICAgYXV0b0luY3JlbWVudDogdHJ1ZSxcbiAgICBvblN0b3JlUmVhZHk6IGZ1bmN0aW9uICgpIHtcbiAgICB9LFxuICAgIG9uRXJyb3I6IGRlZmF1bHRFcnJvckhhbmRsZXIsXG4gICAgaW5kZXhlczogW11cbiAgfTtcblxuICAvKipcbiAgICpcbiAgICogVGhlIElEQlN0b3JlIGNvbnN0cnVjdG9yXG4gICAqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAbmFtZSBJREJTdG9yZVxuICAgKiBAdmVyc2lvbiAyLjEuMFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2t3QXJnc10gQW4gb3B0aW9ucyBvYmplY3QgdXNlZCB0byBjb25maWd1cmUgdGhlIHN0b3JlIGFuZFxuICAgKiAgc2V0IGNhbGxiYWNrc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gW2t3QXJncy5zdG9yZU5hbWU9J1N0b3JlJ10gVGhlIG5hbWUgb2YgdGhlIHN0b3JlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBba3dBcmdzLnN0b3JlUHJlZml4PSdJREJXcmFwcGVyLSddIEEgcHJlZml4IHRoYXQgaXNcbiAgICogIGludGVybmFsbHkgdXNlZCB0byBjb25zdHJ1Y3QgdGhlIG5hbWUgb2YgdGhlIGRhdGFiYXNlLCB3aGljaCB3aWxsIGJlXG4gICAqICBrd0FyZ3Muc3RvcmVQcmVmaXggKyBrd0FyZ3Muc3RvcmVOYW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBba3dBcmdzLmRiVmVyc2lvbj0xXSBUaGUgdmVyc2lvbiBvZiB0aGUgc3RvcmVcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtrd0FyZ3Mua2V5UGF0aD0naWQnXSBUaGUga2V5IHBhdGggdG8gdXNlLiBJZiB5b3Ugd2FudCB0b1xuICAgKiAgc2V0dXAgSURCV3JhcHBlciB0byB3b3JrIHdpdGggb3V0LW9mLWxpbmUga2V5cywgeW91IG5lZWQgdG8gc2V0IHRoaXMgdG9cbiAgICogIGBudWxsYFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtrd0FyZ3MuYXV0b0luY3JlbWVudD10cnVlXSBJZiBzZXQgdG8gdHJ1ZSwgSURCU3RvcmUgd2lsbFxuICAgKiAgYXV0b21hdGljYWxseSBtYWtlIHN1cmUgYSB1bmlxdWUga2V5UGF0aCB2YWx1ZSBpcyBwcmVzZW50IG9uIGVhY2ggb2JqZWN0XG4gICAqICB0aGF0IGlzIHN0b3JlZC5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2t3QXJncy5vblN0b3JlUmVhZHldIEEgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlXG4gICAqICBzdG9yZSBpcyByZWFkeSB0byBiZSB1c2VkLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBba3dBcmdzLm9uRXJyb3I9dGhyb3ddIEEgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gYW5cbiAgICogIGVycm9yIG9jY3VycmVkIGR1cmluZyBpbnN0YW50aWF0aW9uIG9mIHRoZSBzdG9yZS5cbiAgICogQHBhcmFtIHtBcnJheX0gW2t3QXJncy5pbmRleGVzPVtdXSBBbiBhcnJheSBvZiBpbmRleERhdGEgb2JqZWN0c1xuICAgKiAgZGVmaW5pbmcgdGhlIGluZGV4ZXMgdG8gdXNlIHdpdGggdGhlIHN0b3JlLiBGb3IgZXZlcnkgaW5kZXggdG8gYmUgdXNlZFxuICAgKiAgb25lIGluZGV4RGF0YSBvYmplY3QgbmVlZHMgdG8gYmUgcGFzc2VkIGluIHRoZSBhcnJheS5cbiAgICogIEFuIGluZGV4RGF0YSBvYmplY3QgaXMgZGVmaW5lZCBhcyBmb2xsb3dzOlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2t3QXJncy5pbmRleGVzLmluZGV4RGF0YV0gQW4gb2JqZWN0IGRlZmluaW5nIHRoZSBpbmRleCB0b1xuICAgKiAgdXNlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrd0FyZ3MuaW5kZXhlcy5pbmRleERhdGEubmFtZSBUaGUgbmFtZSBvZiB0aGUgaW5kZXhcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtrd0FyZ3MuaW5kZXhlcy5pbmRleERhdGEua2V5UGF0aF0gVGhlIGtleSBwYXRoIG9mIHRoZSBpbmRleFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtrd0FyZ3MuaW5kZXhlcy5pbmRleERhdGEudW5pcXVlXSBXaGV0aGVyIHRoZSBpbmRleCBpcyB1bmlxdWVcbiAgICogQHBhcmFtIHtCb29sZWFufSBba3dBcmdzLmluZGV4ZXMuaW5kZXhEYXRhLm11bHRpRW50cnldIFdoZXRoZXIgdGhlIGluZGV4IGlzIG11bHRpIGVudHJ5XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblN0b3JlUmVhZHldIEEgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIHN0b3JlXG4gICAqIGlzIHJlYWR5IHRvIGJlIHVzZWQuXG4gICAqIEBleGFtcGxlXG4gICAgICAvLyBjcmVhdGUgYSBzdG9yZSBmb3IgY3VzdG9tZXJzIHdpdGggYW4gYWRkaXRpb25hbCBpbmRleCBvdmVyIHRoZVxuICAgICAgLy8gYGxhc3RuYW1lYCBwcm9wZXJ0eS5cbiAgICAgIHZhciBteUN1c3RvbWVyU3RvcmUgPSBuZXcgSURCU3RvcmUoe1xuICAgICAgICBkYlZlcnNpb246IDEsXG4gICAgICAgIHN0b3JlTmFtZTogJ2N1c3RvbWVyLWluZGV4JyxcbiAgICAgICAga2V5UGF0aDogJ2N1c3RvbWVyaWQnLFxuICAgICAgICBhdXRvSW5jcmVtZW50OiB0cnVlLFxuICAgICAgICBvblN0b3JlUmVhZHk6IHBvcHVsYXRlVGFibGUsXG4gICAgICAgIGluZGV4ZXM6IFtcbiAgICAgICAgICB7IG5hbWU6ICdsYXN0bmFtZScsIGtleVBhdGg6ICdsYXN0bmFtZScsIHVuaXF1ZTogZmFsc2UsIG11bHRpRW50cnk6IGZhbHNlIH1cbiAgICAgICAgXVxuICAgICAgfSk7XG4gICAqIEBleGFtcGxlXG4gICAgICAvLyBjcmVhdGUgYSBnZW5lcmljIHN0b3JlXG4gICAgICB2YXIgbXlDdXN0b21lclN0b3JlID0gbmV3IElEQlN0b3JlKHtcbiAgICAgICAgc3RvcmVOYW1lOiAnbXktZGF0YS1zdG9yZScsXG4gICAgICAgIG9uU3RvcmVSZWFkeTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAvLyBzdGFydCB3b3JraW5nIHdpdGggdGhlIHN0b3JlLlxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICovXG4gIHZhciBJREJTdG9yZSA9IGZ1bmN0aW9uIChrd0FyZ3MsIG9uU3RvcmVSZWFkeSkge1xuXG4gICAgaWYgKHR5cGVvZiBvblN0b3JlUmVhZHkgPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGt3QXJncyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBvblN0b3JlUmVhZHkgPSBrd0FyZ3M7XG4gICAgfVxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoa3dBcmdzKSAhPSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAga3dBcmdzID0ge307XG4gICAgfVxuXG4gICAgZm9yICh2YXIga2V5IGluIGRlZmF1bHRzKSB7XG4gICAgICB0aGlzW2tleV0gPSB0eXBlb2Yga3dBcmdzW2tleV0gIT0gJ3VuZGVmaW5lZCcgPyBrd0FyZ3Nba2V5XSA6IGRlZmF1bHRzW2tleV07XG4gICAgfVxuXG4gICAgdGhpcy5kYk5hbWUgPSB0aGlzLnN0b3JlUHJlZml4ICsgdGhpcy5zdG9yZU5hbWU7XG4gICAgdGhpcy5kYlZlcnNpb24gPSBwYXJzZUludCh0aGlzLmRiVmVyc2lvbiwgMTApIHx8IDE7XG5cbiAgICB2YXIgZW52ID0gdHlwZW9mIHdpbmRvdyA9PSAnb2JqZWN0JyA/IHdpbmRvdyA6IHNlbGY7XG4gICAgdGhpcy5pZGIgPSBlbnYuaW5kZXhlZERCIHx8IGVudi53ZWJraXRJbmRleGVkREIgfHwgZW52Lm1vekluZGV4ZWREQjtcbiAgICB0aGlzLmtleVJhbmdlID0gZW52LklEQktleVJhbmdlIHx8IGVudi53ZWJraXRJREJLZXlSYW5nZSB8fCBlbnYubW96SURCS2V5UmFuZ2U7XG5cbiAgICB0aGlzLmZlYXR1cmVzID0ge1xuICAgICAgaGFzQXV0b0luY3JlbWVudDogIWVudi5tb3pJbmRleGVkREJcbiAgICB9O1xuXG4gICAgdGhpcy5jb25zdHMgPSB7XG4gICAgICAnUkVBRF9PTkxZJzogICAgICAgICAncmVhZG9ubHknLFxuICAgICAgJ1JFQURfV1JJVEUnOiAgICAgICAgJ3JlYWR3cml0ZScsXG4gICAgICAnVkVSU0lPTl9DSEFOR0UnOiAgICAndmVyc2lvbmNoYW5nZScsXG4gICAgICAnTkVYVCc6ICAgICAgICAgICAgICAnbmV4dCcsXG4gICAgICAnTkVYVF9OT19EVVBMSUNBVEUnOiAnbmV4dHVuaXF1ZScsXG4gICAgICAnUFJFVic6ICAgICAgICAgICAgICAncHJldicsXG4gICAgICAnUFJFVl9OT19EVVBMSUNBVEUnOiAncHJldnVuaXF1ZSdcbiAgICB9O1xuXG4gICAgdmFyIF9kb25lLCBfcmVqZWN0O1xuICAgIHRoaXMucmVhZHkgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihkb25lLCByZWplY3Qpe1xuICAgICAgX2RvbmUgPSBkb25lO1xuICAgICAgX3JlamVjdCA9IHJlamVjdDtcbiAgICB9KTtcblxuICAgIHRoaXMub25TdG9yZVJlYWR5ID0gZnVuY3Rpb24oKXtcbiAgICAgIF9kb25lKCk7XG4gICAgfTtcbiAgICB0aGlzLm9uRXJyb3IgPSBmdW5jdGlvbigpe1xuICAgICAgX3JlamVjdCgpO1xuICAgIH07XG5cbiAgICB0aGlzLm9wZW5EQigpO1xuICB9O1xuXG4gIElEQlN0b3JlLnByb3RvdHlwZSA9IC8qKiBAbGVuZHMgSURCU3RvcmUgKi8ge1xuXG4gICAgLyoqXG4gICAgICogQSBwb2ludGVyIHRvIHRoZSBJREJTdG9yZSBjdG9yXG4gICAgICpcbiAgICAgKiBAdHlwZSBJREJTdG9yZVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yOiBJREJTdG9yZSxcblxuICAgIC8qKlxuICAgICAqIFRoZSB2ZXJzaW9uIG9mIElEQlN0b3JlXG4gICAgICpcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKi9cbiAgICB2ZXJzaW9uOiAnMi4xLjAnLFxuXG4gICAgLyoqXG4gICAgICogQSByZWZlcmVuY2UgdG8gdGhlIEluZGV4ZWREQiBvYmplY3RcbiAgICAgKlxuICAgICAqIEB0eXBlIE9iamVjdFxuICAgICAqL1xuICAgIGRiOiBudWxsLFxuXG4gICAgLyoqXG4gICAgICogVGhlIGZ1bGwgbmFtZSBvZiB0aGUgSW5kZXhlZERCIHVzZWQgYnkgSURCU3RvcmUsIGNvbXBvc2VkIG9mXG4gICAgICogdGhpcy5zdG9yZVByZWZpeCArIHRoaXMuc3RvcmVOYW1lXG4gICAgICpcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKi9cbiAgICBkYk5hbWU6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBUaGUgdmVyc2lvbiBvZiB0aGUgSW5kZXhlZERCIHVzZWQgYnkgSURCU3RvcmVcbiAgICAgKlxuICAgICAqIEB0eXBlIE51bWJlclxuICAgICAqL1xuICAgIGRiVmVyc2lvbjogbnVsbCxcblxuICAgIC8qKlxuICAgICAqIEEgcmVmZXJlbmNlIHRvIHRoZSBvYmplY3RTdG9yZSB1c2VkIGJ5IElEQlN0b3JlXG4gICAgICpcbiAgICAgKiBAdHlwZSBPYmplY3RcbiAgICAgKi9cbiAgICBzdG9yZTogbnVsbCxcblxuICAgIC8qKlxuICAgICAqIFRoZSBzdG9yZSBuYW1lXG4gICAgICpcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKi9cbiAgICBzdG9yZU5hbWU6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBUaGUga2V5IHBhdGhcbiAgICAgKlxuICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAqL1xuICAgIGtleVBhdGg6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBXaGV0aGVyIElEQlN0b3JlIHVzZXMgYXV0b0luY3JlbWVudFxuICAgICAqXG4gICAgICogQHR5cGUgQm9vbGVhblxuICAgICAqL1xuICAgIGF1dG9JbmNyZW1lbnQ6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBUaGUgaW5kZXhlcyB1c2VkIGJ5IElEQlN0b3JlXG4gICAgICpcbiAgICAgKiBAdHlwZSBBcnJheVxuICAgICAqL1xuICAgIGluZGV4ZXM6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBBIGhhc2htYXAgb2YgZmVhdHVyZXMgb2YgdGhlIHVzZWQgSURCIGltcGxlbWVudGF0aW9uXG4gICAgICpcbiAgICAgKiBAdHlwZSBPYmplY3RcbiAgICAgKiBAcHJvcHJ0eSB7Qm9vbGVhbn0gYXV0b0luY3JlbWVudCBJZiB0aGUgaW1wbGVtZW50YXRpb24gc3VwcG9ydHNcbiAgICAgKiAgbmF0aXZlIGF1dG8gaW5jcmVtZW50XG4gICAgICovXG4gICAgZmVhdHVyZXM6IG51bGwsXG5cbiAgICAvKipcbiAgICAgKiBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIHN0b3JlIGlzIHJlYWR5IHRvIGJlIHVzZWRcbiAgICAgKlxuICAgICAqIEB0eXBlIEZ1bmN0aW9uXG4gICAgICovXG4gICAgb25TdG9yZVJlYWR5OiBudWxsLFxuXG4gICAgLyoqXG4gICAgICogVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBpZiBhbiBlcnJvciBvY2N1cnJlZCBkdXJpbmcgaW5zdGFudGlhdGlvblxuICAgICAqIG9mIHRoZSBzdG9yZVxuICAgICAqXG4gICAgICogQHR5cGUgRnVuY3Rpb25cbiAgICAgKi9cbiAgICBvbkVycm9yOiBudWxsLFxuXG4gICAgLyoqXG4gICAgICogVGhlIGludGVybmFsIGluc2VydElEIGNvdW50ZXJcbiAgICAgKlxuICAgICAqIEB0eXBlIE51bWJlclxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgX2luc2VydElkQ291bnQ6IDAsXG5cbiAgICAvKipcbiAgICAgKiBPcGVucyBhbiBJbmRleGVkREI7IGNhbGxlZCBieSB0aGUgY29uc3RydWN0b3IuXG4gICAgICpcbiAgICAgKiBXaWxsIGNoZWNrIGlmIHZlcnNpb25zIG1hdGNoIGFuZCBjb21wYXJlIHByb3ZpZGVkIGluZGV4IGNvbmZpZ3VyYXRpb25cbiAgICAgKiB3aXRoIGV4aXN0aW5nIG9uZXMsIGFuZCB1cGRhdGUgaW5kZXhlcyBpZiBuZWNlc3NhcnkuXG4gICAgICpcbiAgICAgKiBXaWxsIGNhbGwgdGhpcy5vblN0b3JlUmVhZHkoKSBpZiBldmVyeXRoaW5nIHdlbnQgd2VsbCBhbmQgdGhlIHN0b3JlXG4gICAgICogaXMgcmVhZHkgdG8gdXNlLCBhbmQgdGhpcy5vbkVycm9yKCkgaXMgc29tZXRoaW5nIHdlbnQgd3JvbmcuXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqXG4gICAgICovXG4gICAgb3BlbkRCOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIHZhciBvcGVuUmVxdWVzdCA9IHRoaXMuaWRiLm9wZW4odGhpcy5kYk5hbWUsIHRoaXMuZGJWZXJzaW9uKTtcbiAgICAgIHZhciBwcmV2ZW50U3VjY2Vzc0NhbGxiYWNrID0gZmFsc2U7XG5cbiAgICAgIG9wZW5SZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcblxuICAgICAgICB2YXIgZ290VmVyc2lvbkVyciA9IGZhbHNlO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiBlcnJvci50YXJnZXQpIHtcbiAgICAgICAgICBnb3RWZXJzaW9uRXJyID0gZXJyb3IudGFyZ2V0LmVycm9yLm5hbWUgPT0gJ1ZlcnNpb25FcnJvcic7XG4gICAgICAgIH0gZWxzZSBpZiAoJ2Vycm9yQ29kZScgaW4gZXJyb3IudGFyZ2V0KSB7XG4gICAgICAgICAgZ290VmVyc2lvbkVyciA9IGVycm9yLnRhcmdldC5lcnJvckNvZGUgPT0gMTI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZ290VmVyc2lvbkVycikge1xuICAgICAgICAgIHRoaXMub25FcnJvcihuZXcgRXJyb3IoJ1RoZSB2ZXJzaW9uIG51bWJlciBwcm92aWRlZCBpcyBsb3dlciB0aGFuIHRoZSBleGlzdGluZyBvbmUuJykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMub25FcnJvcihlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgb3BlblJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cbiAgICAgICAgaWYgKHByZXZlbnRTdWNjZXNzQ2FsbGJhY2spIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZih0aGlzLmRiKXtcbiAgICAgICAgICB0aGlzLm9uU3RvcmVSZWFkeSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZGIgPSBldmVudC50YXJnZXQucmVzdWx0O1xuXG4gICAgICAgIGlmKHR5cGVvZiB0aGlzLmRiLnZlcnNpb24gPT0gJ3N0cmluZycpe1xuICAgICAgICAgIHRoaXMub25FcnJvcihuZXcgRXJyb3IoJ1RoZSBJbmRleGVkREIgaW1wbGVtZW50YXRpb24gaW4gdGhpcyBicm93c2VyIGlzIG91dGRhdGVkLiBQbGVhc2UgdXBncmFkZSB5b3VyIGJyb3dzZXIuJykpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCF0aGlzLmRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnModGhpcy5zdG9yZU5hbWUpKXtcbiAgICAgICAgICAvLyBXZSBzaG91bGQgbmV2ZXIgZXZlciBnZXQgaGVyZS5cbiAgICAgICAgICAvLyBMZXRzIG5vdGlmeSB0aGUgdXNlciBhbnl3YXkuXG4gICAgICAgICAgdGhpcy5vbkVycm9yKG5ldyBFcnJvcignU29tZXRoaW5nIGlzIHdyb25nIHdpdGggdGhlIEluZGV4ZWREQiBpbXBsZW1lbnRhdGlvbiBpbiB0aGlzIGJyb3dzZXIuIFBsZWFzZSB1cGdyYWRlIHlvdXIgYnJvd3Nlci4nKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVtcHR5VHJhbnNhY3Rpb24gPSB0aGlzLmRiLnRyYW5zYWN0aW9uKFt0aGlzLnN0b3JlTmFtZV0sIHRoaXMuY29uc3RzLlJFQURfT05MWSk7XG4gICAgICAgIHRoaXMuc3RvcmUgPSBlbXB0eVRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKTtcblxuICAgICAgICAvLyBjaGVjayBpbmRleGVzXG4gICAgICAgIHZhciBleGlzdGluZ0luZGV4ZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmdldEluZGV4TGlzdCgpKTtcbiAgICAgICAgdGhpcy5pbmRleGVzLmZvckVhY2goZnVuY3Rpb24oaW5kZXhEYXRhKXtcbiAgICAgICAgICB2YXIgaW5kZXhOYW1lID0gaW5kZXhEYXRhLm5hbWU7XG5cbiAgICAgICAgICBpZighaW5kZXhOYW1lKXtcbiAgICAgICAgICAgIHByZXZlbnRTdWNjZXNzQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5vbkVycm9yKG5ldyBFcnJvcignQ2Fubm90IGNyZWF0ZSBpbmRleDogTm8gaW5kZXggbmFtZSBnaXZlbi4nKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5ub3JtYWxpemVJbmRleERhdGEoaW5kZXhEYXRhKTtcblxuICAgICAgICAgIGlmKHRoaXMuaGFzSW5kZXgoaW5kZXhOYW1lKSl7XG4gICAgICAgICAgICAvLyBjaGVjayBpZiBpdCBjb21wbGllc1xuICAgICAgICAgICAgdmFyIGFjdHVhbEluZGV4ID0gdGhpcy5zdG9yZS5pbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgdmFyIGNvbXBsaWVzID0gdGhpcy5pbmRleENvbXBsaWVzKGFjdHVhbEluZGV4LCBpbmRleERhdGEpO1xuICAgICAgICAgICAgaWYoIWNvbXBsaWVzKXtcbiAgICAgICAgICAgICAgcHJldmVudFN1Y2Nlc3NDYWxsYmFjayA9IHRydWU7XG4gICAgICAgICAgICAgIHRoaXMub25FcnJvcihuZXcgRXJyb3IoJ0Nhbm5vdCBtb2RpZnkgaW5kZXggXCInICsgaW5kZXhOYW1lICsgJ1wiIGZvciBjdXJyZW50IHZlcnNpb24uIFBsZWFzZSBidW1wIHZlcnNpb24gbnVtYmVyIHRvICcgKyAoIHRoaXMuZGJWZXJzaW9uICsgMSApICsgJy4nKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGV4aXN0aW5nSW5kZXhlcy5zcGxpY2UoZXhpc3RpbmdJbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSwgMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByZXZlbnRTdWNjZXNzQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5vbkVycm9yKG5ldyBFcnJvcignQ2Fubm90IGNyZWF0ZSBuZXcgaW5kZXggXCInICsgaW5kZXhOYW1lICsgJ1wiIGZvciBjdXJyZW50IHZlcnNpb24uIFBsZWFzZSBidW1wIHZlcnNpb24gbnVtYmVyIHRvICcgKyAoIHRoaXMuZGJWZXJzaW9uICsgMSApICsgJy4nKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgIH0sIHRoaXMpO1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcHJldmVudFN1Y2Nlc3NDYWxsYmFjayA9IHRydWU7XG4gICAgICAgICAgdGhpcy5vbkVycm9yKG5ldyBFcnJvcignQ2Fubm90IGRlbGV0ZSBpbmRleChlcykgXCInICsgZXhpc3RpbmdJbmRleGVzLnRvU3RyaW5nKCkgKyAnXCIgZm9yIGN1cnJlbnQgdmVyc2lvbi4gUGxlYXNlIGJ1bXAgdmVyc2lvbiBudW1iZXIgdG8gJyArICggdGhpcy5kYlZlcnNpb24gKyAxICkgKyAnLicpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByZXZlbnRTdWNjZXNzQ2FsbGJhY2sgfHwgdGhpcy5vblN0b3JlUmVhZHkoKTtcbiAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgb3BlblJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24oLyogSURCVmVyc2lvbkNoYW5nZUV2ZW50ICovIGV2ZW50KXtcblxuICAgICAgICB0aGlzLmRiID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcblxuICAgICAgICBpZih0aGlzLmRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnModGhpcy5zdG9yZU5hbWUpKXtcbiAgICAgICAgICB0aGlzLnN0b3JlID0gZXZlbnQudGFyZ2V0LnRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgb3B0aW9uYWxQYXJhbWV0ZXJzID0geyBhdXRvSW5jcmVtZW50OiB0aGlzLmF1dG9JbmNyZW1lbnQgfTtcbiAgICAgICAgICBpZiAodGhpcy5rZXlQYXRoICE9PSBudWxsKSB7XG4gICAgICAgICAgICBvcHRpb25hbFBhcmFtZXRlcnMua2V5UGF0aCA9IHRoaXMua2V5UGF0aDtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5zdG9yZSA9IHRoaXMuZGIuY3JlYXRlT2JqZWN0U3RvcmUodGhpcy5zdG9yZU5hbWUsIG9wdGlvbmFsUGFyYW1ldGVycyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhpc3RpbmdJbmRleGVzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5nZXRJbmRleExpc3QoKSk7XG4gICAgICAgIHRoaXMuaW5kZXhlcy5mb3JFYWNoKGZ1bmN0aW9uKGluZGV4RGF0YSl7XG4gICAgICAgICAgdmFyIGluZGV4TmFtZSA9IGluZGV4RGF0YS5uYW1lO1xuXG4gICAgICAgICAgaWYoIWluZGV4TmFtZSl7XG4gICAgICAgICAgICBwcmV2ZW50U3VjY2Vzc0NhbGxiYWNrID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMub25FcnJvcihuZXcgRXJyb3IoJ0Nhbm5vdCBjcmVhdGUgaW5kZXg6IE5vIGluZGV4IG5hbWUgZ2l2ZW4uJykpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMubm9ybWFsaXplSW5kZXhEYXRhKGluZGV4RGF0YSk7XG5cbiAgICAgICAgICBpZih0aGlzLmhhc0luZGV4KGluZGV4TmFtZSkpe1xuICAgICAgICAgICAgLy8gY2hlY2sgaWYgaXQgY29tcGxpZXNcbiAgICAgICAgICAgIHZhciBhY3R1YWxJbmRleCA9IHRoaXMuc3RvcmUuaW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICAgIHZhciBjb21wbGllcyA9IHRoaXMuaW5kZXhDb21wbGllcyhhY3R1YWxJbmRleCwgaW5kZXhEYXRhKTtcbiAgICAgICAgICAgIGlmKCFjb21wbGllcyl7XG4gICAgICAgICAgICAgIC8vIGluZGV4IGRpZmZlcnMsIG5lZWQgdG8gZGVsZXRlIGFuZCByZS1jcmVhdGVcbiAgICAgICAgICAgICAgdGhpcy5zdG9yZS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgICB0aGlzLnN0b3JlLmNyZWF0ZUluZGV4KGluZGV4TmFtZSwgaW5kZXhEYXRhLmtleVBhdGgsIHsgdW5pcXVlOiBpbmRleERhdGEudW5pcXVlLCBtdWx0aUVudHJ5OiBpbmRleERhdGEubXVsdGlFbnRyeSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZXhpc3RpbmdJbmRleGVzLnNwbGljZShleGlzdGluZ0luZGV4ZXMuaW5kZXhPZihpbmRleE5hbWUpLCAxKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zdG9yZS5jcmVhdGVJbmRleChpbmRleE5hbWUsIGluZGV4RGF0YS5rZXlQYXRoLCB7IHVuaXF1ZTogaW5kZXhEYXRhLnVuaXF1ZSwgbXVsdGlFbnRyeTogaW5kZXhEYXRhLm11bHRpRW50cnkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgIH0sIHRoaXMpO1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgZXhpc3RpbmdJbmRleGVzLmZvckVhY2goZnVuY3Rpb24oX2luZGV4TmFtZSl7XG4gICAgICAgICAgICB0aGlzLnN0b3JlLmRlbGV0ZUluZGV4KF9pbmRleE5hbWUpO1xuICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgIH0uYmluZCh0aGlzKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRGVsZXRlcyB0aGUgZGF0YWJhc2UgdXNlZCBmb3IgdGhpcyBzdG9yZSBpZiB0aGUgSURCIGltcGxlbWVudGF0aW9uc1xuICAgICAqIHByb3ZpZGVzIHRoYXQgZnVuY3Rpb25hbGl0eS5cbiAgICAgKi9cbiAgICBkZWxldGVEYXRhYmFzZTogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHRoaXMuaWRiLmRlbGV0ZURhdGFiYXNlKSB7XG4gICAgICAgIHRoaXMuaWRiLmRlbGV0ZURhdGFiYXNlKHRoaXMuZGJOYW1lKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqKioqKioqKioqKioqKioqKioqKlxuICAgICAqIGRhdGEgbWFuaXB1bGF0aW9uICpcbiAgICAgKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgLyoqXG4gICAgICogUHV0cyBhbiBvYmplY3QgaW50byB0aGUgc3RvcmUuIElmIGFuIGVudHJ5IHdpdGggdGhlIGdpdmVuIGlkIGV4aXN0cyxcbiAgICAgKiBpdCB3aWxsIGJlIG92ZXJ3cml0dGVuLiBUaGlzIG1ldGhvZCBoYXMgYSBkaWZmZXJlbnQgc2lnbmF0dXJlIGZvciBpbmxpbmVcbiAgICAgKiBrZXlzIGFuZCBvdXQtb2YtbGluZSBrZXlzOyBwbGVhc2Ugc2VlIHRoZSBleGFtcGxlcyBiZWxvdy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gW2tleV0gVGhlIGtleSB0byBzdG9yZS4gVGhpcyBpcyBvbmx5IG5lZWRlZCBpZiBJREJXcmFwcGVyXG4gICAgICogIGlzIHNldCB0byB1c2Ugb3V0LW9mLWxpbmUga2V5cy4gRm9yIGlubGluZSBrZXlzIC0gdGhlIGRlZmF1bHQgc2NlbmFyaW8gLVxuICAgICAqICB0aGlzIGNhbiBiZSBvbWl0dGVkLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB2YWx1ZSBUaGUgZGF0YSBvYmplY3QgdG8gc3RvcmUuXG4gICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICogQGV4YW1wbGVcbiAgICAgICAgLy8gU3RvcmluZyBhbiBvYmplY3QsIHVzaW5nIGlubGluZSBrZXlzICh0aGUgZGVmYXVsdCBzY2VuYXJpbyk6XG4gICAgICAgIHZhciBteUN1c3RvbWVyID0ge1xuICAgICAgICAgIGN1c3RvbWVyaWQ6IDIzNDYyMjMsXG4gICAgICAgICAgbGFzdG5hbWU6ICdEb2UnLFxuICAgICAgICAgIGZpcnN0bmFtZTogJ0pvaG4nXG4gICAgICAgIH07XG4gICAgICAgIG15Q3VzdG9tZXJTdG9yZS5wdXQobXlDdXN0b21lciwgbXlTdWNjZXNzSGFuZGxlciwgbXlFcnJvckhhbmRsZXIpO1xuICAgICAgICAvLyBOb3RlIHRoYXQgcGFzc2luZyBzdWNjZXNzLSBhbmQgZXJyb3ItaGFuZGxlcnMgaXMgb3B0aW9uYWwuXG4gICAgICogQGV4YW1wbGVcbiAgICAgICAgLy8gU3RvcmluZyBhbiBvYmplY3QsIHVzaW5nIG91dC1vZi1saW5lIGtleXM6XG4gICAgICAgdmFyIG15Q3VzdG9tZXIgPSB7XG4gICAgICAgICBsYXN0bmFtZTogJ0RvZScsXG4gICAgICAgICBmaXJzdG5hbWU6ICdKb2huJ1xuICAgICAgIH07XG4gICAgICAgbXlDdXN0b21lclN0b3JlLnB1dCgyMzQ2MjIzLCBteUN1c3RvbWVyLCBteVN1Y2Nlc3NIYW5kbGVyLCBteUVycm9ySGFuZGxlcik7XG4gICAgICAvLyBOb3RlIHRoYXQgcGFzc2luZyBzdWNjZXNzLSBhbmQgZXJyb3ItaGFuZGxlcnMgaXMgb3B0aW9uYWwuXG4gICAgICovXG4gICAgIHB1dDogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgIGlmICh0aGlzLmtleVBhdGggIT09IG51bGwpIHtcbiAgICAgICAgICAgdmFsdWUgPSBrZXk7XG4gICAgICAgICB9XG5cbiAgICAgICAgIHZhciBoYXNTdWNjZXNzID0gZmFsc2UsXG4gICAgICAgICAgICAgcmVzdWx0ID0gbnVsbCxcbiAgICAgICAgICAgICBwdXRSZXF1ZXN0O1xuXG4gICAgICAgICB2YXIgcHV0VHJhbnNhY3Rpb24gPSB0aGlzLmRiLnRyYW5zYWN0aW9uKFt0aGlzLnN0b3JlTmFtZV0sIHRoaXMuY29uc3RzLlJFQURfV1JJVEUpO1xuICAgICAgICAgcHV0VHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gaGFzU3VjY2VzcyA/IGRvbmUgOiByZWplY3Q7XG4gICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICB9O1xuICAgICAgICAgcHV0VHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgICAgICAgIHB1dFRyYW5zYWN0aW9uLm9uZXJyb3IgPSByZWplY3Q7XG5cbiAgICAgICAgIGlmICh0aGlzLmtleVBhdGggIT09IG51bGwpIHsgLy8gaW4tbGluZSBrZXlzXG4gICAgICAgICAgIHRoaXMuX2FkZElkUHJvcGVydHlJZk5lZWRlZCh2YWx1ZSk7XG4gICAgICAgICAgIHB1dFJlcXVlc3QgPSBwdXRUcmFuc2FjdGlvbi5vYmplY3RTdG9yZSh0aGlzLnN0b3JlTmFtZSkucHV0KHZhbHVlKTtcbiAgICAgICAgIH0gZWxzZSB7IC8vIG91dC1vZi1saW5lIGtleXNcbiAgICAgICAgICAgcHV0UmVxdWVzdCA9IHB1dFRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKS5wdXQodmFsdWUsIGtleSk7XG4gICAgICAgICB9XG4gICAgICAgICBwdXRSZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICBoYXNTdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgICAgcmVzdWx0ID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgIH07XG5cbiAgICAgICAgIHB1dFJlcXVlc3Qub25lcnJvciA9IHJlamVjdDtcbiAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmVzIGFuIG9iamVjdCBmcm9tIHRoZSBzdG9yZS4gSWYgbm8gZW50cnkgZXhpc3RzIHdpdGggdGhlIGdpdmVuIGlkLFxuICAgICAqIHRoZSBzdWNjZXNzIGhhbmRsZXIgd2lsbCBiZSBjYWxsZWQgd2l0aCBudWxsIGFzIGZpcnN0IGFuZCBvbmx5IGFyZ3VtZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSBrZXkgVGhlIGlkIG9mIHRoZSBvYmplY3QgdG8gZmV0Y2guXG4gICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICovXG4gICAgZ2V0OiBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgdmFyIGhhc1N1Y2Nlc3MgPSBmYWxzZSxcbiAgICAgICAgICAgIHJlc3VsdCA9IG51bGw7XG5cbiAgICAgICAgdmFyIGdldFRyYW5zYWN0aW9uID0gdGhpcy5kYi50cmFuc2FjdGlvbihbdGhpcy5zdG9yZU5hbWVdLCB0aGlzLmNvbnN0cy5SRUFEX09OTFkpO1xuICAgICAgICBnZXRUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGhhc1N1Y2Nlc3MgPyBkb25lIDogcmVqZWN0O1xuICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICAgIGdldFRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gICAgICAgIGdldFRyYW5zYWN0aW9uLm9uZXJyb3IgPSByZWplY3Q7XG4gICAgICAgIHZhciBnZXRSZXF1ZXN0ID0gZ2V0VHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUodGhpcy5zdG9yZU5hbWUpLmdldChrZXkpO1xuICAgICAgICBnZXRSZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgIGhhc1N1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICAgIHJlc3VsdCA9IGV2ZW50LnRhcmdldC5yZXN1bHQ7XG4gICAgICAgIH07XG4gICAgICAgIGdldFJlcXVlc3Qub25lcnJvciA9IHJlamVjdDtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFuIG9iamVjdCBmcm9tIHRoZSBzdG9yZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0ga2V5IFRoZSBpZCBvZiB0aGUgb2JqZWN0IHRvIHJlbW92ZS5cbiAgICAgKiBAcmV0dXJucyB7SURCVHJhbnNhY3Rpb259IFRoZSB0cmFuc2FjdGlvbiB1c2VkIGZvciB0aGlzIG9wZXJhdGlvbi5cbiAgICAgKi9cbiAgICByZW1vdmU6IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihkb25lLCByZWplY3Qpe1xuICAgICAgICB2YXIgaGFzU3VjY2VzcyA9IGZhbHNlLFxuICAgICAgICAgICAgcmVzdWx0ID0gbnVsbDtcblxuICAgICAgICB2YXIgcmVtb3ZlVHJhbnNhY3Rpb24gPSB0aGlzLmRiLnRyYW5zYWN0aW9uKFt0aGlzLnN0b3JlTmFtZV0sIHRoaXMuY29uc3RzLlJFQURfV1JJVEUpO1xuICAgICAgICByZW1vdmVUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGhhc1N1Y2Nlc3MgPyBkb25lIDogcmVqZWN0O1xuICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICAgIHJlbW92ZVRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gICAgICAgIHJlbW92ZVRyYW5zYWN0aW9uLm9uZXJyb3IgPSByZWplY3Q7XG5cbiAgICAgICAgdmFyIGRlbGV0ZVJlcXVlc3QgPSByZW1vdmVUcmFuc2FjdGlvbi5vYmplY3RTdG9yZSh0aGlzLnN0b3JlTmFtZSlbJ2RlbGV0ZSddKGtleSk7XG4gICAgICAgIGRlbGV0ZVJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgcmVzdWx0ID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgfTtcbiAgICAgICAgZGVsZXRlUmVxdWVzdC5vbmVycm9yID0gcmVqZWN0O1xuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUnVucyBhIGJhdGNoIG9mIHB1dCBhbmQvb3IgcmVtb3ZlIG9wZXJhdGlvbnMgb24gdGhlIHN0b3JlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGF0YUFycmF5IEFuIGFycmF5IG9mIG9iamVjdHMgY29udGFpbmluZyB0aGUgb3BlcmF0aW9uIHRvIHJ1blxuICAgICAqICBhbmQgdGhlIGRhdGEgb2JqZWN0IChmb3IgcHV0IG9wZXJhdGlvbnMpLlxuICAgICAqIEByZXR1cm5zIHtJREJUcmFuc2FjdGlvbn0gVGhlIHRyYW5zYWN0aW9uIHVzZWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuICAgICAqL1xuICAgIGJhdGNoOiBmdW5jdGlvbiAoZGF0YUFycmF5KSB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgaWYoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFBcnJheSkgIT0gJ1tvYmplY3QgQXJyYXldJyl7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignZGF0YUFycmF5IGFyZ3VtZW50IG11c3QgYmUgb2YgdHlwZSBBcnJheS4nKSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGJhdGNoVHJhbnNhY3Rpb24gPSB0aGlzLmRiLnRyYW5zYWN0aW9uKFt0aGlzLnN0b3JlTmFtZV0gLCB0aGlzLmNvbnN0cy5SRUFEX1dSSVRFKTtcbiAgICAgICAgYmF0Y2hUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGhhc1N1Y2Nlc3MgPyBkb25lIDogcmVqZWN0O1xuICAgICAgICAgIGNhbGxiYWNrKGhhc1N1Y2Nlc3MpO1xuICAgICAgICB9O1xuICAgICAgICBiYXRjaFRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gICAgICAgIGJhdGNoVHJhbnNhY3Rpb24ub25lcnJvciA9IHJlamVjdDtcblxuICAgICAgICB2YXIgY291bnQgPSBkYXRhQXJyYXkubGVuZ3RoO1xuICAgICAgICB2YXIgY2FsbGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBoYXNTdWNjZXNzID0gZmFsc2U7XG5cbiAgICAgICAgdmFyIG9uSXRlbVN1Y2Nlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICBpZiAoY291bnQgPT09IDAgJiYgIWNhbGxlZCkge1xuICAgICAgICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGhhc1N1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkYXRhQXJyYXkuZm9yRWFjaChmdW5jdGlvbiAob3BlcmF0aW9uKSB7XG4gICAgICAgICAgdmFyIHR5cGUgPSBvcGVyYXRpb24udHlwZTtcbiAgICAgICAgICB2YXIga2V5ID0gb3BlcmF0aW9uLmtleTtcbiAgICAgICAgICB2YXIgdmFsdWUgPSBvcGVyYXRpb24udmFsdWU7XG5cbiAgICAgICAgICB2YXIgb25JdGVtRXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBiYXRjaFRyYW5zYWN0aW9uLmFib3J0KCk7XG4gICAgICAgICAgICBpZiAoIWNhbGxlZCkge1xuICAgICAgICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICByZWplY3QoZXJyLCB0eXBlLCBrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBpZiAodHlwZSA9PSAncmVtb3ZlJykge1xuICAgICAgICAgICAgdmFyIGRlbGV0ZVJlcXVlc3QgPSBiYXRjaFRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKVsnZGVsZXRlJ10oa2V5KTtcbiAgICAgICAgICAgIGRlbGV0ZVJlcXVlc3Qub25zdWNjZXNzID0gb25JdGVtU3VjY2VzcztcbiAgICAgICAgICAgIGRlbGV0ZVJlcXVlc3Qub25lcnJvciA9IG9uSXRlbUVycm9yO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PSAncHV0Jykge1xuICAgICAgICAgICAgdmFyIHB1dFJlcXVlc3Q7XG4gICAgICAgICAgICBpZiAodGhpcy5rZXlQYXRoICE9PSBudWxsKSB7IC8vIGluLWxpbmUga2V5c1xuICAgICAgICAgICAgICB0aGlzLl9hZGRJZFByb3BlcnR5SWZOZWVkZWQodmFsdWUpO1xuICAgICAgICAgICAgICBwdXRSZXF1ZXN0ID0gYmF0Y2hUcmFuc2FjdGlvbi5vYmplY3RTdG9yZSh0aGlzLnN0b3JlTmFtZSkucHV0KHZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIG91dC1vZi1saW5lIGtleXNcbiAgICAgICAgICAgICAgcHV0UmVxdWVzdCA9IGJhdGNoVHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUodGhpcy5zdG9yZU5hbWUpLnB1dCh2YWx1ZSwga2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHB1dFJlcXVlc3Qub25zdWNjZXNzID0gb25JdGVtU3VjY2VzcztcbiAgICAgICAgICAgIHB1dFJlcXVlc3Qub25lcnJvciA9IG9uSXRlbUVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBUYWtlcyBhbiBhcnJheSBvZiBvYmplY3RzIGFuZCBzdG9yZXMgdGhlbSBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRhdGFBcnJheSBBbiBhcnJheSBvZiBvYmplY3RzIHRvIHN0b3JlXG4gICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICovXG4gICAgcHV0QmF0Y2g6IGZ1bmN0aW9uIChkYXRhQXJyYXkpIHtcbiAgICAgIHZhciBiYXRjaERhdGEgPSBkYXRhQXJyYXkubWFwKGZ1bmN0aW9uKGl0ZW0pe1xuICAgICAgICByZXR1cm4geyB0eXBlOiAncHV0JywgdmFsdWU6IGl0ZW0gfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gdGhpcy5iYXRjaChiYXRjaERhdGEpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBUYWtlcyBhbiBhcnJheSBvZiBrZXlzIGFuZCByZW1vdmVzIG1hdGNoaW5nIG9iamVjdHMgaW4gYSBzaW5nbGVcbiAgICAgKiB0cmFuc2FjdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGtleUFycmF5IEFuIGFycmF5IG9mIGtleXMgdG8gcmVtb3ZlXG4gICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICovXG4gICAgcmVtb3ZlQmF0Y2g6IGZ1bmN0aW9uIChrZXlBcnJheSkge1xuICAgICAgdmFyIGJhdGNoRGF0YSA9IGtleUFycmF5Lm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICByZXR1cm4geyB0eXBlOiAncmVtb3ZlJywga2V5OiBrZXkgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gdGhpcy5iYXRjaChiYXRjaERhdGEpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBUYWtlcyBhbiBhcnJheSBvZiBrZXlzIGFuZCBmZXRjaGVzIG1hdGNoaW5nIG9iamVjdHNcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGtleUFycmF5IEFuIGFycmF5IG9mIGtleXMgaWRlbnRpZnlpbmcgdGhlIG9iamVjdHMgdG8gZmV0Y2hcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW2FycmF5VHlwZT0nc3BhcnNlJ10gVGhlIHR5cGUgb2YgYXJyYXkgdG8gcGFzcyB0byB0aGVcbiAgICAgKiAgc3VjY2VzcyBoYW5kbGVyLiBNYXkgYmUgb25lIG9mICdzcGFyc2UnLCAnZGVuc2UnIG9yICdza2lwJy4gRGVmYXVsdHMgdG9cbiAgICAgKiAgJ3NwYXJzZScuIFRoaXMgcGFyYW1ldGVyIHNwZWNpZmllcyBob3cgdG8gaGFuZGxlIHRoZSBzaXR1YXRpb24gaWYgYSBnZXRcbiAgICAgKiAgb3BlcmF0aW9uIGRpZCBub3QgdGhyb3cgYW4gZXJyb3IsIGJ1dCB0aGVyZSB3YXMgbm8gbWF0Y2hpbmcgb2JqZWN0IGluXG4gICAgICogIHRoZSBkYXRhYmFzZS4gSW4gbW9zdCBjYXNlcywgJ3NwYXJzZScgcHJvdmlkZXMgdGhlIG1vc3QgZGVzaXJlZFxuICAgICAqICBiZWhhdmlvci4gU2VlIHRoZSBleGFtcGxlcyBmb3IgZGV0YWlscy5cbiAgICAgKiBAcmV0dXJucyB7SURCVHJhbnNhY3Rpb259IFRoZSB0cmFuc2FjdGlvbiB1c2VkIGZvciB0aGlzIG9wZXJhdGlvbi5cbiAgICAgKiBAZXhhbXBsZVxuICAgICAvLyBnaXZlbiB0aGF0IHRoZXJlIGFyZSB0d28gb2JqZWN0cyBpbiB0aGUgZGF0YWJhc2Ugd2l0aCB0aGUga2V5cGF0aFxuICAgICAvLyB2YWx1ZXMgMSBhbmQgMiwgYW5kIHRoZSBjYWxsIGxvb2tzIGxpa2UgdGhpczpcbiAgICAgbXlTdG9yZS5nZXRCYXRjaChbMSwgNSwgMl0sIHJlamVjdCwgZnVuY3Rpb24gKGRhdGEpIHsg4oCmIH0sIGFycmF5VHlwZSk7XG5cbiAgICAgLy8gdGhpcyBpcyB3aGF0IHRoZSBgZGF0YWAgYXJyYXkgd2lsbCBiZSBsaWtlOlxuXG4gICAgIC8vIGFycmF5VHlwZSA9PSAnc3BhcnNlJzpcbiAgICAgLy8gZGF0YSBpcyBhIHNwYXJzZSBhcnJheSBjb250YWluaW5nIHR3byBlbnRyaWVzIGFuZCBoYXZpbmcgYSBsZW5ndGggb2YgMzpcbiAgICAgICBbT2JqZWN0LCAyOiBPYmplY3RdXG4gICAgICAgICAwOiBPYmplY3RcbiAgICAgICAgIDI6IE9iamVjdFxuICAgICAgICAgbGVuZ3RoOiAzXG4gICAgICAgICBfX3Byb3RvX186IEFycmF5WzBdXG4gICAgIC8vIGNhbGxpbmcgZm9yRWFjaCBvbiBkYXRhIHdpbGwgcmVzdWx0IGluIHRoZSBjYWxsYmFjayBiZWluZyBjYWxsZWQgdHdvXG4gICAgIC8vIHRpbWVzLCB3aXRoIHRoZSBpbmRleCBwYXJhbWV0ZXIgbWF0Y2hpbmcgdGhlIGluZGV4IG9mIHRoZSBrZXkgaW4gdGhlXG4gICAgIC8vIGtleUFycmF5LlxuXG4gICAgIC8vIGFycmF5VHlwZSA9PSAnZGVuc2UnOlxuICAgICAvLyBkYXRhIGlzIGEgZGVuc2UgYXJyYXkgY29udGFpbmluZyB0aHJlZSBlbnRyaWVzIGFuZCBoYXZpbmcgYSBsZW5ndGggb2YgMyxcbiAgICAgLy8gd2hlcmUgZGF0YVsxXSBpcyBvZiB0eXBlIHVuZGVmaW5lZDpcbiAgICAgICBbT2JqZWN0LCB1bmRlZmluZWQsIE9iamVjdF1cbiAgICAgICAgIDA6IE9iamVjdFxuICAgICAgICAgMTogdW5kZWZpbmVkXG4gICAgICAgICAyOiBPYmplY3RcbiAgICAgICAgIGxlbmd0aDogM1xuICAgICAgICAgX19wcm90b19fOiBBcnJheVswXVxuICAgICAvLyBjYWxsaW5nIGZvckVhY2ggb24gZGF0YSB3aWxsIHJlc3VsdCBpbiB0aGUgY2FsbGJhY2sgYmVpbmcgY2FsbGVkIHRocmVlXG4gICAgIC8vIHRpbWVzLCB3aXRoIHRoZSBpbmRleCBwYXJhbWV0ZXIgbWF0Y2hpbmcgdGhlIGluZGV4IG9mIHRoZSBrZXkgaW4gdGhlXG4gICAgIC8vIGtleUFycmF5LCBidXQgdGhlIHNlY29uZCBjYWxsIHdpbGwgaGF2ZSB1bmRlZmluZWQgYXMgZmlyc3QgYXJndW1lbnQuXG5cbiAgICAgLy8gYXJyYXlUeXBlID09ICdza2lwJzpcbiAgICAgLy8gZGF0YSBpcyBhIGRlbnNlIGFycmF5IGNvbnRhaW5pbmcgdHdvIGVudHJpZXMgYW5kIGhhdmluZyBhIGxlbmd0aCBvZiAyOlxuICAgICAgIFtPYmplY3QsIE9iamVjdF1cbiAgICAgICAgIDA6IE9iamVjdFxuICAgICAgICAgMTogT2JqZWN0XG4gICAgICAgICBsZW5ndGg6IDJcbiAgICAgICAgIF9fcHJvdG9fXzogQXJyYXlbMF1cbiAgICAgLy8gY2FsbGluZyBmb3JFYWNoIG9uIGRhdGEgd2lsbCByZXN1bHQgaW4gdGhlIGNhbGxiYWNrIGJlaW5nIGNhbGxlZCB0d29cbiAgICAgLy8gdGltZXMsIHdpdGggdGhlIGluZGV4IHBhcmFtZXRlciBub3QgbWF0Y2hpbmcgdGhlIGluZGV4IG9mIHRoZSBrZXkgaW4gdGhlXG4gICAgIC8vIGtleUFycmF5LlxuICAgICAqL1xuXG4gICAgZ2V0QmF0Y2g6IGZ1bmN0aW9uIChrZXlBcnJheSwgYXJyYXlUeXBlKSB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgYXJyYXlUeXBlIHx8IChhcnJheVR5cGUgPSAnc3BhcnNlJyk7XG5cbiAgICAgICAgaWYoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGtleUFycmF5KSAhPSAnW29iamVjdCBBcnJheV0nKXtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdrZXlBcnJheSBhcmd1bWVudCBtdXN0IGJlIG9mIHR5cGUgQXJyYXkuJykpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBiYXRjaFRyYW5zYWN0aW9uID0gdGhpcy5kYi50cmFuc2FjdGlvbihbdGhpcy5zdG9yZU5hbWVdICwgdGhpcy5jb25zdHMuUkVBRF9PTkxZKTtcbiAgICAgICAgYmF0Y2hUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGhhc1N1Y2Nlc3MgPyBkb25lIDogcmVqZWN0O1xuICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICAgIGJhdGNoVHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgICAgICAgYmF0Y2hUcmFuc2FjdGlvbi5vbmVycm9yID0gcmVqZWN0O1xuXG4gICAgICAgIHZhciBkYXRhID0gW107XG4gICAgICAgIHZhciBjb3VudCA9IGtleUFycmF5Lmxlbmd0aDtcbiAgICAgICAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgaGFzU3VjY2VzcyA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVzdWx0ID0gbnVsbDtcblxuICAgICAgICB2YXIgb25JdGVtU3VjY2VzcyA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgIGlmIChldmVudC50YXJnZXQucmVzdWx0IHx8IGFycmF5VHlwZSA9PSAnZGVuc2UnKSB7XG4gICAgICAgICAgICBkYXRhLnB1c2goZXZlbnQudGFyZ2V0LnJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChhcnJheVR5cGUgPT0gJ3NwYXJzZScpIHtcbiAgICAgICAgICAgIGRhdGEubGVuZ3RoKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvdW50LS07XG4gICAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgICByZXN1bHQgPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBrZXlBcnJheS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcblxuICAgICAgICAgIHZhciBvbkl0ZW1FcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxlZCA9IHRydWU7XG4gICAgICAgICAgICByZXN1bHQgPSBlcnI7XG4gICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgIGJhdGNoVHJhbnNhY3Rpb24uYWJvcnQoKTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdmFyIGdldFJlcXVlc3QgPSBiYXRjaFRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKS5nZXQoa2V5KTtcbiAgICAgICAgICBnZXRSZXF1ZXN0Lm9uc3VjY2VzcyA9IG9uSXRlbVN1Y2Nlc3M7XG4gICAgICAgICAgZ2V0UmVxdWVzdC5vbmVycm9yID0gb25JdGVtRXJyb3I7XG5cbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBGZXRjaGVzIGFsbCBlbnRyaWVzIGluIHRoZSBzdG9yZS5cbiAgICAgKiBAcmV0dXJucyB7SURCVHJhbnNhY3Rpb259IFRoZSB0cmFuc2FjdGlvbiB1c2VkIGZvciB0aGlzIG9wZXJhdGlvbi5cbiAgICAgKi9cbiAgICBnZXRBbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBnZXRBbGxUcmFuc2FjdGlvbiA9IHRoaXMuZGIudHJhbnNhY3Rpb24oW3RoaXMuc3RvcmVOYW1lXSwgdGhpcy5jb25zdHMuUkVBRF9PTkxZKTtcbiAgICAgIHZhciBzdG9yZSA9IGdldEFsbFRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKTtcbiAgICAgIGlmIChzdG9yZS5nZXRBbGwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbE5hdGl2ZShnZXRBbGxUcmFuc2FjdGlvbiwgc3RvcmUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbEN1cnNvcihnZXRBbGxUcmFuc2FjdGlvbiwgc3RvcmUpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBJbXBsZW1lbnRzIGdldEFsbCBmb3IgSURCIGltcGxlbWVudGF0aW9ucyB0aGF0IGhhdmUgYSBub24tc3RhbmRhcmRcbiAgICAgKiBnZXRBbGwoKSBtZXRob2QuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZ2V0QWxsVHJhbnNhY3Rpb24gQW4gb3BlbiBSRUFEIHRyYW5zYWN0aW9uLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdG9yZSBBIHJlZmVyZW5jZSB0byB0aGUgc3RvcmUuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZ2V0QWxsTmF0aXZlOiBmdW5jdGlvbiAoZ2V0QWxsVHJhbnNhY3Rpb24sIHN0b3JlKSB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgdmFyIGhhc1N1Y2Nlc3MgPSBmYWxzZSxcbiAgICAgICAgICAgIHJlc3VsdCA9IG51bGw7XG5cbiAgICAgICAgZ2V0QWxsVHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBoYXNTdWNjZXNzID8gZG9uZSA6IHJlamVjdDtcbiAgICAgICAgICBjYWxsYmFjayhyZXN1bHQpO1xuICAgICAgICB9O1xuICAgICAgICBnZXRBbGxUcmFuc2FjdGlvbi5vbmFib3J0ID0gcmVqZWN0O1xuICAgICAgICBnZXRBbGxUcmFuc2FjdGlvbi5vbmVycm9yID0gcmVqZWN0O1xuXG4gICAgICAgIHZhciBnZXRBbGxSZXF1ZXN0ID0gc3RvcmUuZ2V0QWxsKCk7XG4gICAgICAgIGdldEFsbFJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgcmVzdWx0ID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgfTtcbiAgICAgICAgZ2V0QWxsUmVxdWVzdC5vbmVycm9yID0gcmVqZWN0O1xuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW1wbGVtZW50cyBnZXRBbGwgZm9yIElEQiBpbXBsZW1lbnRhdGlvbnMgdGhhdCBkbyBub3QgaGF2ZSBhIGdldEFsbCgpXG4gICAgICogbWV0aG9kLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGdldEFsbFRyYW5zYWN0aW9uIEFuIG9wZW4gUkVBRCB0cmFuc2FjdGlvbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3RvcmUgQSByZWZlcmVuY2UgdG8gdGhlIHN0b3JlLlxuICAgICAqICBlcnJvciBvY2N1cnJlZCBkdXJpbmcgdGhlIG9wZXJhdGlvbi5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9nZXRBbGxDdXJzb3I6IGZ1bmN0aW9uIChnZXRBbGxUcmFuc2FjdGlvbiwgc3RvcmUpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihkb25lLCByZWplY3Qpe1xuICAgICAgICB2YXIgYWxsID0gW10sXG4gICAgICAgICAgICBoYXNTdWNjZXNzID0gZmFsc2UsXG4gICAgICAgICAgICByZXN1bHQgPSBudWxsO1xuXG4gICAgICAgIGdldEFsbFRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIGNhbGxiYWNrID0gaGFzU3VjY2VzcyA/IGRvbmUgOiByZWplY3Q7XG4gICAgICAgICAgY2FsbGJhY2socmVzdWx0KTtcbiAgICAgICAgfTtcbiAgICAgICAgZ2V0QWxsVHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgICAgICAgZ2V0QWxsVHJhbnNhY3Rpb24ub25lcnJvciA9IHJlamVjdDtcblxuICAgICAgICB2YXIgY3Vyc29yUmVxdWVzdCA9IHN0b3JlLm9wZW5DdXJzb3IoKTtcbiAgICAgICAgY3Vyc29yUmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICB2YXIgY3Vyc29yID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgICBpZiAoY3Vyc29yKSB7XG4gICAgICAgICAgICBhbGwucHVzaChjdXJzb3IudmFsdWUpO1xuICAgICAgICAgICAgY3Vyc29yWydjb250aW51ZSddKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgICByZXN1bHQgPSBhbGw7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBjdXJzb3JSZXF1ZXN0LnJlamVjdCA9IHJlamVjdDtcbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENsZWFycyB0aGUgc3RvcmUsIGkuZS4gZGVsZXRlcyBhbGwgZW50cmllcyBpbiB0aGUgc3RvcmUuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7SURCVHJhbnNhY3Rpb259IFRoZSB0cmFuc2FjdGlvbiB1c2VkIGZvciB0aGlzIG9wZXJhdGlvbi5cbiAgICAgKi9cbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKGRvbmUsIHJlamVjdCl7XG4gICAgICAgIHZhciBoYXNTdWNjZXNzID0gZmFsc2UsXG4gICAgICAgICAgICByZXN1bHQgPSBudWxsO1xuXG4gICAgICAgIHZhciBjbGVhclRyYW5zYWN0aW9uID0gdGhpcy5kYi50cmFuc2FjdGlvbihbdGhpcy5zdG9yZU5hbWVdLCB0aGlzLmNvbnN0cy5SRUFEX1dSSVRFKTtcbiAgICAgICAgY2xlYXJUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGhhc1N1Y2Nlc3MgPyBkb25lIDogcmVqZWN0O1xuICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICAgIGNsZWFyVHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgICAgICAgY2xlYXJUcmFuc2FjdGlvbi5vbmVycm9yID0gcmVqZWN0O1xuXG4gICAgICAgIHZhciBjbGVhclJlcXVlc3QgPSBjbGVhclRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKS5jbGVhcigpO1xuICAgICAgICBjbGVhclJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgcmVzdWx0ID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgfTtcbiAgICAgICAgY2xlYXJSZXF1ZXN0Lm9uZXJyb3IgPSByZWplY3Q7XG4gICAgICB9LmJpbmQodGhpcykpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgaWYgYW4gaWQgcHJvcGVydHkgbmVlZHMgdG8gcHJlc2VudCBvbiBhIG9iamVjdCBhbmQgYWRkcyBvbmUgaWZcbiAgICAgKiBuZWNlc3NhcnkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGF0YU9iaiBUaGUgZGF0YSBvYmplY3QgdGhhdCBpcyBhYm91dCB0byBiZSBzdG9yZWRcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIF9hZGRJZFByb3BlcnR5SWZOZWVkZWQ6IGZ1bmN0aW9uIChkYXRhT2JqKSB7XG4gICAgICBpZiAoIXRoaXMuZmVhdHVyZXMuaGFzQXV0b0luY3JlbWVudCAmJiB0eXBlb2YgZGF0YU9ialt0aGlzLmtleVBhdGhdID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRhdGFPYmpbdGhpcy5rZXlQYXRoXSA9IHRoaXMuX2luc2VydElkQ291bnQrKyArIERhdGUubm93KCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8qKioqKioqKioqKipcbiAgICAgKiBpbmRleGluZyAqXG4gICAgICoqKioqKioqKioqKi9cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBET01TdHJpbmdMaXN0IG9mIGluZGV4IG5hbWVzIG9mIHRoZSBzdG9yZS5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0RPTVN0cmluZ0xpc3R9IFRoZSBsaXN0IG9mIGluZGV4IG5hbWVzXG4gICAgICovXG4gICAgZ2V0SW5kZXhMaXN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcy5zdG9yZS5pbmRleE5hbWVzO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgaWYgYW4gaW5kZXggd2l0aCB0aGUgZ2l2ZW4gbmFtZSBleGlzdHMgaW4gdGhlIHN0b3JlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGV4TmFtZSBUaGUgbmFtZSBvZiB0aGUgaW5kZXggdG8gbG9vayBmb3JcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSBXaGV0aGVyIHRoZSBzdG9yZSBjb250YWlucyBhbiBpbmRleCB3aXRoIHRoZSBnaXZlbiBuYW1lXG4gICAgICovXG4gICAgaGFzSW5kZXg6IGZ1bmN0aW9uIChpbmRleE5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLnN0b3JlLmluZGV4TmFtZXMuY29udGFpbnMoaW5kZXhOYW1lKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTm9ybWFsaXplcyBhbiBvYmplY3QgY29udGFpbmluZyBpbmRleCBkYXRhIGFuZCBhc3N1cmVzIHRoYXQgYWxsXG4gICAgICogcHJvcGVydGllcyBhcmUgc2V0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGluZGV4RGF0YSBUaGUgaW5kZXggZGF0YSBvYmplY3QgdG8gbm9ybWFsaXplXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGV4RGF0YS5uYW1lIFRoZSBuYW1lIG9mIHRoZSBpbmRleFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbaW5kZXhEYXRhLmtleVBhdGhdIFRoZSBrZXkgcGF0aCBvZiB0aGUgaW5kZXhcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpbmRleERhdGEudW5pcXVlXSBXaGV0aGVyIHRoZSBpbmRleCBpcyB1bmlxdWVcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtpbmRleERhdGEubXVsdGlFbnRyeV0gV2hldGhlciB0aGUgaW5kZXggaXMgbXVsdGkgZW50cnlcbiAgICAgKi9cbiAgICBub3JtYWxpemVJbmRleERhdGE6IGZ1bmN0aW9uIChpbmRleERhdGEpIHtcbiAgICAgIGluZGV4RGF0YS5rZXlQYXRoID0gaW5kZXhEYXRhLmtleVBhdGggfHwgaW5kZXhEYXRhLm5hbWU7XG4gICAgICBpbmRleERhdGEudW5pcXVlID0gISFpbmRleERhdGEudW5pcXVlO1xuICAgICAgaW5kZXhEYXRhLm11bHRpRW50cnkgPSAhIWluZGV4RGF0YS5tdWx0aUVudHJ5O1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgaWYgYW4gYWN0dWFsIGluZGV4IGNvbXBsaWVzIHdpdGggYW4gZXhwZWN0ZWQgaW5kZXguXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gYWN0dWFsIFRoZSBhY3R1YWwgaW5kZXggZm91bmQgaW4gdGhlIHN0b3JlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGV4cGVjdGVkIEFuIE9iamVjdCBkZXNjcmliaW5nIGFuIGV4cGVjdGVkIGluZGV4XG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gV2hldGhlciBib3RoIGluZGV4IGRlZmluaXRpb25zIGFyZSBpZGVudGljYWxcbiAgICAgKi9cbiAgICBpbmRleENvbXBsaWVzOiBmdW5jdGlvbiAoYWN0dWFsLCBleHBlY3RlZCkge1xuICAgICAgdmFyIGNvbXBsaWVzID0gWydrZXlQYXRoJywgJ3VuaXF1ZScsICdtdWx0aUVudHJ5J10uZXZlcnkoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAvLyBJRTEwIHJldHVybnMgdW5kZWZpbmVkIGZvciBubyBtdWx0aUVudHJ5XG4gICAgICAgIGlmIChrZXkgPT0gJ211bHRpRW50cnknICYmIGFjdHVhbFtrZXldID09PSB1bmRlZmluZWQgJiYgZXhwZWN0ZWRba2V5XSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDb21wb3VuZCBrZXlzXG4gICAgICAgIGlmIChrZXkgPT0gJ2tleVBhdGgnICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChleHBlY3RlZFtrZXldKSA9PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgICAgICAgdmFyIGV4cCA9IGV4cGVjdGVkLmtleVBhdGg7XG4gICAgICAgICAgdmFyIGFjdCA9IGFjdHVhbC5rZXlQYXRoO1xuXG4gICAgICAgICAgLy8gSUUxMCBjYW4ndCBoYW5kbGUga2V5UGF0aCBzZXF1ZW5jZXMgYW5kIHN0b3JlcyB0aGVtIGFzIGEgc3RyaW5nLlxuICAgICAgICAgIC8vIFRoZSBpbmRleCB3aWxsIGJlIHVudXNhYmxlIHRoZXJlLCBidXQgbGV0J3Mgc3RpbGwgcmV0dXJuIHRydWUgaWZcbiAgICAgICAgICAvLyB0aGUga2V5UGF0aCBzZXF1ZW5jZSBtYXRjaGVzLlxuICAgICAgICAgIGlmICh0eXBlb2YgYWN0ID09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gZXhwLnRvU3RyaW5nKCkgPT0gYWN0O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIENocm9tZS9PcGVyYSBzdG9yZXMga2V5UGF0aCBzcXVlbmNlcyBhcyBET01TdHJpbmdMaXN0LCBGaXJlZm94XG4gICAgICAgICAgLy8gYXMgQXJyYXlcbiAgICAgICAgICBpZiAoICEgKHR5cGVvZiBhY3QuY29udGFpbnMgPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgYWN0LmluZGV4T2YgPT0gJ2Z1bmN0aW9uJykgKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGFjdC5sZW5ndGggIT09IGV4cC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbSA9IGV4cC5sZW5ndGg7IGk8bTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoICEgKCAoYWN0LmNvbnRhaW5zICYmIGFjdC5jb250YWlucyhleHBbaV0pKSB8fCBhY3QuaW5kZXhPZihleHBbaV0gIT09IC0xKSApKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGV4cGVjdGVkW2tleV0gPT0gYWN0dWFsW2tleV07XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBjb21wbGllcztcbiAgICB9LFxuXG4gICAgLyoqKioqKioqKipcbiAgICAgKiBjdXJzb3IgKlxuICAgICAqKioqKioqKioqL1xuXG4gICAgLyoqXG4gICAgICogSXRlcmF0ZXMgb3ZlciB0aGUgc3RvcmUgdXNpbmcgdGhlIGdpdmVuIG9wdGlvbnMgYW5kIGNhbGxpbmcgb25JdGVtXG4gICAgICogZm9yIGVhY2ggZW50cnkgbWF0Y2hpbmcgdGhlIG9wdGlvbnMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvbkl0ZW0gQSBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggbWF0Y2hcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFuIG9iamVjdCBkZWZpbmluZyBzcGVjaWZpYyBvcHRpb25zXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLmluZGV4PW51bGxdIEFuIElEQkluZGV4IHRvIG9wZXJhdGUgb25cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMub3JkZXI9QVNDXSBUaGUgb3JkZXIgaW4gd2hpY2ggdG8gcHJvdmlkZSB0aGVcbiAgICAgKiAgcmVzdWx0cywgY2FuIGJlICdERVNDJyBvciAnQVNDJ1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuYXV0b0NvbnRpbnVlPXRydWVdIFdoZXRoZXIgdG8gYXV0b21hdGljYWxseVxuICAgICAqICBpdGVyYXRlIHRoZSBjdXJzb3IgdG8gdGhlIG5leHQgcmVzdWx0XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5maWx0ZXJEdXBsaWNhdGVzPWZhbHNlXSBXaGV0aGVyIHRvIGV4Y2x1ZGVcbiAgICAgKiAgZHVwbGljYXRlIG1hdGNoZXNcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMua2V5UmFuZ2U9bnVsbF0gQW4gSURCS2V5UmFuZ2UgdG8gdXNlXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy53cml0ZUFjY2Vzcz1mYWxzZV0gV2hldGhlciBncmFudCB3cml0ZSBhY2Nlc3NcbiAgICAgKiAgdG8gdGhlIHN0b3JlIGluIHRoZSBvbkl0ZW0gY2FsbGJhY2tcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5vbkVuZD1udWxsXSBBIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBhZnRlclxuICAgICAqICBpdGVyYXRpb24gaGFzIGVuZGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMub25FcnJvcj10aHJvd10gQSBjYWxsYmFjayB0byBiZSBjYWxsZWRcbiAgICAgKiAgaWYgYW4gZXJyb3Igb2NjdXJyZWQgZHVyaW5nIHRoZSBvcGVyYXRpb24uXG4gICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICovXG4gICAgIGl0ZXJhdGU6IGZ1bmN0aW9uIChvbkl0ZW0sIG9wdGlvbnMpIHtcbiAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZG9uZSwgcmVqZWN0KXtcbiAgICAgICAgIG9wdGlvbnMgPSBtaXhpbih7XG4gICAgICAgICAgIGluZGV4OiBudWxsLFxuICAgICAgICAgICBvcmRlcjogJ0FTQycsXG4gICAgICAgICAgIGF1dG9Db250aW51ZTogdHJ1ZSxcbiAgICAgICAgICAgZmlsdGVyRHVwbGljYXRlczogZmFsc2UsXG4gICAgICAgICAgIGtleVJhbmdlOiBudWxsLFxuICAgICAgICAgICB3cml0ZUFjY2VzczogZmFsc2UsXG4gICAgICAgICAgIG9uRW5kOiBudWxsXG4gICAgICAgICB9LCAob3B0aW9ucyB8fCB7fSkpO1xuXG4gICAgICAgICB2YXIgZGlyZWN0aW9uVHlwZSA9IG9wdGlvbnMub3JkZXIudG9Mb3dlckNhc2UoKSA9PSAnZGVzYycgPyAnUFJFVicgOiAnTkVYVCc7XG4gICAgICAgICBpZiAob3B0aW9ucy5maWx0ZXJEdXBsaWNhdGVzKSB7XG4gICAgICAgICAgIGRpcmVjdGlvblR5cGUgKz0gJ19OT19EVVBMSUNBVEUnO1xuICAgICAgICAgfVxuXG4gICAgICAgICB2YXIgaGFzU3VjY2VzcyA9IGZhbHNlO1xuICAgICAgICAgdmFyIGN1cnNvclRyYW5zYWN0aW9uID0gdGhpcy5kYi50cmFuc2FjdGlvbihbdGhpcy5zdG9yZU5hbWVdLCB0aGlzLmNvbnN0c1tvcHRpb25zLndyaXRlQWNjZXNzID8gJ1JFQURfV1JJVEUnIDogJ1JFQURfT05MWSddKTtcbiAgICAgICAgIHZhciBjdXJzb3JUYXJnZXQgPSBjdXJzb3JUcmFuc2FjdGlvbi5vYmplY3RTdG9yZSh0aGlzLnN0b3JlTmFtZSk7XG4gICAgICAgICBpZiAob3B0aW9ucy5pbmRleCkge1xuICAgICAgICAgICBjdXJzb3JUYXJnZXQgPSBjdXJzb3JUYXJnZXQuaW5kZXgob3B0aW9ucy5pbmRleCk7XG4gICAgICAgICB9XG5cbiAgICAgICAgIGN1cnNvclRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgIGlmICghaGFzU3VjY2Vzcykge1xuICAgICAgICAgICAgIHJlamVjdChudWxsKTtcbiAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgIH1cbiAgICAgICAgICAgZG9uZSgpO1xuICAgICAgICAgfTtcbiAgICAgICAgIGN1cnNvclRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gICAgICAgICBjdXJzb3JUcmFuc2FjdGlvbi5vbmVycm9yID0gcmVqZWN0O1xuXG4gICAgICAgICB2YXIgY3Vyc29yUmVxdWVzdCA9IGN1cnNvclRhcmdldC5vcGVuQ3Vyc29yKG9wdGlvbnMua2V5UmFuZ2UsIHRoaXMuY29uc3RzW2RpcmVjdGlvblR5cGVdKTtcbiAgICAgICAgIGN1cnNvclJlcXVlc3Qub25lcnJvciA9IHJlamVjdDtcbiAgICAgICAgIGN1cnNvclJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgIHZhciBjdXJzb3IgPSBldmVudC50YXJnZXQucmVzdWx0O1xuICAgICAgICAgICBpZiAoY3Vyc29yKSB7XG4gICAgICAgICAgICAgb25JdGVtKGN1cnNvci52YWx1ZSwgY3Vyc29yLCBjdXJzb3JUcmFuc2FjdGlvbik7XG4gICAgICAgICAgICAgaWYgKG9wdGlvbnMuYXV0b0NvbnRpbnVlKSB7XG4gICAgICAgICAgICAgICBjdXJzb3JbJ2NvbnRpbnVlJ10oKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgaGFzU3VjY2VzcyA9IHRydWU7XG4gICAgICAgICAgIH1cbiAgICAgICAgIH07XG4gICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICB9LFxuXG4gICAgIC8qKlxuICAgICAgKiBSdW5zIGEgcXVlcnkgYWdhaW5zdCB0aGUgc3RvcmUgYW5kIHBhc3NlcyBhbiBhcnJheSBjb250YWluaW5nIG1hdGNoZWRcbiAgICAgICogb2JqZWN0cyB0byB0aGUgc3VjY2VzcyBoYW5kbGVyLlxuICAgICAgKlxuICAgICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFuIG9iamVjdCBkZWZpbmluZyBzcGVjaWZpYyBxdWVyeSBvcHRpb25zXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5pbmRleD1udWxsXSBBbiBJREJJbmRleCB0byBvcGVyYXRlIG9uXG4gICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbb3B0aW9ucy5vcmRlcj1BU0NdIFRoZSBvcmRlciBpbiB3aGljaCB0byBwcm92aWRlIHRoZVxuICAgICAgKiAgcmVzdWx0cywgY2FuIGJlICdERVNDJyBvciAnQVNDJ1xuICAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmZpbHRlckR1cGxpY2F0ZXM9ZmFsc2VdIFdoZXRoZXIgdG8gZXhjbHVkZVxuICAgICAgKiAgZHVwbGljYXRlIG1hdGNoZXNcbiAgICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLmtleVJhbmdlPW51bGxdIEFuIElEQktleVJhbmdlIHRvIHVzZVxuICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb3B0aW9ucy5yZWplY3Q9dGhyb3ddIEEgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGlmIGFuIGVycm9yXG4gICAgICAqICBvY2N1cnJlZCBkdXJpbmcgdGhlIG9wZXJhdGlvbi5cbiAgICAgICogQHJldHVybnMge0lEQlRyYW5zYWN0aW9ufSBUaGUgdHJhbnNhY3Rpb24gdXNlZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4gICAgICAqL1xuICAgICBxdWVyeTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgICAgcmV0dXJuIHRoaXMuaXRlcmF0ZShmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICAgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgICAgfSwgb3B0aW9ucylcbiAgICAgICAudGhlbihmdW5jdGlvbigpe1xuICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgIH0pO1xuICAgICB9LFxuXG4gICAgIC8qKlxuICAgICAgKlxuICAgICAgKiBSdW5zIGEgcXVlcnkgYWdhaW5zdCB0aGUgc3RvcmUsIGJ1dCBvbmx5IHJldHVybnMgdGhlIG51bWJlciBvZiBtYXRjaGVzXG4gICAgICAqIGluc3RlYWQgb2YgdGhlIG1hdGNoZXMgaXRzZWxmLlxuICAgICAgKlxuICAgICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFuIG9iamVjdCBkZWZpbmluZyBzcGVjaWZpYyBvcHRpb25zXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5pbmRleD1udWxsXSBBbiBJREJJbmRleCB0byBvcGVyYXRlIG9uXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5rZXlSYW5nZT1udWxsXSBBbiBJREJLZXlSYW5nZSB0byB1c2VcbiAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29wdGlvbnMucmVqZWN0PXRocm93XSBBIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBpZiBhbiBlcnJvclxuICAgICAgKiAgb2NjdXJyZWQgZHVyaW5nIHRoZSBvcGVyYXRpb24uXG4gICAgICAqIEByZXR1cm5zIHtJREJUcmFuc2FjdGlvbn0gVGhlIHRyYW5zYWN0aW9uIHVzZWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuICAgICAgKi9cbiAgICAgY291bnQ6IGZ1bmN0aW9uIChkb25lLCBvcHRpb25zKSB7XG5cbiAgICAgICBvcHRpb25zID0gbWl4aW4oe1xuICAgICAgICAgaW5kZXg6IG51bGwsXG4gICAgICAgICBrZXlSYW5nZTogbnVsbFxuICAgICAgIH0sIG9wdGlvbnMgfHwge30pO1xuXG4gICAgICAgdmFyIHJlamVjdCA9IG9wdGlvbnMucmVqZWN0O1xuXG4gICAgICAgdmFyIGhhc1N1Y2Nlc3MgPSBmYWxzZSxcbiAgICAgICAgICAgcmVzdWx0ID0gbnVsbDtcblxuICAgICAgIHZhciBjdXJzb3JUcmFuc2FjdGlvbiA9IHRoaXMuZGIudHJhbnNhY3Rpb24oW3RoaXMuc3RvcmVOYW1lXSwgdGhpcy5jb25zdHMuUkVBRF9PTkxZKTtcbiAgICAgICBjdXJzb3JUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgdmFyIGNhbGxiYWNrID0gaGFzU3VjY2VzcyA/IGRvbmUgOiByZWplY3Q7XG4gICAgICAgICBjYWxsYmFjayhyZXN1bHQpO1xuICAgICAgIH07XG4gICAgICAgY3Vyc29yVHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgICAgICBjdXJzb3JUcmFuc2FjdGlvbi5vbmVycm9yID0gcmVqZWN0O1xuXG4gICAgICAgdmFyIGN1cnNvclRhcmdldCA9IGN1cnNvclRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHRoaXMuc3RvcmVOYW1lKTtcbiAgICAgICBpZiAob3B0aW9ucy5pbmRleCkge1xuICAgICAgICAgY3Vyc29yVGFyZ2V0ID0gY3Vyc29yVGFyZ2V0LmluZGV4KG9wdGlvbnMuaW5kZXgpO1xuICAgICAgIH1cbiAgICAgICB2YXIgY291bnRSZXF1ZXN0ID0gY3Vyc29yVGFyZ2V0LmNvdW50KG9wdGlvbnMua2V5UmFuZ2UpO1xuICAgICAgIGNvdW50UmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICBoYXNTdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgIHJlc3VsdCA9IGV2dC50YXJnZXQucmVzdWx0O1xuICAgICAgIH07XG4gICAgICAgY291bnRSZXF1ZXN0LnJlamVjdCA9IHJlamVjdDtcblxuICAgICAgIHJldHVybiBjdXJzb3JUcmFuc2FjdGlvbjtcbiAgICAgfSxcblxuICAgICAvKioqKioqKioqKioqKiovXG4gICAgIC8qIGtleSByYW5nZXMgKi9cbiAgICAgLyoqKioqKioqKioqKioqL1xuXG4gICAgIC8qKlxuICAgICAgKiBDcmVhdGVzIGEga2V5IHJhbmdlIHVzaW5nIHNwZWNpZmllZCBvcHRpb25zLiBUaGlzIGtleSByYW5nZSBjYW4gYmVcbiAgICAgICogaGFuZGVkIG92ZXIgdG8gdGhlIGNvdW50KCkgYW5kIGl0ZXJhdGUoKSBtZXRob2RzLlxuICAgICAgKlxuICAgICAgKiBOb3RlOiBZb3UgbXVzdCBwcm92aWRlIGF0IGxlYXN0IG9uZSBvciBib3RoIG9mIFwibG93ZXJcIiBvciBcInVwcGVyXCIgdmFsdWUuXG4gICAgICAqXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBvcHRpb25zIGZvciB0aGUga2V5IHJhbmdlIHRvIGNyZWF0ZVxuICAgICAgKiBAcGFyYW0geyp9IFtvcHRpb25zLmxvd2VyXSBUaGUgbG93ZXIgYm91bmRcbiAgICAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5leGNsdWRlTG93ZXJdIFdoZXRoZXIgdG8gZXhjbHVkZSB0aGUgbG93ZXJcbiAgICAgICogIGJvdW5kIHBhc3NlZCBpbiBvcHRpb25zLmxvd2VyIGZyb20gdGhlIGtleSByYW5nZVxuICAgICAgKiBAcGFyYW0geyp9IFtvcHRpb25zLnVwcGVyXSBUaGUgdXBwZXIgYm91bmRcbiAgICAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5leGNsdWRlVXBwZXJdIFdoZXRoZXIgdG8gZXhjbHVkZSB0aGUgdXBwZXJcbiAgICAgICogIGJvdW5kIHBhc3NlZCBpbiBvcHRpb25zLnVwcGVyIGZyb20gdGhlIGtleSByYW5nZVxuICAgICAgKiBAcGFyYW0geyp9IFtvcHRpb25zLm9ubHldIEEgc2luZ2xlIGtleSB2YWx1ZS4gVXNlIHRoaXMgaWYgeW91IG5lZWQgYSBrZXlcbiAgICAgICogIHJhbmdlIHRoYXQgb25seSBpbmNsdWRlcyBvbmUgdmFsdWUgZm9yIGEga2V5LiBQcm92aWRpbmcgdGhpc1xuICAgICAgKiAgcHJvcGVydHkgaW52YWxpZGF0ZXMgYWxsIG90aGVyIHByb3BlcnRpZXMuXG4gICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIElEQktleVJhbmdlIHJlcHJlc2VudGluZyB0aGUgc3BlY2lmaWVkIG9wdGlvbnNcbiAgICAgICovXG4gICAgIG1ha2VLZXlSYW5nZTogZnVuY3Rpb24ob3B0aW9ucyl7XG4gICAgICAgLypqc2hpbnQgb25lY2FzZTp0cnVlICovXG4gICAgICAgdmFyIGtleVJhbmdlLFxuICAgICAgICAgICBoYXNMb3dlciA9IHR5cGVvZiBvcHRpb25zLmxvd2VyICE9ICd1bmRlZmluZWQnLFxuICAgICAgICAgICBoYXNVcHBlciA9IHR5cGVvZiBvcHRpb25zLnVwcGVyICE9ICd1bmRlZmluZWQnLFxuICAgICAgICAgICBpc09ubHkgPSB0eXBlb2Ygb3B0aW9ucy5vbmx5ICE9ICd1bmRlZmluZWQnO1xuXG4gICAgICAgc3dpdGNoKHRydWUpe1xuICAgICAgICAgY2FzZSBpc09ubHk6XG4gICAgICAgICAgIGtleVJhbmdlID0gdGhpcy5rZXlSYW5nZS5vbmx5KG9wdGlvbnMub25seSk7XG4gICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgY2FzZSBoYXNMb3dlciAmJiBoYXNVcHBlcjpcbiAgICAgICAgICAga2V5UmFuZ2UgPSB0aGlzLmtleVJhbmdlLmJvdW5kKG9wdGlvbnMubG93ZXIsIG9wdGlvbnMudXBwZXIsIG9wdGlvbnMuZXhjbHVkZUxvd2VyLCBvcHRpb25zLmV4Y2x1ZGVVcHBlcik7XG4gICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgY2FzZSBoYXNMb3dlcjpcbiAgICAgICAgICAga2V5UmFuZ2UgPSB0aGlzLmtleVJhbmdlLmxvd2VyQm91bmQob3B0aW9ucy5sb3dlciwgb3B0aW9ucy5leGNsdWRlTG93ZXIpO1xuICAgICAgICAgICBicmVhaztcbiAgICAgICAgIGNhc2UgaGFzVXBwZXI6XG4gICAgICAgICAgIGtleVJhbmdlID0gdGhpcy5rZXlSYW5nZS51cHBlckJvdW5kKG9wdGlvbnMudXBwZXIsIG9wdGlvbnMuZXhjbHVkZVVwcGVyKTtcbiAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjcmVhdGUgS2V5UmFuZ2UuIFByb3ZpZGUgb25lIG9yIGJvdGggb2YgXCJsb3dlclwiIG9yIFwidXBwZXJcIiB2YWx1ZSwgb3IgYW4gXCJvbmx5XCIgdmFsdWUuJyk7XG4gICAgICAgfVxuXG4gICAgICAgcmV0dXJuIGtleVJhbmdlO1xuXG4gICAgIH1cblxuICAgfTtcblxuICAgLyoqIGhlbHBlcnMgKiovXG5cbiAgIHZhciBlbXB0eSA9IHt9O1xuICAgdmFyIG1peGluID0gZnVuY3Rpb24gKHRhcmdldCwgc291cmNlKSB7XG4gICAgIHZhciBuYW1lLCBzO1xuICAgICBmb3IgKG5hbWUgaW4gc291cmNlKSB7XG4gICAgICAgcyA9IHNvdXJjZVtuYW1lXTtcbiAgICAgICBpZiAocyAhPT0gZW1wdHlbbmFtZV0gJiYgcyAhPT0gdGFyZ2V0W25hbWVdKSB7XG4gICAgICAgICB0YXJnZXRbbmFtZV0gPSBzO1xuICAgICAgIH1cbiAgICAgfVxuICAgICByZXR1cm4gdGFyZ2V0O1xuICAgfTtcblxuICAgSURCU3RvcmUudmVyc2lvbiA9IElEQlN0b3JlLnByb3RvdHlwZS52ZXJzaW9uO1xuXG4gICByZXR1cm4gSURCU3RvcmU7XG5cblxufSwgdGhpcyk7XG4iLCJpbXBvcnQgTm90aWZ5IGZyb20gXCIuL25vdGlmeVwiO1xuaW1wb3J0IFBhZ2Vib29rIGZyb20gXCIuL3BhZ2Vib29rXCI7XG5cbmNvbnN0IE1FTlVfSVRFTV9BREQgPSBcInBhZ2Vib29rX2N0eG1lbnVfYWRkXCI7XG5jb25zdCBNRU5VX0lURU1fQUREX0FMTCA9IFwicGFnZWJvb2tfY3R4bWVudV9hZGRfYWxsXCI7XG5cbmNocm9tZS5jb250ZXh0TWVudXMuY3JlYXRlKHtcbiAgaWQ6IE1FTlVfSVRFTV9BREQsIFxuICB0eXBlOiBcIm5vcm1hbFwiLFxuICB0aXRsZTogY2hyb21lLmkxOG4uZ2V0TWVzc2FnZShcImNvbnRleHRtZW51c19hZGRfdGl0bGVcIiksXG4gIGNvbnRleHRzOiBbXCJwYWdlXCJdXG59KTtcblxuY2hyb21lLmNvbnRleHRNZW51cy5jcmVhdGUoe1xuICBpZDogTUVOVV9JVEVNX0FERF9BTEwsXG4gIHR5cGU6IFwibm9ybWFsXCIsXG4gIHRpdGxlOiBjaHJvbWUuaTE4bi5nZXRNZXNzYWdlKFwiY29udGV4dG1lbnVzX2FkZF9hbGxfdGl0bGVcIiksXG4gIGNvbnRleHRzOiBbXCJwYWdlXCJdXG59KTtcblxuY2hyb21lLmNvbnRleHRNZW51cy5vbkNsaWNrZWQuYWRkTGlzdGVuZXIoKGluZm8sIHRhYikgPT4ge1xuICBzd2l0Y2goaW5mby5tZW51SXRlbUlkKSB7XG4gICAgY2FzZSBNRU5VX0lURU1fQUREOlxuICAgICAgYWRkKHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE1FTlVfSVRFTV9BRERfQUxMOlxuICAgICAgYWRkQWxsKCk7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgYWxlcnQoXCLnn6XjgonjgpPjgrPjg57jg7Pjg4lcIik7XG4gIH1cbn0pO1xuXG52YXIgcGFnZWJvb2sgPSBuZXcgUGFnZWJvb2soKTtcbndpbmRvdy5wYWdlYm9vayA9IHBhZ2Vib29rO1xuXG5mdW5jdGlvbiBhZGQodGFiKSB7XG4gIGxldCB7IGlkLCB0aXRsZSwgdXJsIH0gPSB0YWI7XG4gIGxldCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG4gIGEuc2V0QXR0cmlidXRlKFwiaHJlZlwiLCB1cmwpO1xuXG4gIGlmIChhLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG4gICAgcGFnZWJvb2suYWRkKHsgdGl0bGUsIHVybCB9KS50aGVuKCgpID0+IHtcbiAgICAgIE5vdGlmeS5zZW5kKGlkLCBcInVwZGF0ZVwiLCBgJHt0aXRsZX0gJHt1cmx9YCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQWxsKCkge1xuICBjaHJvbWUud2luZG93cy5nZXRBbGwod2luZG93cyA9PiB7XG4gICAgd2luZG93cy5mb3JFYWNoKHdpbmRvdyA9PiB7XG4gICAgICBjaHJvbWUudGFicy5nZXRBbGxJbldpbmRvdyh3aW5kb3cuaWQsIHRhYnMgPT4ge1xuICAgICAgICB0YWJzLmZvckVhY2goYWRkKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIE5vdGlmeSB7XG4gIHN0YXRpYyBzZW5kKGlkLCB0aXRsZSwgbWVzc2FnZSkge1xuICAgIGNocm9tZS5ub3RpZmljYXRpb25zLmNyZWF0ZShcbiAgICAgIFN0cmluZyhpZCksXG4gICAgICB7IFwidHlwZVwiOiBcImJhc2ljXCIsIFwiaWNvblVybFwiOiBcImFzc2V0cy9pbWFnZXMvaWNvbl80OC5wbmdcIiwgdGl0bGUsIG1lc3NhZ2UgfSxcbiAgICAgIGlkID0+IHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgY2hyb21lLm5vdGlmaWNhdGlvbnMuY2xlYXIoaWQsICgpID0+IHt9KTtcbiAgICAgICAgfSwgMzAwMCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuIiwiaW1wb3J0IElEQlN0b3JlIGZyb20gXCJpZGItd3JhcHBlci1wcm9taXNpZnlcIjtcblxuY29uc3QgREJfTkFNRSA9IFwicGFnZWJvb2tcIjtcbmNvbnN0IERCX1ZFUlNJT04gPSAxO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQYWdlYm9vayB7XG5cbiAgZ2V0U3RvcmUoKSB7XG4gICAgcmV0dXJuIG5ldyBJREJTdG9yZSh7XG4gICAgICBzdG9yZU5hbWU6IERCX05BTUUsXG4gICAgICB2ZXJzaW9uOiBEQl9WRVJTSU9OLFxuICAgICAgaW5kZXhlczogW3sgbmFtZTogXCJ1cmxcIiwgdW5pcXVlOiB0cnVlIH1dXG4gICAgfSk7XG4gIH1cblxuICBhZGQocGFyYW0pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgbGV0IHN0b3JlID0gdGhpcy5nZXRTdG9yZSgpO1xuICAgICAgc3RvcmUucmVhZHkudGhlbigoKSA9PiBzdG9yZS5wdXQocGFyYW0pKS50aGVuKGlkID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kQWxsKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsZXQgc3RvcmUgPSB0aGlzLmdldFN0b3JlKCk7XG4gICAgICBzdG9yZS5yZWFkeS50aGVuKCgpID0+IHN0b3JlLmdldEFsbCgpKS50aGVuKGVudHJpZXMgPT4ge1xuICAgICAgICByZXNvbHZlKGVudHJpZXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
