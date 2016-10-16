export default class Notify {
  static send(id, title, message) {
    chrome.notifications.create(
      String(id),
      { "type": "basic", "iconUrl": "assets/images/icon_48.png", title, message },
      id => {
        setTimeout(() => {
          chrome.notifications.clear(id, () => {});
        }, 3000);
      }
    );
  }
}
