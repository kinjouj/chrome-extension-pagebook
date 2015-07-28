var Notify = (function() {

  var noop = function() {}

  function Notify() {
  }

  Notify.send = function(id, title, message) {
    chrome.notifications.create(String(id), {
      "type": "basic",
      "iconUrl": "img/icon_48.png",
      "title": title,
      "message": message
    }, function(id) {
      setTimeout(function() {
        chrome.notifications.clear(id, noop);
      }, 3000);
    });
  }

  return Notify;

})();
