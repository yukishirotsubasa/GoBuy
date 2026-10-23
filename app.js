(() => {
  'use strict';

  const STORAGE_KEY = 'goubuy-calculator-v1';
  const CURRENCIES = {
    EUR: { name: '歐元', symbol: '€' },
    USD: { name: '美元', symbol: '$' },
    CHF: { name: '瑞士法郎', symbol: 'CHF' },
  };
  const DEFAULT_PRODUCTS = [
    ['護手霜', 1.95], ['百靈油 100ml', 28.19], ['百靈油 25ml', 8.19], ['百靈油 10ml', 5.80],
    ['魚油', 40.99], ['葉黃素', 9.95], ['肝膽茶', 0.70], ['發泡錠｜綜合維他命', 0.50],
    ['發泡錠｜礦物質', 0.50], ['發泡錠｜增加免疫力', 1.25], ['發泡錠｜B12', 0.50],
    ['發泡錠｜鎂', 0.50], ['發泡錠｜鋅', 0.95], ['發泡錠｜鐵', 0.50], ['發泡錠｜鈣', 0.50], ['洗碗機錠', 2.95],
  ].map(([name, purchasePrice]) => ({ name, purchasePrice, currency: 'EUR', quotePrice: 0 }));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = (value, digits = 2) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(value) || 0);
  const twd = (value) => Math.ceil((Number(value) || 0) - Number.EPSILON);
  const id = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const rates = { EUR: Number(saved.rates?.EUR) || 0, USD: Number(saved.rates?.USD) || 0, CHF: Number(saved.rates?.CHF) || 0 };
      // Migrate the previous single-rate setting to its original default currency.
      if (!rates.EUR && !rates.USD && !rates.CHF && Number(saved.rate) > 0) rates.USD = Number(saved.rate);
      const products = Array.isArray(saved.products) ? saved.products.map((product) => ({
        id: product.id || id(), name: String(product.name || ''), currency: CURRENCIES[product.currency] ? product.currency : 'USD',
        purchasePrice: Math.max(0, Number(product.purchasePrice) || 0), quotePrice: Math.max(0, Number(product.quotePrice) || 0),
      })) : DEFAULT_PRODUCTS.map((product) => ({ ...product, id: id() }));
      const orders = Array.isArray(saved.orders) ? saved.orders.map((order) => ({
        id: order.id || id(), name: typeof order.name === 'string' ? order.name : '',
        items: Array.isArray(order.items) ? order.items.map((item) => ({ productId: item.productId || '', quantity: Math.max(1, Number(item.quantity) || 1) })) : [],
      })) : [];
      return { rates, products, orders };
    } catch { return { rates: { EUR: 0, USD: 0, CHF: 0 }, products: [], orders: [] }; }
  }

  const state = loadState();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { toast('儲存失敗，請檢查裝置儲存空間'); }
  }
  function toast(message) {
    const element = $('#toast'); element.textContent = message; element.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
  }
  let previewUrl = '';
  function showImagePreview(blob, fileName) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $('#order-image-preview').src = previewUrl;
    $('#download-order-image').href = previewUrl;
    $('#download-order-image').download = fileName;
    $('#download-order-image').textContent = /Line\//i.test(navigator.userAgent) || /LINE/i.test(navigator.userAgent)
      ? '在 LINE 中無法直接存檔？點此開啟圖片'
      : '下載圖片';
    $('#image-preview').hidden = false;
    $('#close-preview').focus();
  }
  function closeImagePreview() {
    $('#image-preview').hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
  function productById(productId) { return state.products.find((product) => product.id === productId); }
  function totals(order) {
    return order.items.reduce((result, item) => {
      const product = productById(item.productId); if (!product) return result;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const costPrice = (Number(product.purchasePrice) || 0) * (state.rates[product.currency] || 0);
      result.cost += costPrice * quantity;
      result.quote += (product.quotePrice > 0 ? Number(product.quotePrice) : costPrice) * quantity;
      result.quantity += quantity;
      return result;
    }, { cost: 0, quote: 0, quantity: 0 });
  }
  function quantityLabel(order) {
    const quantity = totals(order).quantity;
    return `${money(quantity, 0)} 件`;
  }
  function renderRates() {
    $('#rate-rows').innerHTML = Object.entries(CURRENCIES).map(([code, currency]) => `
      <tr><th scope="row"><span class="currency-display"><strong>${currency.symbol}</strong><span><b>${currency.name}</b><small>${code}</small></span></span></th>
      <td><label class="sr-only" for="rate-${code}">${currency.name}兌新台幣匯率</label><input class="table-input rate-input" id="rate-${code}" data-currency="${code}" type="number" inputmode="decimal" min="0" step="0.0001" value="${state.rates[code] || ''}" placeholder="0.00" /></td></tr>`).join('');
  }
  function renderProducts() {
    const rows = $('#product-rows');
    if (!state.products.length) {
      rows.innerHTML = '<tr><td colspan="4" class="table-empty">尚無商品，點下方按鈕新增。</td></tr>'; return;
    }
    rows.innerHTML = state.products.map((product) => `<tr data-product-id="${escapeHtml(product.id)}">
      <td><label class="sr-only" for="name-${escapeHtml(product.id)}">商品名稱</label><input class="table-input product-name" id="name-${escapeHtml(product.id)}" maxlength="50" value="${escapeHtml(product.name)}" placeholder="商品名稱" /></td>
      <td><label class="sr-only" for="currency-${escapeHtml(product.id)}">購買價格貨幣</label><select class="table-input product-currency" id="currency-${escapeHtml(product.id)}" aria-label="購買價格貨幣">${Object.entries(CURRENCIES).map(([code, currency]) => `<option value="${code}" ${code === product.currency ? 'selected' : ''}>${currency.symbol} ${currency.name}</option>`).join('')}</select></td>
      <td><label class="sr-only" for="purchase-${escapeHtml(product.id)}">購買單價，${CURRENCIES[product.currency].name}</label><div class="table-price-input"><span>${CURRENCIES[product.currency].symbol}</span><input class="table-input product-purchase" id="purchase-${escapeHtml(product.id)}" type="number" inputmode="decimal" min="0" step="0.01" value="${product.purchasePrice || ''}" placeholder="0" /></div></td>
      <td><label class="sr-only" for="quote-${escapeHtml(product.id)}">出單單價，新台幣；留白使用自動換算價</label><div class="quote-editor"><div class="table-price-input"><span>NT$</span><input class="table-input product-quote" id="quote-${escapeHtml(product.id)}" type="number" inputmode="numeric" min="0" step="1" value="${product.quotePrice || ''}" placeholder="自動" /></div><span class="auto-quote">自動 NT$ ${money(twd((Number(product.purchasePrice) || 0) * (state.rates[product.currency] || 0)), 0)}</span></div></td>
      <td><button class="icon-button delete-product" type="button" aria-label="刪除 ${escapeHtml(product.name || '商品')}" title="刪除商品">×</button></td></tr>`).join('');
  }
  function productOptions(selectedId) {
    if (!state.products.length) return '<option value="">請先新增商品</option>';
    return `<option value="">選擇商品</option>${state.products.map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === selectedId ? 'selected' : ''}>${escapeHtml(product.name || '未命名商品')}（${CURRENCIES[product.currency].symbol}）</option>`).join('')}`;
  }
  function orderCard(order) {
    const { cost, quote } = totals(order);
    const rows = order.items.map((item, index) => {
      const product = productById(item.productId);
      const unitPrice = product ? twd(product.quotePrice > 0 ? product.quotePrice : (Number(product.purchasePrice) || 0) * (state.rates[product.currency] || 0)) : 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      return `<div class="order-item" data-index="${index}"><select class="item-select" aria-label="商品">${productOptions(item.productId)}</select><div class="quantity-control"><button class="quantity-step quantity-decrease" type="button" aria-label="減少數量">−</button><input class="qty-input" type="number" inputmode="numeric" min="1" step="1" value="${quantity}" aria-label="數量" /><button class="quantity-step quantity-increase" type="button" aria-label="增加數量">＋</button></div><span class="item-unit">${product ? `NT$ ${money(unitPrice, 0)} / 件 × ${quantity} 件 = NT$ ${money(unitPrice * quantity, 0)}` : '選擇商品'}</span><button class="icon-button remove-row" type="button" aria-label="移除此商品列" title="移除品項">×</button></div>`;
    }).join('');
    return `<article class="order-card" data-order-id="${escapeHtml(order.id)}"><div class="order-card-top"><div class="order-title-row"><input class="order-name-input" maxlength="40" value="${escapeHtml(order.name)}" placeholder="買家名稱（例如：小美）" aria-label="買家名稱" /><button class="icon-button remove-order" type="button" aria-label="刪除訂單" title="刪除訂單">···</button></div></div><div class="order-body">${rows || '<div class="empty-inline">先加入這位買家要買的商品。</div>'}<button class="add-item" type="button">＋ 加入商品</button></div><div class="order-summary"><div class="summary-line"><span>總數量</span><strong>${quantityLabel(order)}</strong></div><div class="summary-line summary-total"><span>訂單總額</span><strong>NT$ ${money(twd(quote), 0)}</strong></div></div><div class="order-actions"><button class="button button-outline screenshot-order" type="button">▧　存成訂單圖片</button></div></article>`;
  }
  function renderOrders() {
    const list = $('#orders-list');
    list.innerHTML = state.orders.length ? state.orders.map(orderCard).join('') : '<div class="empty-state"><div class="empty-illustration">✳</div><strong>還沒有買家訂單</strong><p>點「新增訂單」，開始幫第一位買家計算。</p></div>';
  }
  function render() { renderRates(); renderProducts(); renderOrders(); }
  function updateCard(card) {
    const order = state.orders.find((entry) => entry.id === card.dataset.orderId); if (!order) return;
    const { quote } = totals(order); const lines = $$('.summary-line strong', card);
    lines[0].textContent = quantityLabel(order); lines[1].textContent = `NT$ ${money(twd(quote), 0)}`;
  }

  $('#rate-rows').addEventListener('input', (event) => {
    if (!event.target.matches('.rate-input')) return;
    state.rates[event.target.dataset.currency] = Math.max(0, Number(event.target.value) || 0); save(); renderProducts(); renderOrders();
  });
  $('#add-product').addEventListener('click', () => {
    const product = { id: id(), name: '', currency: 'EUR', purchasePrice: 0, quotePrice: 0 };
    state.products.push(product); save(); renderProducts(); renderOrders();
    const input = $(`#name-${CSS.escape(product.id)}`); input?.focus(); input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#product-rows').addEventListener('input', (event) => {
    const row = event.target.closest('tr[data-product-id]'); if (!row) return;
    const product = productById(row.dataset.productId); if (!product) return;
    if (event.target.matches('.product-name')) product.name = event.target.value;
    if (event.target.matches('.product-purchase')) product.purchasePrice = Math.max(0, Number(event.target.value) || 0);
    if (event.target.matches('.product-quote')) product.quotePrice = Math.max(0, Number(event.target.value) || 0);
    save(); if (!event.target.matches('.product-name')) renderOrders();
  });
  $('#product-rows').addEventListener('change', (event) => {
    if (!event.target.matches('.product-currency')) return;
    const row = event.target.closest('tr[data-product-id]');
    const product = productById(row.dataset.productId);
    product.currency = CURRENCIES[event.target.value] ? event.target.value : 'USD';
    save(); renderProducts(); renderOrders();
  });
  $('#product-rows').addEventListener('click', (event) => {
    const button = event.target.closest('.delete-product'); if (!button) return;
    const row = button.closest('tr'); state.products = state.products.filter((product) => product.id !== row.dataset.productId);
    save(); renderProducts(); renderOrders(); toast('商品已刪除');
  });
  $('#add-order').addEventListener('click', () => {
    state.orders.unshift({ id: id(), name: '', items: [] }); save(); renderOrders();
    $('.order-name-input', $('#orders-list')).focus(); window.scrollTo({ top: $('#orders-list').offsetTop - 15, behavior: 'smooth' });
  });
  $('#orders-list').addEventListener('input', (event) => {
    const card = event.target.closest('.order-card'); if (!card) return;
    const order = state.orders.find((entry) => entry.id === card.dataset.orderId);
    if (event.target.matches('.order-name-input')) order.name = event.target.value;
    if (event.target.matches('.qty-input')) {
      const item = order.items[Number(event.target.closest('.order-item').dataset.index)];
      item.quantity = Math.max(1, Number(event.target.value) || 1); event.target.value = item.quantity; updateCard(card);
      const product = productById(item.productId);
      const unitPrice = product ? twd(product.quotePrice > 0 ? product.quotePrice : (Number(product.purchasePrice) || 0) * (state.rates[product.currency] || 0)) : 0;
      $('.item-unit', event.target.closest('.order-item')).textContent = product ? `NT$ ${money(unitPrice, 0)} / 件 × ${item.quantity} 件 = NT$ ${money(unitPrice * item.quantity, 0)}` : '選擇商品';
    }
    save();
  });
  $('#orders-list').addEventListener('focusin', (event) => {
    if (event.target.matches('.qty-input')) event.target.select();
  });
  $('#orders-list').addEventListener('change', (event) => {
    if (!event.target.matches('.item-select')) return;
    const card = event.target.closest('.order-card'); const order = state.orders.find((entry) => entry.id === card.dataset.orderId);
    order.items[Number(event.target.closest('.order-item').dataset.index)].productId = event.target.value; save(); renderOrders();
  });
  $('#orders-list').addEventListener('click', async (event) => {
    const card = event.target.closest('.order-card'); if (!card) return;
    const order = state.orders.find((entry) => entry.id === card.dataset.orderId);
    const stepButton = event.target.closest('.quantity-step');
    if (stepButton) {
      const row = stepButton.closest('.order-item');
      const item = order.items[Number(row.dataset.index)];
      item.quantity = Math.max(1, item.quantity + (stepButton.classList.contains('quantity-increase') ? 1 : -1));
      save(); renderOrders();
    } else if (event.target.closest('.add-item')) {
      order.items.push({ productId: state.products[0]?.id || '', quantity: 1 }); save(); renderOrders();
      const rows = $$('.order-item', $('#orders-list')).filter((row) => row.closest('.order-card')?.dataset.orderId === order.id);
      $('.item-select', rows[rows.length - 1])?.focus();
    } else if (event.target.closest('.remove-row')) {
      order.items.splice(Number(event.target.closest('.order-item').dataset.index), 1); save(); renderOrders();
    } else if (event.target.closest('.remove-order')) {
      state.orders = state.orders.filter((entry) => entry.id !== order.id); save(); renderOrders(); toast('訂單已刪除');
    } else if (event.target.closest('.screenshot-order')) await saveOrderImage(card, order);
  });
  $('#close-preview').addEventListener('click', closeImagePreview);
  $('#image-preview').addEventListener('click', (event) => {
    if (event.target.matches('[data-close-preview]')) closeImagePreview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#image-preview').hidden) closeImagePreview();
  });
  function invoiceMarkup(order) {
    const entries = order.items.map((item) => {
      const product = productById(item.productId);
      if (!product) return null;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = twd(product.quotePrice > 0 ? product.quotePrice : (Number(product.purchasePrice) || 0) * (state.rates[product.currency] || 0));
      return { name: product.name || '商品', quantity, unitPrice, subtotal: unitPrice * quantity };
    }).filter(Boolean);
    const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const total = twd(entries.reduce((sum, entry) => sum + entry.subtotal, 0));
    return `<section class="invoice-sheet"><div class="invoice-buyer"><span>買家</span><strong>${escapeHtml(order.name.trim() || '未命名買家')}</strong></div><table class="invoice-table"><thead><tr><th>商品</th><th>單價</th><th>數量</th><th>小計</th></tr></thead><tbody>${entries.length ? entries.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>NT$ ${money(entry.unitPrice, 0)}</td><td>${entry.quantity} 件</td><td>NT$ ${money(entry.subtotal, 0)}</td></tr>`).join('') : '<tr><td colspan="4" class="invoice-empty">尚未加入商品</td></tr>'}</tbody><tfoot><tr><td></td><td></td><td class="invoice-quantity-total"><span>總數量</span><strong>${totalQuantity} 件</strong></td><td class="invoice-money-total"><span>總金額</span><strong>NT$ ${money(total, 0)}</strong></td></tr></tfoot></table></section>`;
  }

  async function saveOrderImage(card, order) {
    const button = $('.screenshot-order', card); button.disabled = true; const originalText = button.textContent;
    button.textContent = '圖片製作中…';
    const invoice = document.createElement('div'); invoice.className = 'invoice-capture'; invoice.innerHTML = invoiceMarkup(order); document.body.append(invoice);
    try {
      const [{ default: html2canvas }] = await Promise.all([import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')]);
      const canvas = await html2canvas(invoice.firstElementChild, { backgroundColor: '#ffffff', scale: Math.max(2, window.devicePixelRatio || 1), useCORS: true, logging: false });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('PNG encoding failed');
      const safeName = (order.name.trim() || '買家訂單').replace(/[\\/:*?"<>|]/g, '-');
      const file = new File([blob], `${safeName}-代購訂單.png`, { type: 'image/png' });
      const isLineBrowser = /Line\//i.test(navigator.userAgent) || /LINE/i.test(navigator.userAgent);
      const canShareFile = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: `${safeName}的代購訂單` });
          toast('已開啟系統分享，可儲存圖片');
        } catch (shareError) {
          if (shareError.name === 'AbortError') {
            toast('已取消分享');
          } else {
            console.warn('System image sharing unavailable; showing image preview.', shareError);
            showImagePreview(blob, file.name);
          }
        }
      } else if (isLineBrowser) {
        showImagePreview(blob, file.name);
      } else {
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已送出圖片下載；若未出現，請查看瀏覽器下載項目');
      }
    } catch (error) {
      console.error(error);
      toast(navigator.onLine ? '圖片製作失敗，請再試一次' : '存圖需要網路，請連線後再試');
    }
    finally { invoice.remove(); button.disabled = false; button.textContent = originalText; }
  }
  render();
})();
