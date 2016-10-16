import Notify from "./notify";
import Pagebook from "./pagebook";

const MENU_ITEM_ADD = "pagebook_ctxmenu_add";
const MENU_ITEM_ADD_ALL = "pagebook_ctxmenu_add_all";

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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch(info.menuItemId) {
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

var pagebook = new Pagebook();
window.pagebook = pagebook;

function add(tab) {
  let { id, title, url } = tab;
  let a = document.createElement("a");
  a.setAttribute("href", url);

  if (a.protocol.startsWith("http")) {
    pagebook.add({ title, url }).then(() => {
      Notify.send(id, "update", `${title} ${url}`);
    });
  }
}

function addAll() {
  chrome.windows.getAll(windows => {
    windows.forEach(window => {
      chrome.tabs.getAllInWindow(window.id, tabs => {
        tabs.forEach(add);
      });
    });
  });
}
