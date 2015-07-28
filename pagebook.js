var PageBook = (function() {

  var pagebookDB;

  function PageBook() {
    pagebookDB = db.open({
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
    return pagebookDB.then(function(db) {
      return db.pagebook.add(param);
    });
  }

  PageBook.prototype.findAll = function() {
    return pagebookDB.then(function(db) {
      return db.pagebook.query().filter().execute();
    });
  }

  return PageBook;

})();
