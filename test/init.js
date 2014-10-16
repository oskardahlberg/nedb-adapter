module.exports = require('should');

var Schema = require('jugglingdb').Schema;

global.getSchema = function() {
    var db = new Schema(require('../'), {
      tables: {
        User: './test/user.db',
        Post: './test/post.db',
        Book: './test/book.db',
        Chapter: './test/chapter.db',
        test_collection: './test/test.db'
      }
    });

    db.log = function (a) { console.log(a); };

    return db;
};
