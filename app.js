(() => {
  'use strict';

  // Informe o número da loja com código do país e DDD, usando apenas dígitos.
  const STORE_WHATSAPP = '5551997259201';
  const DELIVERY_FEE_CENTS = 900;
  const STORAGE_KEY = 'acai-dos-deuses-cart-v1';
  const MAX_QUANTITY = 99;
  const INCLUDED_TOPPING_LIMITS = { 300: 3, 400: 4, 500: 5 };
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
  const toppingsById = new Map(toppings.map((topping) => [topping.id, topping]));

  const productDialog = document.querySelector('#product-dialog');
  const productContent = document.querySelector('#product-content');
  const cartDialog = document.querySelector('#cart-dialog');
  const cartContent = document.querySelector('#cart-content');
  const cartCount = document.querySelectorAll('[data-cart-count]');
  const cartButtons = document.querySelectorAll('[data-open-cart]');
  const floatingCart = document.querySelector('[data-floating-cart]');
  let cartOpener;
  const siteStatus = document.querySelector('#site-status');
  const filterButtons = document.querySelectorAll('[data-filter]');
  const productCards = document.querySelectorAll('[data-category]');
  let cart = loadCart();
  const checkoutDraft = {
    customerName: '',
    fulfillment: '',
    street: '',
    streetNumber: '',
    neighborhood: '',
    notes: '',
  };
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
          ? item.toppings.filter((id) => toppingsById.has(id))
          : [];
        const extras = item.category === 'mix' && Array.isArray(item.extras)
          ? item.extras.filter((extra) => toppingsById.get(extra?.id)?.price > 0
            && Number.isInteger(extra.quantity) && extra.quantity > 0)
          : [];
        const combined = selected.concat(extras.map(({ id }) => id));
        const hasRepeatedExtras = extras.some(({ quantity }) => quantity > 1)
          || new Set(combined).size < combined.length;

        return [{
          category: item.category,
          size: Number(item.size),
          toppings: hasRepeatedExtras ? selected : combined,
          ...(extras.length && hasRepeatedExtras ? { extras } : {}),
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
    floatingCart.hidden = total === 0;
    cartCount.forEach((element) => { element.textContent = total; });
    cartButtons.forEach((button) => {
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
    const limit = INCLUDED_TOPPING_LIMITS[item.size];
    return item.toppings.map((id, index) => ({
      ...toppingsById.get(id),
      included: index < limit,
    }));
  }

  function cartToppingIssue(item) {
    if (item.extras?.length || new Set(item.toppings).size < item.toppings.length) return 'repeated';
    return itemToppings(item).some(({ included, price }) => !included && price === 0) ? 'unpriced' : '';
  }

  function describeToppings(item) {
    const picked = itemToppings(item);
    const included = picked.filter((topping) => topping.included).map(({ name }) => name);
    const charged = picked.filter((topping) => !topping.included && topping.price > 0)
      .map(({ name, price }) => `${name} (+ ${formatPrice(price)})`);
    const unavailable = picked.filter((topping) => !topping.included && topping.price === 0).map(({ name }) => name);
    const oldExtras = (item.extras ?? []).map(({ id, quantity }) => `${quantity} × ${toppingsById.get(id).name}`);
    return [
      included.length ? `Incluídos por copo: ${included.join(', ')}` : '',
      charged.length ? `Cobrados por copo: ${charged.join(', ')}` : '',
      unavailable.length ? `Fora da cota: ${unavailable.join(', ')}` : '',
      oldExtras.length ? `Porções extras antigas: ${oldExtras.join(', ')}` : '',
    ].filter(Boolean);
  }

  function lineTotal(item) {
    const basePrice = categories[item.category].prices[item.size];
    const chargedToppings = itemToppings(item).reduce((total, topping) => total + (topping.included ? 0 : topping.price), 0);
    return (basePrice + chargedToppings) * item.quantity;
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

  function toppingOptions() {
    return `
      <fieldset class="dialog-section">
        <legend>Adicionais <span class="topping-counter" data-topping-counter></span></legend>
        <p class="topping-limit-message" data-topping-limit-message role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="dialog-options topping-selection-list">
          ${toppings.map((topping) => `
            <label class="dialog-choice">
              <input type="checkbox" name="topping" value="${topping.id}">
              <span>${topping.name}</span>
              <span class="dialog-choice-price topping-choice-price" data-topping-price></span>
            </label>`).join('')}
        </div>
      </fieldset>`;
  }

  function openProduct(key) {
    const [category, initialSize] = key.split('-');
    const product = categories[category];
    if (!product || !Object.hasOwn(product.prices, initialSize)) return;
    let quantity = 1;
    let toppingOrder = [];

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
          ${category === 'mix' ? toppingOptions() : ''}
        </div>
        <div class="dialog-footer">
          <div class="dialog-quantity">
            <span>Quantidade</span>
            ${quantityStepper(quantity, product.title)}
          </div>
          <div class="dialog-total"><span>Subtotal</span><strong aria-live="polite" data-product-total>${formatPrice(product.prices[initialSize])}</strong></div>
          <button class="dialog-action btn btn-primary" type="submit" data-add-product>Adicionar à sacola</button>
        </div>
      </form>`;

    const form = productContent.querySelector('form');
    const quantityValue = form.querySelector('[data-quantity]');
    const decrement = form.querySelector('[data-quantity-change="-1"]');
    const increment = form.querySelector('[data-quantity-change="1"]');
    const totalValue = form.querySelector('[data-product-total]');
    const addButton = form.querySelector('[data-add-product]');
    const limitMessage = form.querySelector('[data-topping-limit-message]');
    const toppingCounter = form.querySelector('[data-topping-counter]');
    const sizeInput = form.elements.namedItem('size');
    const toppingChoices = [...form.querySelectorAll('input[name="topping"]')].map((input) => ({
      input,
      topping: toppingsById.get(input.value),
      status: input.parentElement.querySelector('[data-topping-price]'),
    }));

    function selectedItem() {
      const checked = toppingChoices.filter(({ input }) => input.checked).map(({ topping }) => topping.id);
      toppingOrder = toppingOrder.filter((id) => checked.includes(id));
      toppingOrder.push(...checked.filter((id) => !toppingOrder.includes(id)));

      return {
        category,
        quantity,
        size: Number(sizeInput.value),
        toppings: toppingOrder,
      };
    }

    function updateProduct(item = selectedItem()) {
      const price = formatPrice(lineTotal(item));
      if (totalValue.textContent !== price) totalValue.textContent = price;
      if (category !== 'mix') return true;

      const limit = INCLUDED_TOPPING_LIMITS[item.size];
      const remaining = Math.max(0, limit - item.toppings.length);
      toppingCounter.textContent = `${limit - remaining} de ${limit} incluídos`;
      for (const { input, topping, status } of toppingChoices) {
        const selectedIndex = item.toppings.indexOf(topping.id);
        const included = input.checked ? selectedIndex < limit : remaining > 0;
        input.disabled = !input.checked && !included && topping.price === 0;
        status.textContent = included
          ? 'Incluído'
          : topping.price ? `+ ${formatPrice(topping.price)}` : 'Só na cota';
      }

      const issue = cartToppingIssue(item);
      const message = issue
        ? 'Há adicionais sem preço fora da cota. Desmarque uma opção ou escolha um copo maior.'
        : `Os primeiros ${limit} adicionais são incluídos. Depois da cota, valem os preços do cardápio.`;
      if (limitMessage.textContent !== message) limitMessage.textContent = message;
      limitMessage.toggleAttribute('data-invalid', Boolean(issue));
      addButton.disabled = Boolean(issue);
      return !addButton.disabled;
    }

    function changeQuantity(amount) {
      quantity = Math.min(MAX_QUANTITY, Math.max(1, quantity + amount));
      quantityValue.value = String(quantity);
      decrement.disabled = quantity === 1;
      increment.disabled = quantity === MAX_QUANTITY;
      updateProduct();
    }

    form.addEventListener('change', () => updateProduct());
    decrement.addEventListener('click', () => changeQuantity(-1));
    increment.addEventListener('click', () => changeQuantity(1));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const item = selectedItem();
      if (!Object.hasOwn(product.prices, item.size) || !updateProduct(item)) return;
      const existing = cart.find((line) => line.category === item.category && line.size === item.size
        && !line.extras?.length && line.toppings.join(',') === item.toppings.join(','));

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

    updateProduct();
    productDialog.showModal();
  }

  function orderTotals(fulfillment) {
    const subtotal = cart.reduce((total, item) => total + lineTotal(item), 0);
    const deliveryFee = fulfillment === 'delivery' ? DELIVERY_FEE_CENTS : 0;
    return { subtotal, deliveryFee, total: subtotal + deliveryFee };
  }

  function updateCheckout(form) {
    const address = form.querySelector('.checkout-address');
    const { subtotal, deliveryFee, total } = orderTotals(checkoutDraft.fulfillment);
    address.hidden = address.disabled = checkoutDraft.fulfillment !== 'delivery';
    form.querySelector('[data-checkout-subtotal]').textContent = formatPrice(subtotal);
    form.querySelector('[data-checkout-fee]').textContent = checkoutDraft.fulfillment ? formatPrice(deliveryFee) : '—';
    form.querySelector('[data-checkout-total]').textContent = checkoutDraft.fulfillment ? formatPrice(total) : '—';
  }

  function rememberCheckout(form) {
    for (const name of Object.keys(checkoutDraft)) {
      checkoutDraft[name] = form.elements.namedItem(name).value;
    }
  }

  function renderCart() {
    if (cart.length === 0) {
      for (const name of Object.keys(checkoutDraft)) checkoutDraft[name] = '';
      cartContent.innerHTML = `
        ${dialogHeader('cart-title', 'Sua sacola')}
        <div class="dialog-body cart-empty">
          <p>Sua sacola está vazia.</p>
          <a class="dialog-action btn btn-primary" href="#cardapio" data-close-dialog>Ver cardápio</a>
        </div>`;
      return;
    }

    const previousForm = cartContent.querySelector('#checkout-form');
    if (previousForm) rememberCheckout(previousForm);

    const toppingIssues = cart.map(cartToppingIssue);
    const invalidCart = toppingIssues.some(Boolean);
    cartContent.innerHTML = `
      ${dialogHeader('cart-title', 'Sua sacola')}
      <div class="dialog-body">
        <ul class="cart-items">
          ${cart.map((item, index) => {
            const name = `${categories[item.category].title} de ${item.size} ml`;
            const details = describeToppings(item);
            const issue = toppingIssues[index];
            const warning = issue === 'repeated'
              ? 'Este copo tem porções repetidas. Remova e monte novamente com uma porção de cada adicional.'
              : 'Este copo tem adicionais sem preço fora da cota. Remova e monte novamente.';

            return `
              <li class="cart-item">
                <div class="cart-item-info">
                  <strong>${name}</strong>
                  ${details.map((detail) => `<p class="cart-item-toppings">${detail}</p>`).join('')}
                  ${issue ? `<p class="cart-line-warning">${warning}</p>` : ''}
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
      <form id="checkout-form" class="checkout-form" aria-labelledby="checkout-title" novalidate>
        <div class="dialog-body">
          <h3 class="checkout-heading" id="checkout-title">Dados do pedido</h3>
          <label class="checkout-field">
            Nome do cliente
            <input type="text" name="customerName" autocomplete="name" maxlength="100" required>
          </label>
          <fieldset class="checkout-fulfillment dialog-section">
            <legend>Como você quer receber?</legend>
            <div class="checkout-options dialog-options">
              <label class="dialog-choice"><input type="radio" name="fulfillment" value="delivery" required> Entrega <span class="dialog-choice-price">${formatPrice(DELIVERY_FEE_CENTS)}</span></label>
              <label class="dialog-choice"><input type="radio" name="fulfillment" value="pickup" required> Retirada</label>
            </div>
          </fieldset>
          <fieldset class="checkout-address dialog-section" hidden disabled>
            <legend>Endereço de entrega</legend>
            <div class="checkout-address-grid">
              <label class="checkout-field">
                Rua
                <input type="text" name="street" autocomplete="address-line1" maxlength="120" required>
              </label>
              <label class="checkout-field">
                Número
                <input type="text" name="streetNumber" maxlength="24" required>
              </label>
              <label class="checkout-field">
                Bairro
                <input type="text" name="neighborhood" autocomplete="address-level3" maxlength="80" required>
              </label>
            </div>
          </fieldset>
          <label class="checkout-field">
            <span>Observações <span class="checkout-optional">(opcional)</span></span>
            <textarea name="notes" rows="2" maxlength="300"></textarea>
          </label>
        </div>
        <div class="dialog-footer">
          <div class="checkout-totals" aria-live="polite" aria-atomic="true">
            <div class="dialog-total"><span>Subtotal</span><strong data-checkout-subtotal></strong></div>
            <div class="dialog-total"><span>Taxa de entrega</span><strong data-checkout-fee></strong></div>
            <div class="dialog-total checkout-grand-total"><span>Total do pedido</span><strong data-checkout-total></strong></div>
          </div>
          ${invalidCart ? '<p class="cart-checkout-warning">Remova os copos sinalizados para finalizar ou copiar o pedido.</p>' : ''}
          <button class="dialog-action btn btn-primary" type="submit" ${invalidCart ? 'disabled' : ''}>Enviar pedido pelo WhatsApp</button>
          <p class="checkout-note order-note">Confira a mensagem pronta e confirme o envio no WhatsApp.</p>
          <button class="dialog-secondary btn btn-secondary" type="button" data-copy-order ${invalidCart ? 'disabled' : ''}>Copiar pedido</button>
          <textarea class="order-summary" rows="4" aria-label="Resumo do pedido para copiar" data-copy-fallback readonly hidden></textarea>
          <p class="order-note" role="status" data-copy-status hidden></p>
        </div>
      </form>`;

    const form = cartContent.querySelector('#checkout-form');
    for (const name of Object.keys(checkoutDraft)) {
      form.elements.namedItem(name).value = checkoutDraft[name];
    }
    updateCheckout(form);
  }

  function orderSummary() {
    const delivery = checkoutDraft.fulfillment === 'delivery';
    const { subtotal, deliveryFee, total } = orderTotals(checkoutDraft.fulfillment);
    const message = [
      '🍧 *NOVO PEDIDO — AÇAÍ DOS DEUSES*',
      '',
      `👤 *Cliente:* ${checkoutDraft.customerName.trim()}`,
      `📦 *Recebimento:* ${delivery ? 'Entrega' : 'Retirada'}`,
    ];
    if (delivery) {
      message.push(
        `📍 *Endereço:* ${checkoutDraft.street.trim()}, ${checkoutDraft.streetNumber.trim()}`,
        `🏘️ *Bairro:* ${checkoutDraft.neighborhood.trim()}`,
      );
    }

    const lines = cart.flatMap((item) => {
      const name = `${categories[item.category].title} de ${item.size} ml`;
      const line = `• ${item.quantity} × ${name} — ${formatPrice(lineTotal(item))}`;
      return [line, ...describeToppings(item).map((detail) => `  ${detail}`)];
    });
    message.push(
      '', '🛒 *ITENS DO PEDIDO:*', ...lines, '',
      `💰 *Subtotal:* ${formatPrice(subtotal)}`,
      `🛵 *Taxa de entrega:* ${formatPrice(deliveryFee)}`,
      `💵 *TOTAL: ${formatPrice(total)}*`,
    );

    const notes = checkoutDraft.notes.trim();
    if (notes) message.push('', `📝 *Observações:* ${notes}`);
    message.push('', 'Aguardo a confirmação do pedido!');

    return message.join('\n');
  }

  function validCheckout(form) {
    if (cart.some(cartToppingIssue)) return false;
    rememberCheckout(form);
    updateCheckout(form);
    for (const name of ['customerName', 'street', 'streetNumber', 'neighborhood']) {
      const field = form.elements.namedItem(name);
      field.setCustomValidity(field.value.trim() ? '' : 'Preencha este campo.');
    }
    return form.reportValidity();
  }

  async function copyOrder(form, summary) {
    const field = form.querySelector('[data-copy-fallback]');
    const status = form.querySelector('[data-copy-status]');

    try {
      await navigator.clipboard.writeText(summary);
      field.hidden = true;
      status.textContent = 'Pedido copiado.';
    } catch {
      field.value = summary;
      field.hidden = false;
      status.textContent = 'Selecione e copie o resumo do seu pedido.';
      field.focus();
      field.select();
    }
    status.hidden = false;
  }

  document.querySelectorAll('[data-product]').forEach((button) => {
    button.addEventListener('click', () => openProduct(button.dataset.product));
  });

  cartButtons.forEach((button) => {
    button.addEventListener('click', () => {
      renderCart();
      cartOpener = button;
      cartDialog.showModal();
    });
  });

  cartDialog.addEventListener('close', () => {
    if (cartOpener === floatingCart && floatingCart.hidden) {
      cartButtons[0].focus({ preventScroll: true });
    }
  });

  [productDialog, cartDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close();
    });
  });

  cartContent.addEventListener('change', (event) => {
    if (event.target.name !== 'fulfillment') return;
    const form = event.target.form;
    rememberCheckout(form);
    updateCheckout(form);
  });

  cartContent.addEventListener('input', (event) => {
    const form = event.target.form;
    if (form?.id !== 'checkout-form') return;
    form.querySelector('[data-copy-fallback]').hidden = true;
    form.querySelector('[data-copy-status]').hidden = true;
  });

  cartContent.addEventListener('submit', (event) => {
    if (event.target.id !== 'checkout-form') return;
    event.preventDefault();
    if (!cart.length || !validCheckout(event.target)) return;

    const url = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(orderSummary())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  cartContent.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.hasAttribute('data-copy-order')) {
      const form = button.form;
      if (validCheckout(form)) void copyOrder(form, orderSummary());
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

  const storeContact = document.querySelector('[data-store-contact]');
  storeContact.href = `https://wa.me/${STORE_WHATSAPP}`;
  storeContact.textContent = STORE_WHATSAPP.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  document.querySelector('[data-delivery-price]').textContent = formatPrice(DELIVERY_FEE_CENTS);
  updateCartCount();
})();
