(function(bg) {
  "use strict";

  createContextMenu(
    "pagebook_ctxmenu_add",
    chrome.i18n.getMessage("contextmenus_add_title")
  );

  createContextMenu(
    "pagebook_ctxmenu_add_all",
    chrome.i18n.getMessage("contextmenus_add_all_title")
  );

  chrome.contextMenus.onClicked.addListener(function(info, tab) {
    switch(info.menuItemId) {
      case "pagebook_ctxmenu_add":
        add(tab);
        break;
      case "pagebook_ctxmenu_add_all":
        addAll();
        break;

      default:
        alert("知らんコマンド");
    }
  });

  function createContextMenu(id, title) {
    chrome.contextMenus.create({
      "id": id,
      "type": "normal",
      "title": title,
      "contexts": ["page"]
    });
  }

  var pagebook = new PageBook();
  bg.pagebook = pagebook;

  function isHttpUrl(url) {
    var a = document.createElement('a');
    a.setAttribute('href', url);

    return a.protocol.match(/^https?:$/) ? true : false;
  }

  function add(tab) {
    var title = tab.title;
    var url   = tab.url;

    if (isHttpUrl(url)) {
      pagebook.add({ "title": title, "url": url })
        .then(function() {
          Notify.send(tab.id, "update", (title + " " + url));
        });
    }
  }

  function addAll() {
    chrome.windows.getAll(function(wnds) {
      wnds.forEach(function(wnd) {
        chrome.tabs.getAllInWindow(wnd.id, function(tabs) {
          tabs.forEach(add);
        });
      });
    });
  }
})(this);
