/**
 * PETTY SHOP - Core Application Logic
 * ผู้ช่วยการขายของเจ๊บนแท็บเล็ต
 */

class PettyShopApp {
  constructor() {
    this.currentView = "pos-view";
    this.products = [];
    this.activeCategory = "all";
    this.searchQuery = "";

    // Active order state
    this.activeOrder = {
      nickname: "พี่เสื้อฟ้า",
      items: [], // { product, qty, isPacked, discount, discountReason }
      notes: ""
    };

    // Compare state (up to 2 products)
    this.compareProductIds = [];

    // Settings
    this.settings = {};

    // Today's Date String YYYY-MM-DD
    this.todayStr = new Date().toISOString().slice(0, 10);
  }

  async init() {
    // 1. Init Database
    await db.init();

    // 2. Load settings & products
    await this.loadSettings();
    await this.loadProducts();

    // 3. Setup UI components & events
    this.setupNavigation();
    this.setupCategoryPills();
    this.setupSearch();
    this.setupOrderBoard();
    this.setupModals();
    this.setupJournal();
    this.setupEOD();
    this.setupCatalogSettings();

    // 4. Update Header Badges
    await this.updateTodayBillCountBadge();
    await this.updateParkedCountBadge();
    await this.checkEODStatus();

    // 5. Initial Render
    this.renderCatalog();
    this.renderOrderBoard();
  }

  // ================= Loaders =================

  async loadSettings() {
    this.settings = await db.getAllSettings();
    // Sound setting
    if (this.settings.soundEnabled !== undefined) {
      sound.enabled = this.settings.soundEnabled;
      const soundIcon = document.getElementById("sound-icon");
      if (soundIcon) soundIcon.textContent = sound.enabled ? "🔊" : "🔇";
    }
  }

  async loadProducts() {
    this.products = await db.getAllProducts();
  }

  // ================= Navigation =================

  setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-tab-btn");
    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetView = btn.getAttribute("data-view");
        this.switchView(targetView);
        sound.playTap();
      });
    });

    // Sound toggle in header
    const btnSound = document.getElementById("btn-toggle-sound");
    if (btnSound) {
      btnSound.addEventListener("click", async () => {
        sound.enabled = !sound.enabled;
        await db.setSetting("soundEnabled", sound.enabled);
        document.getElementById("sound-icon").textContent = sound.enabled ? "🔊" : "🔇";
        this.showToast(sound.enabled ? "เปิดเสียงแล้ว" : "ปิดเสียงแล้ว");
        if (sound.enabled) sound.playTap();
      });
    }

    // Settings view open/close
    const btnOpenSettings = document.getElementById("btn-open-settings");
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener("click", () => {
        this.switchView("settings-view");
        this.renderCatalogTable();
        sound.playTap();
      });
    }

    const btnCloseSettings = document.getElementById("btn-close-settings-view");
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener("click", () => {
        this.switchView("pos-view");
        sound.playTap();
      });
    }
  }

  switchView(viewId) {
    this.currentView = viewId;

    // Toggle nav active state
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewId);
    });

    // Toggle view sections
    document.querySelectorAll(".view-section").forEach(sec => {
      sec.classList.toggle("active", sec.id === viewId);
    });

    // Refresh view specific data
    if (viewId === "journal-view") {
      this.refreshJournalView();
    } else if (viewId === "eod-view") {
      this.refreshEODView();
    } else if (viewId === "pos-view") {
      this.renderCatalog();
    }
  }

  // ================= Sales Assistant: Catalog & Search =================

  setupCategoryPills() {
    const bar = document.getElementById("category-pills-bar");
    if (!bar) return;

    bar.innerHTML = "";
    CATEGORIES.forEach(cat => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cat-pill-btn ${cat.id === this.activeCategory ? "active" : ""}`;
      btn.innerHTML = `${cat.label}`;
      btn.addEventListener("click", () => {
        this.activeCategory = cat.id;
        document.querySelectorAll(".cat-pill-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.renderCatalog();
        sound.playTap();
      });
      bar.appendChild(btn);
    });
  }

  setupSearch() {
    const searchInput = document.getElementById("pos-search-input");
    const clearBtn = document.getElementById("btn-clear-search");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = this.searchQuery ? "block" : "none";
        this.renderCatalog();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
          this.searchQuery = "";
          clearBtn.style.display = "none";
          this.renderCatalog();
          searchInput.focus();
        }
      });
    }
  }

  renderCatalog() {
    const grid = document.getElementById("pos-product-grid");
    if (!grid) return;

    // Filter products
    let list = this.products.filter(p => p.isActive !== false);

    // Apply category filter
    const catDef = CATEGORIES.find(c => c.id === this.activeCategory);
    if (catDef && typeof catDef.filter === "function") {
      list = list.filter(catDef.filter);
    }

    // Apply search filter (Thai keywords, nicknames, formula, code)
    if (this.searchQuery) {
      const query = this.searchQuery;
      list = list.filter(p => {
        const fullSearchBlob = `${p.name} ${p.nicknames || ""} ${p.code} ${p.brand || ""} ${p.formula || ""} ${p.cheatSheet || ""}`.toLowerCase();
        return fullSearchBlob.includes(query);
      });
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-light);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🔍</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--color-text-muted);">ไม่พบสินค้าที่ตรงกับคำค้น</div>
          <div style="font-size: 0.88rem;">ลองค้นด้วยชื่อเรียกสั้น ๆ หรือเลือกหมวดหมู่อื่น</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = "";
    list.forEach(prod => {
      const isComparing = this.compareProductIds.includes(prod.id);

      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-badges">
            ${prod.isFavorite ? `<span class="card-badge fav">🔥 ขายบ่อย</span>` : ""}
            ${prod.isRecommended ? `<span class="card-badge rec">⭐ เจ๊แนะนำ</span>` : ""}
            <span class="card-badge category">${prod.category}</span>
          </div>
          <button type="button" class="btn-card-compare ${isComparing ? "in-compare" : ""}" data-id="${prod.id}" title="เปิดเทียบกับสินค้าอื่น">
            <span>⚖️</span> ${isComparing ? "เทียบอยู่" : "เทียบ"}
          </button>
        </div>

        <h3 class="card-product-title">${prod.name}</h3>
        <div class="card-formula-size">${prod.formula || ""} ${prod.size ? `• ${prod.size}` : ""}</div>

        ${prod.cheatSheet ? `
          <div class="card-cheatsheet">
            <span class="cheatsheet-icon">💡</span>
            <div>${prod.cheatSheet}</div>
          </div>
        ` : ""}

        ${prod.pairSuggestion ? `
          <div class="card-pair-tag">
            <strong>เผื่อลูกค้าสนใจ:</strong> ${prod.pairSuggestion}
          </div>
        ` : ""}

        <div class="card-bottom-row">
          <div class="card-price-display">
            <span class="card-price-label">ราคาต่อ${prod.unit || "ชิ้น"}</span>
            <div class="card-price-amount">${prod.price.toLocaleString()} <span>บาท</span></div>
          </div>
          <button type="button" class="btn-card-add" data-id="${prod.id}">
            <span>+</span> เพิ่มในบิล
          </button>
        </div>
      `;

      // Event: Add to active order
      const btnAdd = card.querySelector(".btn-card-add");
      btnAdd.addEventListener("click", () => {
        this.addItemToOrder(prod);
      });

      // Event: Toggle compare
      const btnComp = card.querySelector(".btn-card-compare");
      btnComp.addEventListener("click", () => {
        this.toggleCompareProduct(prod.id);
      });

      grid.appendChild(card);
    });
  }

  // ================= Conversational Order Board =================

  setupOrderBoard() {
    // Nickname input
    const nicknameInput = document.getElementById("order-nickname-input");
    if (nicknameInput) {
      nicknameInput.addEventListener("input", (e) => {
        this.activeOrder.nickname = e.target.value.trim() || "ลูกค้าหน้าร้าน";
      });
    }

    // Nickname presets chips
    const chips = document.querySelectorAll(".nickname-chip");
    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        const name = chip.getAttribute("data-name");
        if (nicknameInput) {
          nicknameInput.value = name;
          this.activeOrder.nickname = name;
        }
        sound.playTap();
      });
    });

    // Notes input
    const notesInput = document.getElementById("order-notes-input");
    if (notesInput) {
      notesInput.addEventListener("input", (e) => {
        this.activeOrder.notes = e.target.value.trim();
      });
    }

    // Clear order button
    const btnClear = document.getElementById("btn-clear-order");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        if (this.activeOrder.items.length === 0) return;
        if (confirm("ต้องการล้างรายการออเดอร์นี้หรือไม่?")) {
          this.resetActiveOrder();
          sound.playTap();
          this.showToast("ล้างรายการแล้ว");
        }
      });
    }

    // Park order button (พักบิล)
    const btnPark = document.getElementById("btn-park-current-order");
    if (btnPark) {
      btnPark.addEventListener("click", async () => {
        if (this.activeOrder.items.length === 0) {
          this.showToast("ยังไม่มีรายการสินค้าให้พักบิล");
          return;
        }
        await this.parkActiveOrder();
      });
    }

    // Parked drawer toggle
    const btnToggleParked = document.getElementById("btn-toggle-parked");
    if (btnToggleParked) {
      btnToggleParked.addEventListener("click", () => {
        this.openParkedModal();
      });
    }

    // Proceed to Checkout CTA
    const btnCheckout = document.getElementById("btn-proceed-checkout");
    if (btnCheckout) {
      btnCheckout.addEventListener("click", () => {
        if (this.activeOrder.items.length === 0) return;
        sound.playTap();
        this.openCheckoutModal();
      });
    }
  }

  addItemToOrder(product) {
    sound.playTap();
    if (navigator.vibrate) navigator.vibrate(20);

    const existingIndex = this.activeOrder.items.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      this.activeOrder.items[existingIndex].qty += 1;
    } else {
      this.activeOrder.items.push({
        product: product,
        qty: 1,
        isPacked: false,
        discount: 0,
        discountReason: ""
      });
    }

    this.renderOrderBoard();
    this.showToast(`เพิ่ม "${product.name}" ในบิลแล้ว`);
  }

  renderOrderBoard() {
    const container = document.getElementById("order-items-container");
    const btnCheckout = document.getElementById("btn-proceed-checkout");
    const countDisplay = document.getElementById("order-summary-item-count");
    const grandTotalDisplay = document.getElementById("order-summary-grand-total");
    const discountRow = document.getElementById("order-discount-row");
    const discountDisplay = document.getElementById("order-summary-discount");

    if (!container) return;

    if (this.activeOrder.items.length === 0) {
      container.innerHTML = `
        <div class="empty-order-state" id="empty-order-placeholder">
          <div class="empty-order-icon">🛒</div>
          <div class="empty-order-title">ยังไม่มีรายการสินค้า</div>
          <div class="empty-order-desc">แตะเลือกสินค้าจากด้านซ้ายระหว่างคุยกับลูกค้าได้เลย</div>
        </div>
      `;
      if (btnCheckout) btnCheckout.disabled = true;
      if (countDisplay) countDisplay.textContent = "0 ชิ้น";
      if (grandTotalDisplay) grandTotalDisplay.innerHTML = `0 <span>บาท</span>`;
      if (discountRow) discountRow.style.display = "none";
      return;
    }

    if (btnCheckout) btnCheckout.disabled = false;

    // Calculate totals
    let totalItems = 0;
    let subtotal = 0;
    let totalDiscount = 0;

    container.innerHTML = "";
    this.activeOrder.items.forEach((item, index) => {
      totalItems += item.qty;
      const lineOriginal = item.product.price * item.qty;
      const lineTotal = Math.max(0, lineOriginal - (item.discount || 0));
      subtotal += lineOriginal;
      totalDiscount += (item.discount || 0);

      const row = document.createElement("div");
      row.className = `order-item-card ${item.isPacked ? "is-packed" : ""}`;
      row.innerHTML = `
        <div class="item-main-info">
          <div class="item-name-group">
            <div class="item-name">${item.product.name}</div>
            <div class="item-formula">${item.product.formula || ""} ${item.product.size || ""}</div>
          </div>
          <div class="item-price-col">
            <div class="item-line-total">${lineTotal.toLocaleString()} ฿</div>
            <div class="item-unit-price">@${item.product.price} / ${item.product.unit || "ชิ้น"}</div>
          </div>
        </div>

        ${item.discount > 0 ? `
          <div class="item-discount-row">
            <span>🏷️ ลด ${item.discount} บ. (${item.discountReason || "ส่วนลดพิเศษ"})</span>
            <button type="button" class="btn-edit-discount" data-index="${index}">แก้ส่วนลด</button>
          </div>
        ` : ""}

        <div class="item-actions-row">
          <!-- Staff Packing Checkbox -->
          <label class="packing-check-label ${item.isPacked ? "checked" : ""}">
            <input type="checkbox" class="packing-checkbox" data-index="${index}" ${item.isPacked ? "checked" : ""}>
            <span>${item.isPacked ? "✓ จัดของแล้ว" : "จัดของแล้ว"}</span>
          </label>

          <!-- Stepper [-] [qty] [+] -->
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn-edit-discount" data-index="${index}" style="color:var(--color-text-muted); text-decoration:none; font-size:0.75rem;">
              ${item.discount > 0 ? "ลดแล้ว" : "+ ลดราคา"}
            </button>
            <div class="qty-stepper">
              <button type="button" class="btn-stepper btn-qty-minus" data-index="${index}">−</button>
              <span class="qty-display">${item.qty}</span>
              <button type="button" class="btn-stepper btn-qty-plus" data-index="${index}">+</button>
            </div>
            <button type="button" class="btn-remove-item" data-index="${index}" title="ลบรายการ">🗑️</button>
          </div>
        </div>
      `;

      // Event: Stepper minus
      row.querySelector(".btn-qty-minus").addEventListener("click", () => {
        sound.playTap();
        if (item.qty > 1) {
          item.qty -= 1;
        } else {
          this.activeOrder.items.splice(index, 1);
        }
        this.renderOrderBoard();
      });

      // Event: Stepper plus
      row.querySelector(".btn-qty-plus").addEventListener("click", () => {
        sound.playTap();
        item.qty += 1;
        this.renderOrderBoard();
      });

      // Event: Remove item
      row.querySelector(".btn-remove-item").addEventListener("click", () => {
        sound.playTap();
        this.activeOrder.items.splice(index, 1);
        this.renderOrderBoard();
      });

      // Event: Toggle packing checkbox
      const chk = row.querySelector(".packing-checkbox");
      chk.addEventListener("change", (e) => {
        item.isPacked = e.target.checked;
        if (item.isPacked) {
          sound.playCheck();
        } else {
          sound.playTap();
        }
        this.renderOrderBoard();
      });

      // Event: Edit discount
      row.querySelectorAll(".btn-edit-discount").forEach(btn => {
        btn.addEventListener("click", () => {
          this.openDiscountModal(index);
        });
      });

      container.appendChild(row);
    });

    const grandTotal = Math.max(0, subtotal - totalDiscount);

    if (countDisplay) countDisplay.textContent = `${totalItems} ชิ้น`;
    if (grandTotalDisplay) {
      grandTotalDisplay.innerHTML = `${grandTotal.toLocaleString()} <span>บาท</span>`;
    }

    if (discountRow && discountDisplay) {
      if (totalDiscount > 0) {
        discountRow.style.display = "flex";
        discountDisplay.textContent = `-${totalDiscount.toLocaleString()} บาท`;
      } else {
        discountRow.style.display = "none";
      }
    }
  }

  resetActiveOrder() {
    this.activeOrder = {
      nickname: "พี่เสื้อฟ้า",
      items: [],
      notes: ""
    };
    const inputNick = document.getElementById("order-nickname-input");
    if (inputNick) inputNick.value = "พี่เสื้อฟ้า";
    const inputNotes = document.getElementById("order-notes-input");
    if (inputNotes) inputNotes.value = "";
    this.renderOrderBoard();
  }

  // ================= Park / Resume Orders (พักบิล) =================

  async parkActiveOrder() {
    sound.playPark();
    const orderToPark = {
      nickname: this.activeOrder.nickname || "ลูกค้าหน้าร้าน",
      items: JSON.parse(JSON.stringify(this.activeOrder.items)),
      notes: this.activeOrder.notes || ""
    };

    await db.saveParkedOrder(orderToPark);
    this.resetActiveOrder();
    await this.updateParkedCountBadge();
    this.showToast(`พักบิล "${orderToPark.nickname}" ไว้แล้ว`);
  }

  async updateParkedCountBadge() {
    const list = await db.getParkedOrders();
    const badge = document.getElementById("parked-count-badge");
    if (badge) badge.textContent = list.length;
  }

  async openParkedModal() {
    sound.playTap();
    const list = await db.getParkedOrders();
    const modal = document.getElementById("parked-orders-modal");
    const countEl = document.getElementById("parked-modal-count");
    const body = document.getElementById("parked-orders-list-body");

    if (countEl) countEl.textContent = list.length;

    if (list.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-light);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">⏸️</div>
          <div style="font-size: 1.05rem; font-weight:600; color:var(--color-text-muted);">ไม่มีรายการบิลที่พักไว้</div>
          <div style="font-size: 0.85rem;">เมื่อต้องการสลับไปรับลูกค้าคนอื่น สามารถกดปุ่ม "พักบิลนี้" ได้</div>
        </div>
      `;
    } else {
      body.innerHTML = "";
      list.forEach(parked => {
        const totalAmount = parked.items.reduce((sum, it) => sum + (it.product.price * it.qty) - (it.discount || 0), 0);
        const card = document.createElement("div");
        card.className = "package-file-card";
        card.style.marginBottom = "10px";
        card.innerHTML = `
          <div>
            <h4 style="font-family:var(--font-heading); font-size:1.05rem; color:var(--color-primary);">
              ${parked.nickname}
            </h4>
            <div style="font-size:0.82rem; color:var(--color-text-muted);">
              ${parked.items.length} รายการ • รวม ${totalAmount.toLocaleString()} ฿
            </div>
            <div style="font-size:0.75rem; color:var(--color-text-light);">
              เวลาพัก: ${new Date(parked.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-checkout-primary btn-resume-parked" data-id="${parked.id}" style="height:38px; padding:0 14px; font-size:0.88rem;">
              ดึงกลับมาทำต่อ
            </button>
            <button type="button" class="btn-order-action danger btn-del-parked" data-id="${parked.id}">
              ลบ
            </button>
          </div>
        `;

        // Resume event
        card.querySelector(".btn-resume-parked").addEventListener("click", async () => {
          // If current order has items, prompt or auto-park current
          if (this.activeOrder.items.length > 0) {
            const shouldParkCurrent = confirm("ออเดอร์ปัจจุบันยังมีสินค้าอยู่ ต้องการพักบิลปัจจุบันแล้วดึงบิลนี้มาทำต่อหรือไม่?");
            if (!shouldParkCurrent) return;
            await db.saveParkedOrder({
              nickname: this.activeOrder.nickname,
              items: this.activeOrder.items,
              notes: this.activeOrder.notes
            });
          }

          this.activeOrder = {
            nickname: parked.nickname,
            items: parked.items,
            notes: parked.notes || ""
          };

          const nickInput = document.getElementById("order-nickname-input");
          if (nickInput) nickInput.value = parked.nickname;
          const noteInput = document.getElementById("order-notes-input");
          if (noteInput) noteInput.value = parked.notes || "";

          await db.deleteParkedOrder(parked.id);
          await this.updateParkedCountBadge();
          this.renderOrderBoard();
          modal.classList.remove("active");
          this.showToast(`ดึงบิล "${parked.nickname}" กลับมาทำต่อแล้ว`);
        });

        // Delete event
        card.querySelector(".btn-del-parked").addEventListener("click", async () => {
          if (confirm(`ต้องการลบบิลที่พัก "${parked.nickname}" หรือไม่?`)) {
            await db.deleteParkedOrder(parked.id);
            await this.updateParkedCountBadge();
            this.openParkedModal(); // Re-render
          }
        });

        body.appendChild(card);
      });
    }

    modal.classList.add("active");
  }

  // ================= Compare Modal (เปิดเทียบสินค้า 2 รายการ) =================

  toggleCompareProduct(productId) {
    sound.playTap();
    const idx = this.compareProductIds.indexOf(productId);
    if (idx > -1) {
      this.compareProductIds.splice(idx, 1);
    } else {
      if (this.compareProductIds.length >= 2) {
        this.compareProductIds.shift(); // keep last 2
      }
      this.compareProductIds.push(productId);
    }

    const countEl = document.getElementById("compare-count");
    if (countEl) countEl.textContent = this.compareProductIds.length;

    this.renderCatalog();

    if (this.compareProductIds.length === 2) {
      this.openCompareModal();
    }
  }

  openCompareModal() {
    if (this.compareProductIds.length === 0) {
      this.showToast("กรุณาแตะปุ่ม 'เทียบ' ที่การ์ดสินค้าอย่างน้อย 1 ชิ้น");
      return;
    }

    const modal = document.getElementById("compare-modal");
    const container = document.getElementById("compare-modal-content");
    if (!modal || !container) return;

    const items = this.products.filter(p => this.compareProductIds.includes(p.id));

    container.innerHTML = `
      <div class="compare-columns-grid">
        ${items.map(p => `
          <div class="compare-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="card-badge category">${p.category}</span>
              <div style="font-family:var(--font-heading); font-size:1.4rem; font-weight:700; color:var(--color-primary);">
                ${p.price} ฿
              </div>
            </div>

            <h3 style="font-family:var(--font-heading); font-size:1.15rem; font-weight:700; color:var(--color-text-main); line-height:1.3;">
              ${p.name}
            </h3>

            <div class="compare-field">
              <span class="field-label">สูตรและขนาด</span>
              <span class="field-value">${p.formula || "-"} (${p.size || "-"})</span>
            </div>

            <div class="compare-field">
              <span class="field-label">ช่วงวัยและสายพันธุ์ที่เหมาะ</span>
              <span class="field-value">${p.compareSpecs?.ageRange || "สุนัข/แมวทั่วไป"}</span>
            </div>

            <div class="compare-field">
              <span class="field-label">ความคุ้มค่าเฉลี่ย</span>
              <span class="field-value">${p.compareSpecs?.pricePerUnit || "-"}</span>
            </div>

            <div class="compare-field">
              <span class="field-label">จุดเด่นที่เจ๊ควรพูดกับลูกค้า</span>
              <div style="background-color:#FDF9EE; border-left:3px solid #E69D35; padding:8px 10px; border-radius:0 8px 8px 0; font-size:0.85rem; color:#784812; line-height:1.4;">
                ${p.cheatSheet || p.compareSpecs?.benefit || "-"}
              </div>
            </div>

            <button type="button" class="btn-checkout-primary btn-add-from-compare" data-id="${p.id}" style="margin-top:auto; height:44px; font-size:0.95rem;">
              + เพิ่มตัวนี้เข้ารายการ
            </button>
          </div>
        `).join("")}
      </div>
    `;

    // Add directly from compare
    container.querySelectorAll(".btn-add-from-compare").forEach(btn => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-id");
        const prod = this.products.find(p => p.id === pid);
        if (prod) {
          this.addItemToOrder(prod);
          modal.classList.remove("active");
        }
      });
    });

    modal.classList.add("active");
  }

  // ================= Discount Modal =================

  openDiscountModal(itemIndex) {
    const item = this.activeOrder.items[itemIndex];
    if (!item) return;

    const modal = document.getElementById("discount-modal");
    const nameEl = document.getElementById("discount-item-name-display");
    const amtInput = document.getElementById("input-discount-amount");
    const reasonInput = document.getElementById("input-discount-reason");
    const btnSave = document.getElementById("btn-save-discount");
    const btnRemove = document.getElementById("btn-remove-discount");

    if (nameEl) nameEl.textContent = `${item.product.name} (ราคาปกติ @${item.product.price} x ${item.qty} = ${item.product.price * item.qty} บ.)`;
    if (amtInput) amtInput.value = item.discount || "";
    if (reasonInput) reasonInput.value = item.discountReason || "แถมลูกค้าประจำ";

    btnSave.onclick = () => {
      const discountVal = parseFloat(amtInput.value) || 0;
      item.discount = Math.min(discountVal, item.product.price * item.qty);
      item.discountReason = reasonInput.value.trim();
      modal.classList.remove("active");
      this.renderOrderBoard();
      sound.playTap();
    };

    btnRemove.onclick = () => {
      item.discount = 0;
      item.discountReason = "";
      modal.classList.remove("active");
      this.renderOrderBoard();
      sound.playTap();
    };

    modal.classList.add("active");
  }

  // ================= Checkout & Customer Presentation Modal =================

  openCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    if (!modal) return;

    const shopName = this.settings.shopName || "PETTY SHOP";
    const shopNameEl = document.getElementById("checkout-shop-name");
    if (shopNameEl) shopNameEl.textContent = shopName;

    const nickEl = document.getElementById("checkout-nickname-preview");
    if (nickEl) nickEl.textContent = this.activeOrder.nickname || "ลูกค้าหน้าร้าน";

    // Populate item list preview
    const receiptItemsEl = document.getElementById("checkout-receipt-items");
    let totalItems = 0;
    let subtotal = 0;
    let totalDiscount = 0;

    receiptItemsEl.innerHTML = "";
    this.activeOrder.items.forEach(it => {
      totalItems += it.qty;
      const lineOriginal = it.product.price * it.qty;
      const lineFinal = Math.max(0, lineOriginal - (it.discount || 0));
      subtotal += lineOriginal;
      totalDiscount += (it.discount || 0);

      const row = document.createElement("div");
      row.className = "receipt-item-row";
      row.innerHTML = `
        <div>
          <div>${it.product.name}</div>
          <small style="color:var(--color-text-muted);">${it.qty} x ${it.product.price} บ. ${it.discount > 0 ? `(ลด ${it.discount} บ.)` : ""}</small>
        </div>
        <div style="font-weight:600;">${lineFinal.toLocaleString()} บ.</div>
      `;
      receiptItemsEl.appendChild(row);
    });

    const grandTotal = Math.max(0, subtotal - totalDiscount);

    // Update Totals
    const totalPreviewEl = document.getElementById("checkout-receipt-total");
    if (totalPreviewEl) totalPreviewEl.textContent = `${grandTotal.toLocaleString()} ฿`;

    const bigTotalEl = document.getElementById("checkout-big-total");
    if (bigTotalEl) bigTotalEl.textContent = `${grandTotal.toLocaleString()}.-`;

    // Setup QR with dynamic PromptPay
    this.selectedPayMethod = "QR";
    const promptPayId = this.settings.promptPayId || "0891234567";
    const promptPayName = this.settings.promptPayName || "เพ็ทตี้ช็อป";
    const qrContainer = document.getElementById("promptpay-qr-container");

    renderPromptPayQR(qrContainer, promptPayId, grandTotal, 240);

    const accountLabel = document.getElementById("promptpay-account-label");
    if (accountLabel) {
      accountLabel.textContent = `พร้อมเพย์: ${promptPayId} (${promptPayName})`;
    }

    // Reset cash calc
    this.currentGrandTotal = grandTotal;
    const cashInput = document.getElementById("input-cash-received");
    const changeAmountEl = document.getElementById("cash-change-amount");
    if (cashInput) cashInput.value = "";
    if (changeAmountEl) changeAmountEl.textContent = "0 ฿";

    modal.classList.add("active");
  }

  setupModals() {
    // Close buttons handler
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
      btn.addEventListener("click", () => {
        const modal = btn.closest(".modal-overlay");
        if (modal) modal.classList.remove("active");
      });
    });

    // Pay Method Switcher (QR vs Cash)
    const tabQR = document.getElementById("tab-pay-qr");
    const tabCash = document.getElementById("tab-pay-cash");
    const boxQR = document.getElementById("pay-box-qr");
    const boxCash = document.getElementById("pay-box-cash");

    if (tabQR && tabCash && boxQR && boxCash) {
      tabQR.addEventListener("click", () => {
        this.selectedPayMethod = "QR";
        tabQR.classList.add("active");
        tabCash.classList.remove("active");
        boxQR.style.display = "flex";
        boxCash.style.display = "none";
        sound.playTap();
      });

      tabCash.addEventListener("click", () => {
        this.selectedPayMethod = "CASH";
        tabCash.classList.add("active");
        tabQR.classList.remove("active");
        boxCash.style.display = "flex";
        boxQR.style.display = "none";
        sound.playTap();

        const inputCash = document.getElementById("input-cash-received");
        if (inputCash) inputCash.focus();
      });
    }

    // Cash Calculator Listeners
    const inputCash = document.getElementById("input-cash-received");
    const changeAmountEl = document.getElementById("cash-change-amount");

    const updateCashChange = () => {
      const received = parseFloat(inputCash.value) || 0;
      const change = received - this.currentGrandTotal;
      if (changeAmountEl) {
        if (change >= 0) {
          changeAmountEl.textContent = `${change.toLocaleString()} ฿`;
          changeAmountEl.style.color = "var(--color-success)";
        } else {
          changeAmountEl.textContent = `ยังขาด ${(Math.abs(change)).toLocaleString()} ฿`;
          changeAmountEl.style.color = "var(--color-danger)";
        }
      }
    };

    if (inputCash) {
      inputCash.addEventListener("input", updateCashChange);
    }

    // Preset Cash Buttons
    const btnExact = document.getElementById("btn-cash-exact");
    if (btnExact) {
      btnExact.addEventListener("click", () => {
        if (inputCash) {
          inputCash.value = this.currentGrandTotal;
          updateCashChange();
          sound.playTap();
        }
      });
    }

    document.querySelectorAll(".btn-quick-cash[data-cash]").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-cash");
        if (inputCash) {
          inputCash.value = val;
          updateCashChange();
          sound.playTap();
        }
      });
    });

    // Confirm Payment Done Button
    const btnConfirmPay = document.getElementById("btn-confirm-payment-done");
    if (btnConfirmPay) {
      btnConfirmPay.addEventListener("click", async () => {
        await this.completePayment();
      });
    }

    // Compare Modal Trigger
    const btnOpenCompare = document.getElementById("btn-open-compare");
    if (btnOpenCompare) {
      btnOpenCompare.addEventListener("click", () => {
        this.openCompareModal();
      });
    }
  }

  async completePayment() {
    sound.playSuccess();

    let subtotal = 0;
    let totalDiscount = 0;
    const itemsSnapshot = this.activeOrder.items.map(it => {
      const lineOriginal = it.product.price * it.qty;
      const lineFinal = Math.max(0, lineOriginal - (it.discount || 0));
      subtotal += lineOriginal;
      totalDiscount += (it.discount || 0);

      return {
        productId: it.product.id,
        code: it.product.code,
        name: it.product.name,
        category: it.product.category,
        formula: it.product.formula || "",
        size: it.product.size || "",
        unit: it.product.unit || "ชิ้น",
        price: it.product.price,
        qty: it.qty,
        discount: it.discount || 0,
        discountReason: it.discountReason || "",
        lineTotal: lineFinal,
        isPacked: it.isPacked || false
      };
    });

    const grandTotal = Math.max(0, subtotal - totalDiscount);

    // Cash received details
    let cashReceived = grandTotal;
    let changeAmount = 0;
    if (this.selectedPayMethod === "CASH") {
      const inputCash = document.getElementById("input-cash-received");
      cashReceived = parseFloat(inputCash?.value) || grandTotal;
      changeAmount = Math.max(0, cashReceived - grandTotal);
    }

    // Create bill record
    const billRecord = {
      orderNickname: this.activeOrder.nickname || "ลูกค้าหน้าร้าน",
      items: itemsSnapshot,
      subtotal: subtotal,
      discount: totalDiscount,
      totalAmount: grandTotal,
      paymentMethod: this.selectedPayMethod || "QR",
      cashReceived: cashReceived,
      changeAmount: changeAmount,
      notes: this.activeOrder.notes || "",
      hasSlip: false,
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10)
    };

    const savedBill = await db.saveBill(billRecord);

    // Close checkout modal
    const modal = document.getElementById("checkout-modal");
    if (modal) modal.classList.remove("active");

    // Reset active order
    this.resetActiveOrder();

    // Update badges
    await this.updateTodayBillCountBadge();

    this.showToast(`✅ บันทึกบิล #${savedBill.id} สำเร็จ ยอดรวม ${grandTotal.toLocaleString()} บ.`);
  }

  // ================= VIEW 2: Today's Journal & Slip Attachment =================

  setupJournal() {
    // Filter pills
    const filterPills = document.querySelectorAll(".journal-table-card .btn-filter-pill");
    filterPills.forEach(pill => {
      pill.addEventListener("click", () => {
        filterPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentJournalFilter = pill.getAttribute("data-filter");
        this.renderJournalTable();
        sound.playTap();
      });
    });
  }

  async updateTodayBillCountBadge() {
    const todayBills = await db.getBillsByDate(this.todayStr);
    const activeCount = todayBills.filter(b => b.status === "COMPLETED").length;
    const badge = document.getElementById("header-today-bill-count");
    if (badge) badge.textContent = activeCount;
  }

  async refreshJournalView() {
    const dateDisplay = document.getElementById("journal-date-display");
    if (dateDisplay) {
      dateDisplay.textContent = `วันที่ ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}`;
    }

    const todayBills = await db.getBillsByDate(this.todayStr);
    this.todayBillsCache = todayBills;

    // Calculate metrics
    let totalSales = 0;
    let cashSales = 0;
    let qrSales = 0;
    let completedCount = 0;

    todayBills.forEach(b => {
      if (b.status === "COMPLETED") {
        totalSales += b.totalAmount;
        completedCount++;
        if (b.paymentMethod === "CASH") cashSales += b.totalAmount;
        else qrSales += b.totalAmount;
      }
    });

    const mTotal = document.getElementById("metric-total-sales");
    const mCash = document.getElementById("metric-cash-sales");
    const mQR = document.getElementById("metric-qr-sales");
    const mCount = document.getElementById("metric-bill-count");

    if (mTotal) mTotal.textContent = `${totalSales.toLocaleString()} ฿`;
    if (mCash) mCash.textContent = `${cashSales.toLocaleString()} ฿`;
    if (mQR) mQR.textContent = `${qrSales.toLocaleString()} ฿`;
    if (mCount) mCount.textContent = `${completedCount} บิล`;

    this.renderJournalTable();
  }

  renderJournalTable() {
    const tbody = document.getElementById("bills-table-body");
    if (!tbody) return;

    let list = this.todayBillsCache || [];
    const filter = this.currentJournalFilter || "ALL";

    if (filter === "COMPLETED") list = list.filter(b => b.status === "COMPLETED");
    else if (filter === "CANCELLED") list = list.filter(b => b.status !== "COMPLETED");

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px; color: var(--color-text-light);">
            <div style="font-size: 2rem; margin-bottom: 6px;">🧾</div>
            <div>ยังไม่มีรายการขายในวันนี้</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = "";
    // Show newest first
    const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sorted.forEach(bill => {
      const timeStr = new Date(bill.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      const itemCount = bill.items.reduce((s, it) => s + it.qty, 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${timeStr} น.</td>
        <td><strong>${bill.id}</strong></td>
        <td>${bill.orderNickname || "-"}</td>
        <td>
          <span class="badge-method ${bill.paymentMethod === "CASH" ? "cash" : "qr"}">
            ${bill.paymentMethod === "CASH" ? "💵 เงินสด" : "📲 QR โอน"}
          </span>
        </td>
        <td>${bill.items.length} ชนิด (${itemCount} ชิ้น)</td>
        <td><strong>${bill.totalAmount.toLocaleString()} ฿</strong></td>
        <td>
          <span id="slip-status-${bill.id}">
            ${bill.hasSlip ? "📎 มีสลิป" : "<span style='color:var(--color-text-light);'>-</span>"}
          </span>
        </td>
        <td>
          <span class="badge-status ${bill.status === "COMPLETED" ? "completed" : "cancelled"}">
            ${bill.status === "COMPLETED" ? "สำเร็จ" : "ยกเลิก"}
          </span>
        </td>
        <td>
          <button type="button" class="btn-table-action btn-view-bill" data-id="${bill.id}">
            ดู / แนบสลิป
          </button>
        </td>
      `;

      tr.querySelector(".btn-view-bill").addEventListener("click", () => {
        this.openBillDetailModal(bill.id);
      });

      tbody.appendChild(tr);
    });
  }

  async openBillDetailModal(billId) {
    sound.playTap();
    const bill = await db.getBillById(billId);
    if (!bill) return;

    const modal = document.getElementById("bill-detail-modal");
    const titleEl = document.getElementById("bill-detail-title");
    const content = document.getElementById("bill-detail-content");

    if (titleEl) titleEl.textContent = `🧾 บิล ${bill.id} (${bill.orderNickname})`;

    const attachments = await db.getAttachmentsByBillId(bill.id);

    content.innerHTML = `
      <div style="background-color:#FCFAF6; border:1px solid var(--color-border); border-radius:var(--radius-md); padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>เวลาบันทึก:</span>
          <strong>${new Date(bill.createdAt).toLocaleString("th-TH")}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>วิธีชำระเงิน:</span>
          <strong>${bill.paymentMethod === "CASH" ? "เงินสด" : "สแกน QR"} ${bill.paymentMethod === "CASH" ? `(รับ ${bill.cashReceived} ทอน ${bill.changeAmount} บ.)` : ""}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>สถานะบิล:</span>
          <strong style="color:${bill.status === "COMPLETED" ? "var(--color-success)" : "var(--color-danger)"};">
            ${bill.status === "COMPLETED" ? "รับเงินเรียบร้อย" : "ยกเลิก/คืนเงิน"}
          </strong>
        </div>
        ${bill.notes ? `<div style="margin-top:6px; font-size:0.85rem; color:var(--color-text-muted);">หมายเหตุ: ${bill.notes}</div>` : ""}
      </div>

      <h4 style="font-family:var(--font-heading); margin-bottom:10px;">รายการสินค้าในบิล:</h4>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:20px;">
        ${bill.items.map(it => `
          <div style="display:flex; justify-content:space-between; padding:8px 12px; background-color:#FFF; border:1px solid var(--color-border); border-radius:var(--radius-sm);">
            <div>
              <div style="font-weight:600;">${it.name}</div>
              <small style="color:var(--color-text-muted);">${it.qty} ${it.unit} x ${it.price} บ. ${it.discount > 0 ? `(ลด ${it.discount} บ. : ${it.discountReason})` : ""}</small>
            </div>
            <div style="font-weight:700; color:var(--color-primary);">${it.lineTotal.toLocaleString()} ฿</div>
          </div>
        `).join("")}
      </div>

      <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:700; padding:12px 0; border-top:2px solid var(--color-border); color:var(--color-primary);">
        <span>ยอดรวมสุทธิ</span>
        <span>${bill.totalAmount.toLocaleString()} ฿</span>
      </div>

      <!-- Attachment / Slip Section -->
      <div style="margin-top:20px; border-top:1px dashed var(--color-border); padding-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h4 style="font-family:var(--font-heading);">📎 หลักฐานสลิปเงินโอน / ภาพถ่าย</h4>
          <label class="btn-table-action" style="cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
            <span>📷 แนบสลิป/ถ่ายรูป</span>
            <input type="file" id="input-attach-slip" accept="image/*" style="display:none;">
          </label>
        </div>

        <div id="slip-gallery" style="display:flex; gap:10px; flex-wrap:wrap;">
          ${attachments.length === 0 ? `
            <div style="font-size:0.85rem; color:var(--color-text-light);">ยังไม่มีไฟล์แนบสำหรับบิลนี้</div>
          ` : attachments.map(att => `
            <div style="position:relative; width:100px; height:100px; border:1px solid var(--color-border); border-radius:var(--radius-sm); overflow:hidden;">
              <img src="${att.dataUrl}" style="width:100%; height:100%; object-fit:cover;" alt="slip">
              <button type="button" class="btn-del-slip" data-id="${att.id}" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer;">✕</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Handle Upload Slip
    const fileInput = content.querySelector("#input-attach-slip");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          const dataUrl = evt.target.result;
          await db.saveAttachment({
            billId: bill.id,
            dataUrl: dataUrl,
            fileName: file.name
          });
          bill.hasSlip = true;
          await db.updateBill(bill);
          this.showToast("แนบสลิปสำเร็จ");
          this.openBillDetailModal(bill.id); // Refresh
        };
        reader.readAsDataURL(file);
      });
    }

    // Handle Delete Slip
    content.querySelectorAll(".btn-del-slip").forEach(btn => {
      btn.addEventListener("click", async () => {
        const attId = btn.getAttribute("data-id");
        await db.deleteAttachment(attId);
        const remaining = await db.getAttachmentsByBillId(bill.id);
        if (remaining.length === 0) {
          bill.hasSlip = false;
          await db.updateBill(bill);
        }
        this.openBillDetailModal(bill.id);
      });
    });

    // Handle Cancel Bill button
    const btnCancel = document.getElementById("btn-cancel-this-bill");
    if (btnCancel) {
      if (bill.status !== "COMPLETED") {
        btnCancel.style.display = "none";
      } else {
        btnCancel.style.display = "block";
        btnCancel.onclick = async () => {
          const reason = prompt("กรุณาระบุเหตุผลการยกเลิก/คืนเงิน:", "ลูกค้าเปลี่ยนใจ");
          if (reason !== null) {
            bill.status = "CANCELLED";
            bill.cancelReason = reason;
            await db.updateBill(bill);
            this.showToast(`ยกเลิกบิล #${bill.id} แล้ว`);
            modal.classList.remove("active");
            this.refreshJournalView();
            await this.updateTodayBillCountBadge();
          }
        };
      }
    }

    // Handle Print Bill
    const btnPrint = document.getElementById("btn-print-this-bill");
    if (btnPrint) {
      btnPrint.onclick = () => {
        this.printThermalReceipt(bill);
      };
    }

    modal.classList.add("active");
  }

  // ================= VIEW 3: End of Day & Accounting Pack =================

  setupEOD() {
    // Export bills CSV
    const btnBillsCSV = document.getElementById("btn-export-bills-csv");
    if (btnBillsCSV) {
      btnBillsCSV.addEventListener("click", () => {
        this.exportBillsCSV();
      });
    }

    // Export items CSV
    const btnItemsCSV = document.getElementById("btn-export-items-csv");
    if (btnItemsCSV) {
      btnItemsCSV.addEventListener("click", () => {
        this.exportItemsCSV();
      });
    }

    // Download Backup JSON
    const btnBackup = document.getElementById("btn-download-backup-json");
    if (btnBackup) {
      btnBackup.addEventListener("click", () => {
        this.downloadBackupJSON();
      });
    }

    // Print / PDF Report
    const btnPrintReport = document.getElementById("btn-print-eod-report");
    if (btnPrintReport) {
      btnPrintReport.addEventListener("click", () => {
        this.printDailyReport();
      });
    }

    // Mark as Sent button
    const btnMarkSent = document.getElementById("btn-mark-sent");
    if (btnMarkSent) {
      btnMarkSent.addEventListener("click", async () => {
        await this.markEODSent();
      });
    }
  }

  async checkEODStatus() {
    const isSent = await db.getSetting(`eod_sent_${this.todayStr}`, false);
    const sentTime = await db.getSetting(`eod_sent_time_${this.todayStr}`, null);
    const banner = document.getElementById("eod-status-banner");
    const icon = document.getElementById("eod-status-icon");
    const title = document.getElementById("eod-status-title");
    const subtitle = document.getElementById("eod-status-subtitle");
    const headerDot = document.getElementById("header-eod-status-dot");

    if (isSent) {
      if (banner) banner.classList.add("sent");
      if (icon) icon.textContent = "✅";
      if (title) title.textContent = "ส่งสำนักงานบัญชีแล้ว";
      if (subtitle) subtitle.textContent = `ส่งข้อมูลเรียบร้อยเมื่อ ${sentTime ? new Date(sentTime).toLocaleTimeString("th-TH") : ""}`;
      if (headerDot) headerDot.style.display = "inline-block";
    } else {
      if (banner) banner.classList.remove("sent");
      if (icon) icon.textContent = "⏳";
      if (title) title.textContent = "ยังไม่ได้ส่งสำนักงานบัญชี";
      if (subtitle) subtitle.textContent = "ตรวจยอดให้เรียบร้อยก่อนสร้างชุดส่งบัญชี";
      if (headerDot) headerDot.style.display = "none";
    }
  }

  async markEODSent() {
    sound.playSuccess();
    const now = new Date().toISOString();
    await db.setSetting(`eod_sent_${this.todayStr}`, true);
    await db.setSetting(`eod_sent_time_${this.todayStr}`, now);
    await this.checkEODStatus();
    this.showToast("บันทึกสถานะ 'ส่งสำนักงานบัญชีแล้ว' เรียบร้อย");
  }

  async refreshEODView() {
    const dateEl = document.getElementById("eod-summary-date");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
    }

    await this.checkEODStatus();

    const todayBills = await db.getBillsByDate(this.todayStr);
    let netTotal = 0;
    let cashTotal = 0;
    let qrTotal = 0;

    todayBills.forEach(b => {
      if (b.status === "COMPLETED") {
        netTotal += b.totalAmount;
        if (b.paymentMethod === "CASH") cashTotal += b.totalAmount;
        else qrTotal += b.totalAmount;
      }
    });

    const netEl = document.getElementById("eod-net-total");
    const cashEl = document.getElementById("eod-cash-total");
    const qrEl = document.getElementById("eod-qr-total");

    if (netEl) netEl.textContent = `${netTotal.toLocaleString()} ฿`;
    if (cashEl) cashEl.textContent = `${cashTotal.toLocaleString()} ฿`;
    if (qrEl) qrEl.textContent = `${qrTotal.toLocaleString()} ฿`;
  }

  // ================= CSV & Report Exports =================

  async exportBillsCSV() {
    const bills = await db.getBillsByDate(this.todayStr);
    if (bills.length === 0) {
      this.showToast("ไม่มีรายการบิลสำหรับส่งออก");
      return;
    }

    const headers = [
      "วันที่",
      "เวลา",
      "เลขที่บิล",
      "ชื่อออเดอร์",
      "วิธีชำระเงิน",
      "จำนวนรายการ",
      "ยอดรวม(บาท)",
      "ส่วนลด(บาท)",
      "ยอดสุทธิ(บาท)",
      "มีสลิปแนบ",
      "หมายเหตุ",
      "สถานะ"
    ];

    const rows = bills.map(b => [
      b.date,
      new Date(b.createdAt).toLocaleTimeString("th-TH"),
      b.id,
      `"${(b.orderNickname || "").replace(/"/g, '""')}"`,
      b.paymentMethod === "CASH" ? "เงินสด" : "สแกน QR",
      b.items.reduce((s, it) => s + it.qty, 0),
      b.subtotal || b.totalAmount,
      b.discount || 0,
      b.totalAmount,
      b.hasSlip ? "ใช่" : "ไม่ใช่",
      `"${(b.notes || "").replace(/"/g, '""')}"`,
      b.status === "COMPLETED" ? "ปกติ" : "ยกเลิก"
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    this.downloadFile(csvContent, `bills_${this.todayStr}.csv`, "text/csv;charset=utf-8;");
    this.showToast("ดาวน์โหลดรายการขาย CSV เรียบร้อย");
  }

  async exportItemsCSV() {
    const bills = await db.getBillsByDate(this.todayStr);
    if (bills.length === 0) {
      this.showToast("ไม่มีรายการสินค้าสำหรับส่งออก");
      return;
    }

    const headers = [
      "เลขที่บิล",
      "วันที่",
      "รหัสสินค้า",
      "ชื่อสินค้า",
      "สูตร/ขนาด",
      "หมวดหมู่",
      "จำนวน",
      "หน่วย",
      "ราคาต่อหน่วย(บาท)",
      "ส่วนลด(บาท)",
      "ยอดรวม(บาท)",
      "จัดของแล้ว"
    ];

    const rows = [];
    bills.forEach(b => {
      b.items.forEach(it => {
        rows.push([
          b.id,
          b.date,
          it.code || "-",
          `"${(it.name || "").replace(/"/g, '""')}"`,
          `"${(it.formula || "")} ${(it.size || "")}"`,
          it.category || "-",
          it.qty,
          it.unit || "ชิ้น",
          it.price,
          it.discount || 0,
          it.lineTotal,
          it.isPacked ? "ใช่" : "ไม่ใช่"
        ]);
      });
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    this.downloadFile(csvContent, `items_${this.todayStr}.csv`, "text/csv;charset=utf-8;");
    this.showToast("ดาวน์โหลดรายละเอียดสินค้า CSV เรียบร้อย");
  }

  async downloadBackupJSON() {
    const backupObj = await db.getFullBackup();
    const jsonStr = JSON.stringify(backupObj, null, 2);
    this.downloadFile(jsonStr, `petty_shop_backup_${this.todayStr}.json`, "application/json;charset=utf-8;");
    this.showToast("สำรองข้อมูลระบบ JSON เรียบร้อย");
  }

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ================= Print Thermal & A4 Daily Report =================

  printThermalReceipt(bill) {
    const printArea = document.getElementById("print-container");
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family:'Prompt', sans-serif; width:300px; margin:0 auto; padding:10px; font-size:12px; color:#000;">
        <div style="text-align:center; margin-bottom:8px;">
          <h2 style="font-size:16px; margin:0;">${this.settings.shopName || "PETTY SHOP"}</h2>
          <div>โทร. ${this.settings.shopPhone || "089-123-4567"}</div>
          <div>--------------------------------</div>
        </div>
        <div>เลขที่บิล: ${bill.id}</div>
        <div>วันที่: ${new Date(bill.createdAt).toLocaleDateString("th-TH")} ${new Date(bill.createdAt).toLocaleTimeString("th-TH")}</div>
        <div>ลูกค้า: ${bill.orderNickname || "ลูกค้าหน้าร้าน"}</div>
        <div>--------------------------------</div>
        <table style="width:100%; border-collapse:collapse; margin:6px 0;">
          ${bill.items.map(it => `
            <tr>
              <td>${it.name} x${it.qty}</td>
              <td style="text-align:right;">${it.lineTotal} บ.</td>
            </tr>
          `).join("")}
        </table>
        <div>--------------------------------</div>
        ${bill.discount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>ส่วนลด:</span><span>-${bill.discount} บ.</span></div>` : ""}
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14px; margin-top:4px;">
          <span>ยอดสุทธิ:</span>
          <span>${bill.totalAmount} บาท</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>วิธีชำระ:</span>
          <span>${bill.paymentMethod === "CASH" ? "เงินสด" : "สแกน QR"}</span>
        </div>
        ${bill.paymentMethod === "CASH" ? `
          <div style="display:flex; justify-content:space-between;"><span>รับเงิน:</span><span>${bill.cashReceived} บ.</span></div>
          <div style="display:flex; justify-content:space-between;"><span>เงินทอน:</span><span>${bill.changeAmount} บ.</span></div>
        ` : ""}
        <div style="text-align:center; margin-top:12px;">
          <div>${this.settings.receiptFooter || "ขอบคุณที่อุดหนุนค่ะ"}</div>
        </div>
      </div>
    `;

    window.print();
  }

  async printDailyReport() {
    const bills = await db.getBillsByDate(this.todayStr);
    const shopName = this.settings.shopName || "PETTY SHOP (ร้านเพ็ทตี้ ช็อป)";
    let totalSales = 0;
    let cashSales = 0;
    let qrSales = 0;
    let cancelledCount = 0;

    bills.forEach(b => {
      if (b.status === "COMPLETED") {
        totalSales += b.totalAmount;
        if (b.paymentMethod === "CASH") cashSales += b.totalAmount;
        else qrSales += b.totalAmount;
      } else {
        cancelledCount++;
      }
    });

    const printArea = document.getElementById("print-container");
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family:'Prompt', sans-serif; max-width:800px; margin:20px auto; padding:20px; color:#222;">
        <div style="border-bottom:2px solid #1E4D38; padding-bottom:12px; margin-bottom:16px;">
          <h2 style="color:#1E4D38; margin:0 0 4px 0;">ใบสรุปยอดขายประจำวัน (ส่งสำนักงานบัญชี)</h2>
          <div style="font-size:14px;"><strong>ชื่อสถานประกอบการ:</strong> ${shopName}</div>
          <div style="font-size:14px;"><strong>ประจำวันที่:</strong> ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <tr style="background-color:#F5EFE6;">
            <th style="padding:10px; border:1px solid #CCC; text-align:left;">รายการสรุป</th>
            <th style="padding:10px; border:1px solid #CCC; text-align:right;">จำนวน/ยอดเงิน</th>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #CCC;">จำนวนบิลขายสำเร็จทั้งหมด</td>
            <td style="padding:8px; border:1px solid #CCC; text-align:right;">${bills.filter(b => b.status === "COMPLETED").length} บิล</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #CCC;">ยอดขายเงินสด (นำเข้าลิ้นชัก)</td>
            <td style="padding:8px; border:1px solid #CCC; text-align:right; font-weight:bold;">${cashSales.toLocaleString()} บาท</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #CCC;">ยอดสแกน QR / เงินโอนเข้าบัญชี</td>
            <td style="padding:8px; border:1px solid #CCC; text-align:right; font-weight:bold;">${qrSales.toLocaleString()} บาท</td>
          </tr>
          ${cancelledCount > 0 ? `
            <tr>
              <td style="padding:8px; border:1px solid #CCC; color:#C00;">รายการยกเลิก/คืนเงิน</td>
              <td style="padding:8px; border:1px solid #CCC; text-align:right; color:#C00;">${cancelledCount} บิล</td>
            </tr>
          ` : ""}
          <tr style="background-color:#EAF4EE; font-size:16px; font-weight:bold;">
            <td style="padding:10px; border:1px solid #CCC; color:#1E4D38;">ยอดขายสุทธิประจำวัน</td>
            <td style="padding:10px; border:1px solid #CCC; text-align:right; color:#1E4D38;">${totalSales.toLocaleString()} บาท</td>
          </tr>
        </table>

        <h4 style="margin:16px 0 8px 0;">รายการบิลทั้งหมดของวันนี้:</h4>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background-color:#F0F0F0;">
              <th style="border:1px solid #CCC; padding:6px;">เวลา</th>
              <th style="border:1px solid #CCC; padding:6px;">เลขที่บิล</th>
              <th style="border:1px solid #CCC; padding:6px;">ลูกค้า</th>
              <th style="border:1px solid #CCC; padding:6px;">วิธีชำระ</th>
              <th style="border:1px solid #CCC; padding:6px; text-align:right;">ยอดสุทธิ</th>
              <th style="border:1px solid #CCC; padding:6px;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${bills.map(b => `
              <tr>
                <td style="border:1px solid #CCC; padding:6px; text-align:center;">${new Date(b.createdAt).toLocaleTimeString("th-TH")}</td>
                <td style="border:1px solid #CCC; padding:6px; text-align:center;">${b.id}</td>
                <td style="border:1px solid #CCC; padding:6px;">${b.orderNickname || "-"}</td>
                <td style="border:1px solid #CCC; padding:6px; text-align:center;">${b.paymentMethod === "CASH" ? "เงินสด" : "QR"}</td>
                <td style="border:1px solid #CCC; padding:6px; text-align:right; font-weight:bold;">${b.totalAmount.toLocaleString()} ฿</td>
                <td style="border:1px solid #CCC; padding:6px; text-align:center;">${b.status === "COMPLETED" ? "ปกติ" : "ยกเลิก"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="margin-top:40px; display:flex; justify-content:space-between;">
          <div style="text-align:center;">
            <div>ลงชื่อ ....................................................</div>
            <div style="margin-top:4px;">( ผู้ตรวจนับเงินสดหน้าร้าน )</div>
          </div>
          <div style="text-align:center;">
            <div>ลงชื่อ ....................................................</div>
            <div style="margin-top:4px;">( ผู้ตรวจสอบ / เจ้าของร้าน )</div>
          </div>
        </div>
      </div>
    `;

    window.print();
  }

  // ================= VIEW 4: Catalog & Settings =================

  setupCatalogSettings() {
    // Subtabs switcher
    const tabBtns = document.querySelectorAll(".settings-tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const subtabId = btn.getAttribute("data-subtab");
        document.querySelectorAll(".subtab-content").forEach(c => c.style.display = "none");
        const target = document.getElementById(subtabId);
        if (target) target.style.display = "block";
        sound.playTap();
      });
    });

    // Save Shop & PromptPay Settings
    const btnSaveShop = document.getElementById("btn-save-settings");
    if (btnSaveShop) {
      btnSaveShop.addEventListener("click", async () => {
        const name = document.getElementById("setting-shop-name")?.value.trim();
        const ppId = document.getElementById("setting-promptpay-id")?.value.trim();
        const ppName = document.getElementById("setting-promptpay-name")?.value.trim();
        const footer = document.getElementById("setting-receipt-footer")?.value.trim();

        if (name) await db.setSetting("shopName", name);
        if (ppId) await db.setSetting("promptPayId", ppId);
        if (ppName) await db.setSetting("promptPayName", ppName);
        if (footer) await db.setSetting("receiptFooter", footer);

        await this.loadSettings();
        sound.playSuccess();
        this.showToast("บันทึกการตั้งค่าร้านและพร้อมเพย์แล้ว");
      });
    }

    // Catalog search
    const catSearch = document.getElementById("catalog-filter-search");
    if (catSearch) {
      catSearch.addEventListener("input", () => {
        this.renderCatalogTable();
      });
    }

    // Add Product Modal
    const btnAddProd = document.getElementById("btn-open-add-product");
    if (btnAddProd) {
      btnAddProd.addEventListener("click", () => {
        this.openProductFormModal(null);
      });
    }

    // Cancel Product Form
    const btnCancelProd = document.getElementById("btn-cancel-product-form");
    if (btnCancelProd) {
      btnCancelProd.addEventListener("click", () => {
        document.getElementById("product-form-modal").classList.remove("active");
      });
    }

    // Save Product Form
    const btnSaveProd = document.getElementById("btn-save-product-submit");
    if (btnSaveProd) {
      btnSaveProd.addEventListener("click", async () => {
        await this.handleSaveProductSubmit();
      });
    }

    // Reset Default Catalog
    const btnResetCat = document.getElementById("btn-reset-catalog-default");
    if (btnResetCat) {
      btnResetCat.addEventListener("click", async () => {
        if (confirm("ต้องการรีเซ็ตสินค้าในสมุดเป็นชุดตัวอย่างเริ่มต้นหรือไม่?")) {
          await db.resetProductsToDefault();
          await this.loadProducts();
          this.renderCatalogTable();
          this.renderCatalog();
          sound.playSuccess();
          this.showToast("รีเซ็ตสมุดสินค้าเป็นชุดตัวอย่างแล้ว");
        }
      });
    }

    // Export Catalog CSV
    const btnExportCat = document.getElementById("btn-export-catalog-csv");
    if (btnExportCat) {
      btnExportCat.addEventListener("click", () => {
        this.exportCatalogCSV();
      });
    }

    // Import Catalog CSV
    const inputImportCat = document.getElementById("input-import-catalog-csv");
    if (inputImportCat) {
      inputImportCat.addEventListener("change", (e) => {
        this.handleImportCatalogCSV(e);
      });
    }
  }

  renderCatalogTable() {
    const tbody = document.getElementById("catalog-table-body");
    if (!tbody) return;

    const query = document.getElementById("catalog-filter-search")?.value.trim().toLowerCase() || "";
    let list = this.products;

    if (query) {
      list = list.filter(p => {
        const str = `${p.name} ${p.code} ${p.nicknames || ""} ${p.category}`.toLowerCase();
        return str.includes(query);
      });
    }

    tbody.innerHTML = "";
    list.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.code}</strong></td>
        <td>
          <div style="font-weight:600;">${p.name}</div>
          <small style="color:var(--color-text-muted);">${p.formula || ""} ${p.nicknames ? `• [${p.nicknames}]` : ""}</small>
        </td>
        <td>${p.category}</td>
        <td>${p.size || "-"} / ${p.unit || "ชิ้น"}</td>
        <td>
          <input type="number" class="form-input inline-price-input" data-id="${p.id}" value="${p.price}" style="width:90px; height:32px; padding:2px 8px; font-weight:700;">
        </td>
        <td>
          <input type="checkbox" class="chk-toggle-fav" data-id="${p.id}" ${p.isFavorite ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--color-accent);">
        </td>
        <td>
          <input type="checkbox" class="chk-toggle-rec" data-id="${p.id}" ${p.isRecommended ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--color-primary);">
        </td>
        <td>
          <button type="button" class="btn-table-action btn-toggle-active" data-id="${p.id}" style="padding:2px 8px; font-size:0.75rem;">
            ${p.isActive !== false ? "🟢 แสดง" : "⚪ ซ่อน"}
          </button>
        </td>
        <td>
          <div style="display:flex; gap:4px;">
            <button type="button" class="btn-table-action btn-edit-p" data-id="${p.id}">✏️</button>
            <button type="button" class="btn-order-action danger btn-del-p" data-id="${p.id}">🗑️</button>
          </div>
        </td>
      `;

      // Inline price edit
      const priceInput = tr.querySelector(".inline-price-input");
      priceInput.addEventListener("change", async (e) => {
        const newPrice = parseFloat(e.target.value) || p.price;
        p.price = newPrice;
        await db.saveProduct(p);
        this.showToast(`อัปเดตราคา ${p.name} เป็น ${newPrice} บ.`);
        this.renderCatalog();
      });

      // Toggle fav
      const favChk = tr.querySelector(".chk-toggle-fav");
      favChk.addEventListener("change", async (e) => {
        p.isFavorite = e.target.checked;
        await db.saveProduct(p);
        this.renderCatalog();
      });

      // Toggle rec
      const recChk = tr.querySelector(".chk-toggle-rec");
      recChk.addEventListener("change", async (e) => {
        p.isRecommended = e.target.checked;
        await db.saveProduct(p);
        this.renderCatalog();
      });

      // Toggle active / hidden
      const btnActive = tr.querySelector(".btn-toggle-active");
      btnActive.addEventListener("click", async () => {
        p.isActive = !(p.isActive !== false);
        await db.saveProduct(p);
        this.renderCatalogTable();
        this.renderCatalog();
      });

      // Edit modal
      tr.querySelector(".btn-edit-p").addEventListener("click", () => {
        this.openProductFormModal(p);
      });

      // Delete product
      tr.querySelector(".btn-del-p").addEventListener("click", async () => {
        if (confirm(`ต้องการลบสินค้า "${p.name}" ออกจากสมุดหรือไม่?`)) {
          await db.deleteProduct(p.id);
          await this.loadProducts();
          this.renderCatalogTable();
          this.renderCatalog();
          this.showToast("ลบสินค้าแล้ว");
        }
      });

      tbody.appendChild(tr);
    });
  }

  openProductFormModal(product = null) {
    const modal = document.getElementById("product-form-modal");
    const titleEl = document.getElementById("product-form-title");

    if (product) {
      titleEl.textContent = `✏️ แก้ไขสินค้า: ${product.name}`;
      document.getElementById("form-product-id").value = product.id;
      document.getElementById("form-product-code").value = product.code || "";
      document.getElementById("form-product-name").value = product.name || "";
      document.getElementById("form-product-nicknames").value = product.nicknames || "";
      document.getElementById("form-product-category").value = product.category || "อาหารแมว";
      document.getElementById("form-product-formula").value = product.formula || "";
      document.getElementById("form-product-price").value = product.price || "";
      document.getElementById("form-product-cheatsheet").value = product.cheatSheet || "";
      document.getElementById("form-product-pairs").value = product.pairSuggestion || "";
      document.getElementById("form-product-fav").checked = !!product.isFavorite;
      document.getElementById("form-product-rec").checked = !!product.isRecommended;
    } else {
      titleEl.textContent = "➕ เพิ่มสินค้าใหม่ในสมุด";
      document.getElementById("product-edit-form").reset();
      document.getElementById("form-product-id").value = "";
      document.getElementById("form-product-code").value = `PROD-${Date.now().toString().slice(-4)}`;
    }

    modal.classList.add("active");
  }

  async handleSaveProductSubmit() {
    const id = document.getElementById("form-product-id").value;
    const code = document.getElementById("form-product-code").value.trim();
    const name = document.getElementById("form-product-name").value.trim();
    const nicknames = document.getElementById("form-product-nicknames").value.trim();
    const category = document.getElementById("form-product-category").value;
    const formula = document.getElementById("form-product-formula").value.trim();
    const price = parseFloat(document.getElementById("form-product-price").value) || 0;
    const cheatSheet = document.getElementById("form-product-cheatsheet").value.trim();
    const pairSuggestion = document.getElementById("form-product-pairs").value.trim();
    const isFavorite = document.getElementById("form-product-fav").checked;
    const isRecommended = document.getElementById("form-product-rec").checked;

    if (!code || !name) {
      alert("กรุณากรอกรหัสและชื่อสินค้า");
      return;
    }

    const prodObj = {
      id: id || ("prod_" + Date.now()),
      code,
      name,
      nicknames,
      category,
      formula,
      price,
      cheatSheet,
      pairSuggestion,
      isFavorite,
      isRecommended,
      isActive: true,
      unit: "ถุง"
    };

    await db.saveProduct(prodObj);
    await this.loadProducts();
    this.renderCatalogTable();
    this.renderCatalog();

    document.getElementById("product-form-modal").classList.remove("active");
    sound.playSuccess();
    this.showToast(`บันทึกสินค้า "${name}" แล้ว`);
  }

  exportCatalogCSV() {
    const headers = [
      "รหัสสินค้า",
      "ชื่อสินค้า",
      "ชื่อเรียก_คำค้นหา",
      "หมวดหมู่",
      "ยี่ห้อ",
      "สูตร",
      "ขนาด",
      "หน่วย",
      "ราคาขาย",
      "ขายบ่อย",
      "เจ๊แนะนำ",
      "ข้อมูลแนะนำสั้นๆ",
      "สินค้าคู่กัน"
    ];

    const rows = this.products.map(p => [
      p.code,
      `"${(p.name || "").replace(/"/g, '""')}"`,
      `"${(p.nicknames || "").replace(/"/g, '""')}"`,
      p.category,
      p.brand || "",
      `"${(p.formula || "").replace(/"/g, '""')}"`,
      p.size || "",
      p.unit || "ชิ้น",
      p.price,
      p.isFavorite ? "1" : "0",
      p.isRecommended ? "1" : "0",
      `"${(p.cheatSheet || "").replace(/"/g, '""')}"`,
      `"${(p.pairSuggestion || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    this.downloadFile(csvContent, "petty_shop_catalog.csv", "text/csv;charset=utf-8;");
    this.showToast("ส่งออกสมุดสินค้า CSV เรียบร้อย");
  }

  handleImportCatalogCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) throw new Error("ไฟล์ไม่มีข้อมูล");

        // Simple CSV parser
        const newProducts = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 2 && cols[1]) {
            newProducts.push({
              id: "prod_imp_" + Date.now() + "_" + i,
              code: cols[0] || `P-${i}`,
              name: cols[1],
              nicknames: cols[2] || "",
              category: cols[3] || "อาหารแมว",
              brand: cols[4] || "",
              formula: cols[5] || "",
              size: cols[6] || "",
              unit: cols[7] || "ชิ้น",
              price: parseFloat(cols[8]) || 0,
              isFavorite: cols[9] === "1",
              isRecommended: cols[10] === "1",
              cheatSheet: cols[11] || "",
              pairSuggestion: cols[12] || "",
              isActive: true
            });
          }
        }

        if (newProducts.length > 0) {
          await db.bulkImportProducts(newProducts);
          await this.loadProducts();
          this.renderCatalogTable();
          this.renderCatalog();
          this.showToast(`นำเข้าสำเร็จ ${newProducts.length} รายการ`);
        }
      } catch (err) {
        alert("เกิดข้อผิดพลาดในการนำเข้า CSV: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ================= Toast Utility =================

  showToast(message, icon = "🐾") {
    const toast = document.getElementById("app-toast");
    const msgEl = document.getElementById("toast-message");
    const iconEl = document.getElementById("toast-icon");

    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    toast.classList.add("show");
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }
}

// Instantiate and start app on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new PettyShopApp();
  window.pettyApp = app;
  app.init().catch(err => console.error("PETTY SHOP Init failed:", err));
});
