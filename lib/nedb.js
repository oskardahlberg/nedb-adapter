var Nedb = require('nedb');
var async = require('async');

exports.initialize = function initializeSchema (schema, callback) {
  if (!Nedb) return;

  var settings = schema.settings;

  settings.safe = settings.safe || false;
  //write concern
  settings.w = settings.w || 0;
  //journaling
  settings.j = settings.j || false;

  schema.adapter = new Adapter(settings, schema, callback);
  schema.ObjectID = String;
};

var Adapter = function (settings, schema, callback) {
  this.name = 'nedb';
  this._models = {};

  var tables = {};
  this.tables = tables;
  var paths = settings.tables || [];
  var factories = [];

  for (var name in paths) {
    factories.push(function (name, path, callback) {
      var store = new Nedb({ filename: path });
      store.loadDatabase(function (error) {
        tables[name] = {
          name: name,
          path: path,
          store: store,
          error: error
        };
        callback();
      });
    }.bind(null, name, paths[name]));
  }

  async.parallel(factories, function () {
    callback();
  });
};

Adapter.prototype.define = function (description) {
  if (!description.settings) description.settings = {};
  this._models[description.model.modelName] = description;
  if (!description.settings.table) description.settings.table = description.model.modelName;

  if (description.properties.id) return;

  var id = function (table) {
    return this.tables[table].store.createNewId();
  }.bind(this, description.settings.table);

  description.properties.id = { type: String, index: true };
};

Adapter.prototype.defineProperty = function (model, properties, params) {
  this._models[model].properties[properties] = params;
};

Adapter.prototype.defineForeignKey = function (model, key, callback) {
  /*var id = function (model) {
    return this.collection(model).createNewId();
  }.bind(this, model);
*/
  callback(null, String);
};

Adapter.prototype.collection = function (name) {
  if (typeof (this._models[name].settings.table) !== 'undefined') {
    name = this._models[name].settings.table;
  }

  // muh error
  if (!this.tables[name]) return;

  return this.tables[name].store;
};

Adapter.prototype.create = function (model, data, callback, modelConstructor, options) {
  if (data.id == undefined) delete data.id;
  if (data.id) {
    data._id = data.id;
    delete data.id;
  }
  if (!options) options = {};

  // enable write concern if it's not specified
  // does this apply to nedb?
  options.w = options.w || 1;

  this.collection(model).insert(data, function (error, result) {
    if (error || (options.w < 1)) {
      callback(error, null);
    } else {
      callback(null, result._id);
    }
  });
};

Adapter.prototype.save = function (model, data, callback) {
  var id = data._id || data.id;

  delete data.id;
  delete data._id;
  
  this.collection(model).update({ _id: id }, data, function (error) {
    callback(error);
  });
};

Adapter.prototype.exists = function (model, id, callback) {
  // why is { _id: 1 } ?
  this.collection(model).findOne({ _id: id }, { _id: 1 }, function (error, result) {
    callback(error, !!(result && result._id));
  });
};

Adapter.prototype.find = function find (model, id, callback) {
  this.collection(model).findOne({ _id: id }, function (error, result) {
    if (result) result.id = id;
    callback(error, result);
  });
};

Adapter.prototype.updateOrCreate = function updateOrCreate (model, data, callback) {
  // set data.id as a mongodb object
  var id = data._id || data.id;
  var collection = this.collection(model);
  if (id == undefined) id = collection.createNewId();

  // avoid setting data._id during $set method
  delete data.id;
  delete data._id;    

  collection.update({ _id: id }, { $set: data }, { upsert: true, multi: false }, function (error, rowsAffected) {
    data.id = id;
    callback(error, data);
  });
};

Adapter.prototype.destroy = function destroy (model, id, callback) {
  this.collection(model).remove({ _id: id }, callback);
};

Adapter.prototype.all = function all (model, filter, callback) {
  if (!filter) {
    filter = {};
  }
  var query = {};
  if (filter.where) {
    if (filter.where.id) {
      var id = filter.where.id;
      delete filter.where.id;
      filter.where._id = id;
    }

    Object.keys(filter.where).forEach(function (k) {
      var cond = filter.where[k];
      var spec = false;
      if (cond && cond.constructor.name === 'Object') {
        spec = Object.keys(cond)[0];
        cond = cond[spec];
      }
      if (spec) {
        if (spec === 'between') {
          query[k] = { $gte: cond[0], $lte: cond[1]};
        } else if (spec === 'inq') {
          query[k] = { $in: cond };
        } else {
          query[k] = {};
          query[k]['$' + spec] = cond;
        }
      } else {
        if (cond === null) {
          query[k] = {$type: 10};
        } else {
          query[k] = cond;
        }
      }
    });
  }

  var cursor = this.collection(model).find(query);

  if (filter.order) {
    var keys = filter.order;
    if (typeof keys === 'string') {
      keys = keys.split(',');
    }
    var args = {};
    for (var index in keys) {
      var m = keys[index].match(/\s+(A|DE)SC$/);
      var key = keys[index];
      key = key.replace(/\s+(A|DE)SC$/, '').trim();
      if (m && m[1] === 'DE') {
        args[key] = -1;
      } else {
        args[key] = 1;
      }
    }
    cursor.sort(args);
  }

  if (filter.limit) cursor.limit(filter.limit);

  if (filter.skip) cursor.skip(filter.skip);
  else if (filter.offset) cursor.skip(filter.offset);

  var models = this._models;

  cursor._exec(function (err, data) {
    if (err) return callback(err);
    var objs = data.map(function (o) { o.id = o._id; return o; });
    if (filter && filter.include) {
      models[model].model.include(objs, filter.include, callback);
    }
    else callback(null, objs);
  });
};

Adapter.prototype.destroyAll = function destroyAll(model, callback) {
  this.collection(model).remove({}, callback);
};

Adapter.prototype.count = function count(model, callback, where) {
  this.collection(model).count(where, function (err, count) {
    callback(err, count);
  });
};

Adapter.prototype.updateAttributes = function updateAttributes (model, id, data, callback) {
  this.collection(model).findAndModify({ _id: id }, [['_id','asc']], { $set: data }, {}, function (error, result) {
    callback(error, result);
  });
};

Adapter.prototype.disconnect = function () {
  //this.client.close();
};