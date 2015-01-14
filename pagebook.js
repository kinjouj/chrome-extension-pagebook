var PageBook = (function() {

  var server;

  function PageBook() {
    db.open({
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
    }).then(function(s) {
      server = s;
    });
  }

  PageBook.prototype.add = function(param) {
    return server.pagebook.add(param);
  }

  PageBook.prototype.findAll = function() {
    return server.pagebook.query().filter().execute();
  }

  return PageBook;

})();
