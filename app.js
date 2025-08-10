// Orchestrator: wires UI to data/auth modules and keeps small glue logic.

import confetti from 'canvas-confetti';
import {
  initFirebase,
  onAuthChanged,
  signIn,
  signUp,
  signOutUser,
  resetPassword,
  listenForOrders,
  addOrUpdateOrder,
  updatePayment,
  deleteOrderById,
  getCurrentUser,
  signInWithGoogle
} from './data.js';

import { PRODUCTS, PRODUCT_NAMES } from './products.js';
import { mapAuthError, firebaseConfigLooksPlaceholder } from './errors.js';
import { renderProductList, renderOrders, renderSummary, calculateTotal } from './ui.js';

// Initialize Firebase SDK instances
initFirebase();

document.addEventListener('DOMContentLoaded', () => {
  // Auth elements
  const authContainer = document.getElementById('auth-container');
  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const authErrorP = document.getElementById('auth-error');
  const authHintP = document.getElementById('auth-hint');
  const togglePassword = document.getElementById('toggle-password');
  const resetPasswordBtn = document.getElementById('reset-password-btn');
  const googleSignInBtn = document.getElementById('google-signin-btn');

  // App elements
  const appContainer = document.getElementById('app');
  const userEmailSpan = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const orderForm = document.getElementById('order-form');
  const promptInput = document.getElementById('prompt');
  const ordersContainer = document.getElementById('orders-container');
  const productListDiv = document.getElementById('product-list');
  const errorMessageP = document.getElementById('error-message');
  const searchInput = document.getElementById('search-input');
  const sortButtons = document.querySelectorAll('#sort-controls .sort-btn'); // New: Select all sort buttons

  // State
  let selectedProduct = null;
  let localOrders = [];
  let unsubscribeOrders = null;
  // New: Default sort criteria and direction
  let currentSort = { criteria: 'date', direction: 'desc' }; // Default to date, newest first

  // Hints if Firebase config is placeholder
  if (firebaseConfigLooksPlaceholder()) {
    authHintP.textContent = "Tip: Configura tu Firebase en firebase-config.js (Proyecto -> Configuración -> tus credenciales web).";
  }

  // Auth UI events
  loginForm.addEventListener('submit', (e) => e.preventDefault());

  togglePassword?.addEventListener('change', () => {
    passwordInput.type = togglePassword.checked ? 'text' : 'password';
  });

  resetPasswordBtn?.addEventListener('click', async () => {
    authErrorP.textContent = '';
    const email = emailInput.value.trim();
    if (!email) {
      authErrorP.textContent = "Ingresa tu email para enviarte un enlace de recuperación.";
      return;
    }
    try {
      await resetPassword(email);
      authErrorP.style.color = '#388e3c';
      authErrorP.textContent = "Te enviamos un correo para restablecer tu contraseña.";
      setTimeout(() => authErrorP.style.color = '', 3000);
    } catch (error) {
      authErrorP.style.color = '';
      authErrorP.textContent = mapAuthError(error);
    }
  });

  loginBtn.addEventListener('click', async () => {
    authErrorP.style.color = '';
    authErrorP.textContent = '';
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      authErrorP.textContent = "Por favor, ingresa email y contraseña.";
      return;
    }
    try {
      loginBtn.disabled = true;
      signupBtn.disabled = true;
      await signIn(email, password);
      loginForm.reset();
    } catch (error) {
      authErrorP.textContent = mapAuthError(error);
    } finally {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
    }
  });

  signupBtn.addEventListener('click', async () => {
    authErrorP.style.color = '';
    authErrorP.textContent = '';
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      authErrorP.textContent = "Por favor, ingresa email y contraseña.";
      return;
    }
    try {
      loginBtn.disabled = true;
      signupBtn.disabled = true;
      await signUp(email, password);
      loginForm.reset();
    } catch (error) {
      authErrorP.textContent = mapAuthError(error);
      if (firebaseConfigLooksPlaceholder()) {
        authHintP.textContent = "Revisa que tu configuración de Firebase sea correcta en firebase-config.js.";
      }
    } finally {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
    }
  });

  googleSignInBtn.addEventListener('click', async () => {
    authErrorP.style.color = '';
    authErrorP.textContent = '';
    try {
      loginBtn.disabled = true;
      signupBtn.disabled = true;
      googleSignInBtn.disabled = true;
      await signInWithGoogle();
      loginForm.reset();
    } catch (error) {
      console.error("Google Sign-in error:", error);
      authErrorP.textContent = mapAuthError(error);
    } finally {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
      googleSignInBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error("Logout error:", error);
    }
  });

  // Auth state handling
  onAuthChanged(async (user) => {
    if (user) {
      authContainer.style.display = 'none';
      appContainer.style.display = 'block';
      document.body.style.alignItems = 'flex-start';
      userEmailSpan.textContent = user.email;

      if (unsubscribeOrders) unsubscribeOrders();
      unsubscribeOrders = listenForOrders(user.uid, (orders) => {
        localOrders = orders;
        updateOrdersDisplay(); // Call update function
      }, (err) => {
        console.error("Error al escuchar pedidos:", err);
        errorMessageP.textContent = "Error al cargar los pedidos.";
      });

      // Ensure product list present
      renderProductList(productListDiv, PRODUCTS);
      updateSortButtonUI(); // Initial sort button UI update
    } else {
      authContainer.style.display = 'flex';
      appContainer.style.display = 'none';
      document.body.style.alignItems = 'center';
      userEmailSpan.textContent = '';

      if (unsubscribeOrders) unsubscribeOrders();
      localOrders = [];
      updateOrdersDisplay(); // Call update function for empty state
    }
  });

  // Product chip behavior
  renderProductList(productListDiv, PRODUCTS);
  productListDiv.addEventListener('click', (e) => {
    const chip = e.target.closest('.product-chip');
    if (!chip) return;
    errorMessageP.textContent = '';
    const productName = chip.dataset.product;
    const currentlySelected = productListDiv.querySelector('.product-chip.selected');
    if (currentlySelected) {
      currentlySelected.classList.remove('selected');
    }
    if (selectedProduct !== productName) {
      chip.classList.add('selected');
      selectedProduct = productName;
    } else {
      selectedProduct = null;
    }
  });

  // Order entry
  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessageP.textContent = '';
    const prompt = promptInput.value;

    if (!selectedProduct) {
      errorMessageP.textContent = 'Error: Debes seleccionar un producto.';
      return;
    }

    const result = parseSimplePrompt(prompt);
    if (result.error) {
      errorMessageP.textContent = `Error: ${result.error}`;
      return;
    }
    const { name, quantity } = result;

    try {
      const user = getCurrentUser();
      if (!user) throw new Error('No user');
      await addOrUpdateOrder({
        userId: user.uid,
        existingOrder: null, // aggregation handled by Websim DB
        name,
        selectedProduct,
        quantity
      });
    } catch (error) {
      console.error("Error adding/updating order:", error);
      errorMessageP.textContent = "No se pudo guardar el pedido.";
    }

    promptInput.value = '';
    const currentlySelected = productListDiv.querySelector('.product-chip.selected');
    if (currentlySelected) currentlySelected.classList.remove('selected');
    selectedProduct = null;
    promptInput.focus();
  });

  // Orders interactions: delete, pay
  ordersContainer.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const orderCard = e.target.closest('.order-card');
    if (!orderCard) return;
    const orderId = orderCard.dataset.id; // client_key
    if (!orderId) return;

    if (button.classList.contains('delete-btn')) {
      e.preventDefault();
      const orderToDelete = localOrders.find(o => o.id === orderId);
      if (!orderToDelete) return;

      const confirmed = confirm(`¿Estás seguro de que quieres eliminar el pedido de ${orderToDelete.name}?`);
      if (!confirmed) return;

      try {
        const user = getCurrentUser();
        if (!user) throw new Error('No user');
        await deleteOrderById(user.uid, orderId);
      } catch (error) {
        console.error("Error deleting order:", error);
        errorMessageP.textContent = "No se pudo eliminar el pedido.";
      }
    }
  });

  ordersContainer.addEventListener('submit', async (e) => {
    if (!e.target.classList.contains('payment-form')) return;
    e.preventDefault();

    const orderCard = e.target.closest('.order-card');
    if (!orderCard) return;
    const orderId = orderCard.dataset.id;
    const order = localOrders.find(o => o.id === orderId);
    if (!order) return;

    const paymentInput = orderCard.querySelector('.payment-input');
    const paymentAmount = parseFloat(paymentInput.value);

    if (!isNaN(paymentAmount) && paymentAmount > 0) {
      const newPaidAmount = (order.paid || 0) + paymentAmount;
      try {
        const user = getCurrentUser();
        if (!user) throw new Error('No user');
        await updatePayment(user.uid, orderId, newPaidAmount);

        const total = calculateTotal(order.items, PRODUCTS);
        const balance = total - newPaidAmount;
        if (balance <= 0) {
          const button = e.target.querySelector('.add-payment-btn');
          const rect = button.getBoundingClientRect();
          const x = (rect.left + rect.right) / 2 / window.innerWidth;
          const y = (rect.top + rect.bottom) / 2 / window.innerHeight;
          confetti({ particleCount: 100, spread: 70, origin: { x, y } });
        }
      } catch (error) {
        console.error("Error updating payment:", error);
        errorMessageP.textContent = "No se pudo registrar el pago.";
      }
    }
    paymentInput.value = '';
  });

  // Search input handler
  searchInput.addEventListener('input', () => {
    updateOrdersDisplay();
  });

  // New: Sort button handlers
  sortButtons.forEach(button => {
    button.addEventListener('click', () => {
      const criteria = button.dataset.sortCriteria;

      if (currentSort.criteria === criteria) {
        // Toggle direction if same criteria
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        // Set new criteria and default direction
        currentSort.criteria = criteria;
        // Set default directions for each criteria
        if (criteria === 'name') {
          currentSort.direction = 'asc'; // A-Z
        } else { // date, debt
          currentSort.direction = 'desc'; // Newest/Highest first
        }
      }
      updateSortButtonUI();
      updateOrdersDisplay();
    });
  });

  // Helpers

  // Function to update the displayed orders and summary
  function updateOrdersDisplay() {
    renderOrders({
      container: ordersContainer,
      orders: getSortedAndFilteredOrders(localOrders, searchInput.value, currentSort.criteria, currentSort.direction),
      calculateTotal: (items) => calculateTotal(items, PRODUCTS),
      searchTerm: searchInput.value // Pass search term for empty state message
    });
    renderSummary({
      appRoot: document.getElementById('app'),
      orders: localOrders, // Summary always based on all local orders before filtering
      calculateTotal: (items) => calculateTotal(items, PRODUCTS)
    });
  }

  // New: Function to update the UI of sort buttons
  function updateSortButtonUI() {
    sortButtons.forEach(button => {
      const criteria = button.dataset.sortCriteria;

      // Remove active class from all buttons
      button.classList.remove('active');

      if (currentSort.criteria === criteria) {
        button.classList.add('active');
      }
    });
  }

  // Combines filtering and sorting logic
  function getSortedAndFilteredOrders(orders, filter = '', criteria = 'date', direction = 'desc') {
    const searchTerm = (filter || '').toLowerCase().trim();
    const filtered = orders.filter(order => order.name.toLowerCase().includes(searchTerm));

    const sorted = [...filtered].sort((a, b) => {
      const balanceA = calculateTotal(a.items, PRODUCTS) - (a.paid || 0);
      const balanceB = calculateTotal(b.items, PRODUCTS) - (b.paid || 0);

      let comparison = 0;

      switch (criteria) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'debt':
          comparison = balanceA - balanceB;
          break;
      }

      // Apply direction
      if (direction === 'desc') {
        // Reverse comparison for 'desc' direction for numerical/date sorts
        // For string sorts (name), 'desc' means Z-A, so we reverse the default A-Z
        if (criteria === 'name') {
          return -comparison;
        } else { // date, debt (numerical comparison)
          return -comparison;
        }
      } else {
        // 'asc' is the natural order for strings (A-Z) and numbers (low to high)
        // For date, 'asc' means oldest to newest
        return comparison;
      }
    });
    return sorted;
  }

  function parseSimplePrompt(prompt) {
    prompt = String(prompt || '').trim();
    const match = prompt.match(/^(.*?)\s*(\d+)$/);
    if (!match) {
      return { error: "Formato no válido. Usa 'Nombre Cantidad', ej: 'Ana 2'." };
    }
    let name = match[1].trim();
    if (!name) {
      return { error: "No se pudo identificar el nombre del cliente." };
    }
    return { name: name.charAt(0).toUpperCase() + name.slice(1), quantity: parseInt(match[2], 10) };
  }
});