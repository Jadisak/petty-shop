/**
 * PETTY SHOP - Local IndexedDB Storage Service
 * เก็บข้อมูลทั้งหมดในเครื่องแท็บเล็ต ไม่พึ่งพาคลาวด์ ไม่ต้องต่อเน็ต
 */

class PettyShopDB {
  constructor() {
    this.dbName = "PettyShopDB";
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Products store
        if (!db.objectStoreNames.contains("products")) {
          const productStore = db.createObjectStore("products", { keyPath: "id" });
          productStore.createIndex("code", "code", { unique: false });
          productStore.createIndex("category", "category", { unique: false });
          productStore.createIndex("isFavorite", "isFavorite", { unique: false });
          productStore.createIndex("isRecommended", "isRecommended", { unique: false });
          productStore.createIndex("isActive", "isActive", { unique: false });
        }

        // Bills store
        if (!db.objectStoreNames.contains("bills")) {
          const billStore = db.createObjectStore("bills", { keyPath: "id" });
          billStore.createIndex("date", "date", { unique: false });
          billStore.createIndex("status", "status", { unique: false });
          billStore.createIndex("paymentMethod", "paymentMethod", { unique: false });
          billStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        // Parked orders (พักบิล)
        if (!db.objectStoreNames.contains("parked_orders")) {
          const parkedStore = db.createObjectStore("parked_orders", { keyPath: "id" });
          parkedStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        // Settings store (key-value)
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        // Attachments store (receipt slips, photos)
        if (!db.objectStoreNames.contains("attachments")) {
          const attachmentStore = db.createObjectStore("attachments", { keyPath: "id" });
          attachmentStore.createIndex("billId", "billId", { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this._seedInitialData();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("IndexedDB open error:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  async _seedInitialData() {
    // Check if products store is empty
    const count = await this._count("products");
    if (count === 0 && typeof DEFAULT_PRODUCTS !== "undefined") {
      const tx = this.db.transaction("products", "readwrite");
      const store = tx.objectStore("products");
      for (const prod of DEFAULT_PRODUCTS) {
        store.put(prod);
      }
      await this._txPromise(tx);
    }

    // Default settings
    const defaultSettings = [
      { key: "shopName", value: "PETTY SHOP (ร้านเพ็ทตี้ ช็อป)" },
      { key: "shopPhone", value: "089-123-4567" },
      { key: "promptPayId", value: "0891234567" },
      { key: "promptPayName", value: "น.ส. สมศรี ใจดี (เพ็ทตี้ช็อป)" },
      { key: "receiptFooter", value: "ขอบคุณที่อุดหนุนค่ะ สัตว์เลี้ยงสุขภาพดี เจ๊ยินดีบริการ!" },
      { key: "soundEnabled", value: true },
      { key: "taxId", value: "0105556012345" }
    ];

    for (const s of defaultSettings) {
      const existing = await this.getSetting(s.key);
      if (existing === undefined || existing === null) {
        await this.setSetting(s.key, s.value);
      }
    }
  }

  // ---------------- Helper Methods ----------------

  _txPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  _count(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Products CRUD ----------------

  async getAllProducts() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("products", "readonly");
      const store = tx.objectStore("products");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getProductById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("products", "readonly");
      const store = tx.objectStore("products");
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveProduct(product) {
    await this.init();
    if (!product.id) {
      product.id = "prod_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("products", "readwrite");
      const store = tx.objectStore("products");
      const req = store.put(product);
      req.onsuccess = () => resolve(product);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteProduct(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("products", "readwrite");
      const store = tx.objectStore("products");
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async resetProductsToDefault() {
    await this.init();
    const tx = this.db.transaction("products", "readwrite");
    const store = tx.objectStore("products");
    store.clear();
    if (typeof DEFAULT_PRODUCTS !== "undefined") {
      for (const prod of DEFAULT_PRODUCTS) {
        store.put(prod);
      }
    }
    await this._txPromise(tx);
    return true;
  }

  async bulkImportProducts(productsList) {
    await this.init();
    const tx = this.db.transaction("products", "readwrite");
    const store = tx.objectStore("products");
    for (const prod of productsList) {
      if (!prod.id) prod.id = "prod_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
      store.put(prod);
    }
    await this._txPromise(tx);
    return true;
  }

  // ---------------- Bills CRUD ----------------

  async saveBill(bill) {
    await this.init();
    if (!bill.id) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rand = Math.floor(100 + Math.random() * 900);
      bill.id = `PS-${dateStr}-${rand}`;
    }
    if (!bill.createdAt) bill.createdAt = new Date().toISOString();
    if (!bill.date) bill.date = bill.createdAt.slice(0, 10);
    if (!bill.status) bill.status = "COMPLETED"; // COMPLETED, CANCELLED, REFUNDED

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("bills", "readwrite");
      const store = tx.objectStore("bills");
      const req = store.put(bill);
      req.onsuccess = () => resolve(bill);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllBills() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("bills", "readonly");
      const store = tx.objectStore("bills");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getBillsByDate(dateString) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("bills", "readonly");
      const store = tx.objectStore("bills");
      const index = store.index("date");
      const req = index.getAll(dateString);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getBillById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("bills", "readonly");
      const store = tx.objectStore("bills");
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async updateBill(bill) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("bills", "readwrite");
      const store = tx.objectStore("bills");
      const req = store.put(bill);
      req.onsuccess = () => resolve(bill);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Parked Orders (พักบิล) ----------------

  async saveParkedOrder(order) {
    await this.init();
    if (!order.id) order.id = "parked_" + Date.now();
    order.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("parked_orders", "readwrite");
      const store = tx.objectStore("parked_orders");
      const req = store.put(order);
      req.onsuccess = () => resolve(order);
      req.onerror = () => reject(req.error);
    });
  }

  async getParkedOrders() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("parked_orders", "readonly");
      const store = tx.objectStore("parked_orders");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteParkedOrder(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("parked_orders", "readwrite");
      const store = tx.objectStore("parked_orders");
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Settings CRUD ----------------

  async getSetting(key, defaultValue = null) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.value : defaultValue);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setSetting(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllSettings() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const req = store.getAll();
      req.onsuccess = () => {
        const obj = {};
        (req.result || []).forEach(item => {
          obj[item.key] = item.value;
        });
        resolve(obj);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Attachments (Slips / Photos) ----------------

  async saveAttachment(attachment) {
    await this.init();
    if (!attachment.id) attachment.id = "att_" + Date.now();
    if (!attachment.createdAt) attachment.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("attachments", "readwrite");
      const store = tx.objectStore("attachments");
      const req = store.put(attachment);
      req.onsuccess = () => resolve(attachment);
      req.onerror = () => reject(req.error);
    });
  }

  async getAttachmentsByBillId(billId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("attachments", "readonly");
      const store = tx.objectStore("attachments");
      const index = store.index("billId");
      const req = index.getAll(billId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteAttachment(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("attachments", "readwrite");
      const store = tx.objectStore("attachments");
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Backup & Restore ----------------

  async getFullBackup() {
    await this.init();
    const products = await this.getAllProducts();
    const bills = await this.getAllBills();
    const parked = await this.getParkedOrders();
    const settings = await this.getAllSettings();

    // Attachments
    const attachments = await new Promise((resolve) => {
      const tx = this.db.transaction("attachments", "readonly");
      const req = tx.objectStore("attachments").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    return {
      appName: "PETTY SHOP",
      version: "1.0.0",
      backupDate: new Date().toISOString(),
      data: {
        products,
        bills,
        parkedOrders: parked,
        settings,
        attachments
      }
    };
  }

  async restoreBackup(backupJson) {
    await this.init();
    if (!backupJson || !backupJson.data) {
      throw new Error("รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง");
    }

    const { products, bills, parkedOrders, settings, attachments } = backupJson.data;

    if (Array.isArray(products) && products.length > 0) {
      await this.bulkImportProducts(products);
    }

    if (Array.isArray(bills) && bills.length > 0) {
      const tx = this.db.transaction("bills", "readwrite");
      const store = tx.objectStore("bills");
      for (const b of bills) store.put(b);
      await this._txPromise(tx);
    }

    if (Array.isArray(parkedOrders)) {
      const tx = this.db.transaction("parked_orders", "readwrite");
      const store = tx.objectStore("parked_orders");
      for (const p of parkedOrders) store.put(p);
      await this._txPromise(tx);
    }

    if (settings && typeof settings === "object") {
      for (const [k, v] of Object.entries(settings)) {
        await this.setSetting(k, v);
      }
    }

    if (Array.isArray(attachments)) {
      const tx = this.db.transaction("attachments", "readwrite");
      const store = tx.objectStore("attachments");
      for (const a of attachments) store.put(a);
      await this._txPromise(tx);
    }

    return true;
  }
}

// Global instance
const db = new PettyShopDB();
