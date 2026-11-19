(() => {
  'use strict';

  // Informe o número da loja com código do país e DDD, usando apenas dígitos.
  const STORE_WHATSAPP = '5551997259201';
  const STORAGE_KEY = 'acai-dos-deuses-cart-v1';
  const MAX_QUANTITY = 99;
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const categories = {
    mix: { title: 'Copo com adicionais', prices: { 300: 1200, 400: 1500, 500: 1800 } },
    pure: { title: 'Açaí puro', prices: { 300: 1400, 400: 1800, 500: 2000 } },
  };
  const toppings = [
    { id: 'condensado', name: 'Leite condensado', price: 0 },
    { id: 'leite-em-po', name: 'Leite em pó', price: 0 },
    { id: 'granola', name: 'Granola', price: 0 },
    { id: 'pacoca', name: 'Paçoca', price: 0 },
    { id: 'banana', name: 'Banana', price: 0 },
    { id: 'morango', name: 'Morango', price: 300 },
    { id: 'bis', name: 'Bis', price: 200 },
    { id: 'mousse', name: 'Mousse', price: 300 },
    { id: 'leitinho', name: 'Creme Leitinho', price: 400 },
    { id: 'avela', name: 'Creme de avelã', price: 350 },
    { id: 'ovomaltine', name: 'Ovomaltine', price: 300 },
    { id: 'amendoim', name: 'Amendoim triturado', price: 200 },
  ];

  const productDialog = document.querySelector('#product-dialog');
  const productContent = document.querySelector('#product-content');
  const cartDialog = document.querySelector('#cart-dialog');
  const cartContent = document.querySelector('#cart-content');
  const cartCount = document.querySelectorAll('[data-cart-count]');
  const siteStatus = document.querySelector('#site-status');
  const filterButtons = document.querySelectorAll('[data-filter]');
  const productCards = document.querySelectorAll('[data-category]');
  let cart = loadCart();
  let statusTimer;
  let clearStatusTimer;

  function formatPrice(cents) {
    return currency.format(cents / 100);
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(saved)) return [];

      return saved.flatMap((item) => {
        if (!item || !Object.hasOwn(categories, item.category)) return [];
        if (!Object.hasOwn(categories[item.category].prices, item.size)) return [];
        if (!Number.isInteger(item.quantity) || item.quantity < 1) return [];

        const selected = item.category === 'mix' && Array.isArray(item.toppings)
          ? toppings.filter((topping) => item.toppings.includes(topping.id)).map((topping) => topping.id)
          : [];

        return [{
          category: item.category,
          size: Number(item.size),
          toppings: selected,
          quantity: Math.min(item.quantity, MAX_QUANTITY),
        }];
      });
    } catch {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // O pedido continua disponível na página se o navegador bloquear o armazenamento.
    }
    updateCartCount();
  }

  function updateCartCount() {
    const total = cart.reduce((count, item) => count + item.quantity, 0);
    cartCount.forEach((element) => { element.textContent = total; });
    document.querySelectorAll('[data-open-cart]').forEach((button) => {
      button.setAttribute('aria-label', `Abrir sacola, ${total} ${total === 1 ? 'item' : 'itens'}`);
    });
  }

  function announce(message) {
    clearTimeout(statusTimer);
    clearTimeout(clearStatusTimer);
    siteStatus.textContent = '';
    statusTimer = setTimeout(() => { siteStatus.textContent = message; }, 30);
    clearStatusTimer = setTimeout(() => { siteStatus.textContent = ''; }, 3400);
  }

  function itemToppings(item) {
    return toppings.filter((topping) => item.toppings.includes(topping.id));
  }

  function lineTotal(item) {
    const basePrice = categories[item.category].prices[item.size];
    const extras = itemToppings(item).reduce((price, topping) => price + topping.price, 0);
    return (basePrice + extras) * item.quantity;
  }

  function dialogHeader(id, title, description) {
    return `
      <header class="dialog-header">
        <h2 class="dialog-title" id="${id}">${title}</h2>
        ${description ? `<p class="dialog-description">${description}</p>` : ''}
        <button class="dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button>
      </header>`;
  }

  function quantityStepper(quantity, name, index = null) {
    const context = index === null ? '' : `data-cart-index="${index}"`;

    return `
      <div class="quantity-stepper" role="group" aria-label="Quantidade de ${name}">
        <button type="button" ${context} data-quantity-change="-1" aria-label="Diminuir quantidade de ${name}" ${quantity <= 1 ? 'disabled' : ''}>−</button>
        <output aria-label="Quantidade" data-quantity>${quantity}</output>
        <button type="button" ${context} data-quantity-change="1" aria-label="Aumentar quantidade de ${name}" ${quantity >= MAX_QUANTITY ? 'disabled' : ''}>+</button>
      </div>`;
  }

  function toppingOptions(paid) {
    const options = toppings.filter((topping) => paid ? topping.price > 0 : topping.price === 0);
    return `
      <fieldset class="dialog-section">
        <legend>${paid ? 'Adicionais pagos' : 'Adicionais grátis'}</legend>
        <div class="dialog-options">
          ${options.map((topping) => `
            <label class="dialog-choice">
              <input type="checkbox" name="topping" value="${topping.id}">
              <span>${topping.name}</span>
              ${paid ? `<span class="dialog-choice-price">+ ${formatPrice(topping.price)}</span>` : ''}
            </label>`).join('')}
        </div>
      </fieldset>`;
  }

  function openProduct(key) {
    const [category, initialSize] = key.split('-');
    const product = categories[category];
    if (!product || !Object.hasOwn(product.prices, initialSize)) return;
    let quantity = 1;

    productContent.innerHTML = `
      ${dialogHeader('product-title', product.title, category === 'mix' ? 'Escolha o tamanho e monte do seu jeito.' : 'Escolha o tamanho do seu copo.')}
      <form id="product-form">
        <div class="dialog-body">
          <fieldset class="dialog-section">
            <legend>Tamanho</legend>
            <div class="dialog-options dialog-options-sizes">
              ${Object.entries(product.prices).map(([size, price]) => `
                <label class="dialog-choice">
                  <input type="radio" name="size" value="${size}" ${size === initialSize ? 'checked' : ''} required>
                  <span>${size} ml</span>
                  <span class="dialog-choice-price">${formatPrice(price)}</span>
                </label>`).join('')}
            </div>
          </fieldset>
          ${category === 'mix' ? toppingOptions(false) + toppingOptions(true) : ''}
        </div>
        <div class="dialog-footer">
          <div class="dialog-quantity">
            <span>Quantidade</span>
            ${quantityStepper(quantity, product.title)}
          </div>
          <div class="dialog-total"><span>Subtotal</span><strong aria-live="polite" data-product-total>${formatPrice(product.prices[initialSize])}</strong></div>
          <button class="dialog-action btn btn-primary" type="submit">Adicionar à sacola</button>
        </div>
      </form>`;

    const form = productContent.querySelector('form');
    const quantityValue = form.querySelector('[data-quantity]');
    const decrement = form.querySelector('[data-quantity-change="-1"]');
    const increment = form.querySelector('[data-quantity-change="1"]');
    const totalValue = form.querySelector('[data-product-total]');

    function selectedItem() {
      const data = new FormData(form);
      return { category, quantity, size: Number(data.get('size')), toppings: data.getAll('topping') };
    }

    function updateProductTotal() {
      totalValue.textContent = formatPrice(lineTotal(selectedItem()));
    }

    function changeQuantity(amount) {
      quantity = Math.min(MAX_QUANTITY, Math.max(1, quantity + amount));
      quantityValue.value = String(quantity);
      decrement.disabled = quantity === 1;
      increment.disabled = quantity === MAX_QUANTITY;
      updateProductTotal();
    }

    form.addEventListener('change', updateProductTotal);
    decrement.addEventListener('click', () => changeQuantity(-1));
    increment.addEventListener('click', () => changeQuantity(1));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const item = selectedItem();
      const existing = cart.find((line) => line.category === item.category && line.size === item.size
        && line.toppings.join(',') === item.toppings.join(','));

      const previousQuantity = existing?.quantity ?? 0;
      const quantityAdded = Math.min(item.quantity, MAX_QUANTITY - previousQuantity);

      if (existing) {
        existing.quantity += quantityAdded;
      } else {
        cart.push(item);
      }

      saveCart();
      productDialog.close();
      const message = quantityAdded === 1 ? '1 item adicionado à sacola.' : `${quantityAdded} itens adicionados à sacola.`;
      announce(quantityAdded > 0 ? message : 'Este copo já atingiu o limite de quantidade na sacola.');
    });

    productDialog.showModal();
  }

  function cartTotal() {
    return cart.reduce((total, item) => total + lineTotal(item), 0);
  }

  function renderCart() {
    if (cart.length === 0) {
      cartContent.innerHTML = `
        ${dialogHeader('cart-title', 'Sua sacola')}
        <div class="dialog-body cart-empty">
          <p>Sua sacola está vazia.</p>
          <a class="dialog-action btn btn-primary" href="#cardapio" data-close-dialog>Ver cardápio</a>
        </div>`;
      return;
    }

    const checkoutNote = STORE_WHATSAPP
      ? 'Confirme a entrega e o pagamento com a loja pelo WhatsApp.'
      : 'O número da loja ainda não foi informado. Você pode copiar o pedido ou escolher um contato no WhatsApp.';

    cartContent.innerHTML = `
      ${dialogHeader('cart-title', 'Sua sacola')}
      <div class="dialog-body">
        <ul class="cart-items">
          ${cart.map((item, index) => {
            const name = `${categories[item.category].title} de ${item.size} ml`;
            const names = itemToppings(item).map((topping) => topping.name).join(', ');

            return `
              <li class="cart-item">
                <div class="cart-item-info">
                  <strong>${name}</strong>
                  ${names ? `<p class="cart-item-toppings">${names}</p>` : ''}
                </div>
                <strong>${formatPrice(lineTotal(item))}</strong>
                <div class="cart-item-actions">
                  ${quantityStepper(item.quantity, name, index)}
                  <button class="cart-remove" type="button" data-remove="${index}" aria-label="Remover ${name}">Remover</button>
                </div>
              </li>`;
          }).join('')}
        </ul>
      </div>
      <div class="dialog-footer">
        <div class="dialog-total"><span>Total dos itens</span><strong aria-live="polite">${formatPrice(cartTotal())}</strong></div>
        <p class="order-note">${checkoutNote}</p>
        <a class="dialog-action btn btn-primary" href="${whatsAppUrl()}" target="_blank" rel="noopener noreferrer">${STORE_WHATSAPP ? 'Enviar pedido pelo WhatsApp' : 'Compartilhar no WhatsApp'}</a>
        <button class="dialog-secondary btn btn-secondary" type="button" data-copy-order>Copiar pedido</button>
        <p class="order-note" role="status" data-copy-status hidden></p>
      </div>`;
  }

  function orderSummary() {
    const lines = cart.flatMap((item) => {
      const name = `${categories[item.category].title} de ${item.size} ml`;
      const choices = itemToppings(item).map((topping) => topping.name).join(', ');
      const line = `• ${item.quantity} × ${name} — ${formatPrice(lineTotal(item))}`;
      return choices ? [line, `  Adicionais: ${choices}`] : [line];
    });

    return ['Olá! Gostaria de fazer um pedido no Açaí dos Deuses.', '', ...lines, '', `Total dos itens: ${formatPrice(cartTotal())}`].join('\n');
  }

  function whatsAppUrl() {
    return `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(orderSummary())}`;
  }

  async function copyOrder() {
    const summary = orderSummary();
    const button = cartContent.querySelector('[data-copy-order]');
    const status = cartContent.querySelector('[data-copy-status]');

    try {
      await navigator.clipboard.writeText(summary);
      status.hidden = false;
      status.textContent = 'Pedido copiado.';
    } catch {
      const field = document.createElement('textarea');
      field.className = 'order-summary';
      field.rows = 4;
      field.readOnly = true;
      field.value = summary;
      field.setAttribute('aria-label', 'Resumo do pedido para copiar');
      button.replaceWith(field);
      status.hidden = false;
      status.textContent = 'Selecione e copie o resumo do seu pedido.';
      field.focus();
      field.select();
    }
  }

  document.querySelectorAll('[data-product]').forEach((button) => {
    button.addEventListener('click', () => openProduct(button.dataset.product));
  });

  document.querySelectorAll('[data-open-cart]').forEach((button) => {
    button.addEventListener('click', () => {
      renderCart();
      cartDialog.showModal();
    });
  });

  [productDialog, cartDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close();
    });
  });

  cartContent.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.hasAttribute('data-copy-order')) {
      void copyOrder();
      return;
    }

    if (button.hasAttribute('data-cart-index')) {
      const { cartIndex, quantityChange } = button.dataset;
      const item = cart[cartIndex];
      item.quantity = Math.min(MAX_QUANTITY, Math.max(1, item.quantity + Number(quantityChange)));
      saveCart();
      renderCart();
      const matches = [...cartContent.querySelectorAll(`[data-cart-index="${cartIndex}"]:enabled`)];
      const nextFocus = matches.find((step) => step.dataset.quantityChange === quantityChange) ?? matches[0];
      nextFocus?.focus();
      return;
    }

    if (button.hasAttribute('data-remove')) {
      const removeIndex = Number(button.dataset.remove);
      cart.splice(removeIndex, 1);
      saveCart();
      renderCart();
      const removeButtons = cartContent.querySelectorAll('[data-remove]');
      const nextFocus = removeButtons[Math.min(removeIndex, removeButtons.length - 1)]
        ?? cartContent.querySelector('.cart-empty a');
      nextFocus?.focus();
    }
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      filterButtons.forEach((filter) => {
        const active = filter === button;
        filter.setAttribute('aria-pressed', String(active));
        filter.classList.toggle('is-active', active);
      });
      productCards.forEach((card) => {
        card.hidden = category !== 'all' && card.dataset.category !== category;
      });
    });
  });

  updateCartCount();
})();
