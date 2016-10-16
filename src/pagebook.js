import IDBStore from "idb-wrapper-promisify";

const DB_NAME = "pagebook";
const DB_VERSION = 1;

export default class Pagebook {

  getStore() {
    return new IDBStore({
      storeName: DB_NAME,
      version: DB_VERSION,
      indexes: [{ name: "url", unique: true }]
    });
  }

  add(param) {
    return new Promise((resolve, reject) => {
      let store = this.getStore();
      store.ready.then(() => store.put(param)).then(id => {
        resolve();
      });
    });
  }

  findAll() {
    return new Promise((resolve, reject) => {
      let store = this.getStore();
      store.ready.then(() => store.getAll()).then(entries => {
        resolve(entries);
      });
    });
  }
}
