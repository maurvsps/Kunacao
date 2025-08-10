// Pure UI helpers: rendering and calculations, no side-effects outside provided containers.

export function renderProductList(container, PRODUCTS) {
  const listHtml = Object.entries(PRODUCTS)
    .map(([name, price]) => `<button type="button" class="product-chip" data-product="${name}">${name} - S/ ${price.toFixed(2)}</button>`)
    .join('');
  container.innerHTML = listHtml;
}

export function calculateTotal(items, PRODUCTS) {
  return Object.entries(items).reduce((total, [product, quantity]) => {
    return total + (PRODUCTS[product] || 0) * quantity;
  }, 0);
}

// renderOrders now expects 'orders' to already be filtered and sorted by app.js
export function renderOrders({ container, orders, calculateTotal, searchTerm = '' }) {
  container.innerHTML = '';
  
  if (orders.length === 0) {
    if (searchTerm) {
      container.innerHTML = `<p>No se encontraron clientes que coincidan con "${searchTerm}".</p>`;
    } else {
       container.innerHTML = '<p>Aún no tienes pedidos. ¡Añade uno!</p>';
    }
    return;
  }

  orders.forEach((order) => {
    const totalAmount = calculateTotal(order.items);
    const balance = totalAmount - (order.paid || 0);

    let itemsCompact = Object.entries(order.items)
      .map(([name, qty]) => `${qty} ${name}`)
      .join(', ');

    if (order.paid && order.paid > 0) {
      itemsCompact += `, (ya pagó S/ ${order.paid.toFixed(2)})`;
    }

    const orderCard = document.createElement('div');
    orderCard.className = 'order-card';
    if (balance <= 0) {
      orderCard.classList.add('paid');
    }
    orderCard.dataset.id = order.id;

    // Format the date and time
    let formattedDate = '';
    if (order.created_at) {
      const date = new Date(order.created_at);
      formattedDate = date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    orderCard.innerHTML = `
      <div class="order-summary">
        <strong>${order.name}</strong>
        <span class="order-balance">Debe: S/ ${balance.toFixed(2)}</span>
        ${formattedDate ? `<small class="order-date">${formattedDate}</small>` : ''}
        <p class="order-items-compact" title="Total: S/ ${totalAmount.toFixed(2)} / Pagado: S/ ${(order.paid || 0).toFixed(2)}">${itemsCompact}</p>
      </div>
      <form class="payment-form">
        <input type="number" step="0.1" min="0" class="payment-input" placeholder="0.00">
        <button type="submit" class="add-payment-btn">Pagar</button>
      </form>
      <div class="order-actions">
        <button class="delete-btn" title="Eliminar Pedido">🗑️</button>
      </div>
    `;
    container.appendChild(orderCard);
  });
}

export function renderSummary({ appRoot, orders, calculateTotal }) {
  const totalDebt = (orders || []).reduce((acc, order) => {
    const balance = calculateTotal(order.items) - (order.paid || 0);
    return acc + (balance > 0 ? balance : 0);
  }, 0);

  const totalPaid = (orders || []).reduce((acc, order) => acc + (order.paid || 0), 0);

  let summarySection = appRoot.querySelector('#summary');
  if (!summarySection) {
    summarySection = document.createElement('section');
    summarySection.id = 'summary';
    appRoot.appendChild(summarySection);
  }

  summarySection.innerHTML = `
    <h2>Resumen General</h2>
    <p>Total Pagado: S/ ${totalPaid.toFixed(2)}</p>
    <p>Deuda Total Pendiente: S/ ${totalDebt.toFixed(2)}</p>
  `;
}