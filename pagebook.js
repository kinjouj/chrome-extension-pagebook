var PageBook = (function() {

  var _db;

  function PageBook() {
    _db = db.open({
      server: 'pagebook',
      version: 1,
      schema: {
        pagebook: {
          key: { keyPath: 'id', autoIncrement: true },
          indexes: {
            url: { unique: true }
          }
        }
      }
    });
  }

  PageBook.prototype.add = function(param) {
    return _db.then(function(db) {
      return db.pagebook.add(param);
    });
  }

  PageBook.prototype.findAll = function() {
    return _db.then(function(db) {
      return db.pagebook.query().filter().execute();
    });
  }

  return PageBook;

})();
