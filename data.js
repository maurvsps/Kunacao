// Firebase data and auth layer: initialization, listeners, CRUD, and auth wrappers.
// Now uses Firebase for authentication, and Websim Database for persisting orders.

import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged as fbOnAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

// Websim Database
import { WebsimSocket } from "@websim/websim-socket";

import { firebaseConfig } from './firebase-config.js';

let app;
let auth;
// Initialize WebsimSocket at module scope (required)
const room = new WebsimSocket();

export function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  return { app, auth };
}

export function getCurrentUser() {
  return auth?.currentUser || null;
}

// Auth wrappers (Firebase)
export function onAuthChanged(handler) {
  return fbOnAuthStateChanged(auth, handler);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return signOut(auth);
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

// -----------------------------
// Websim Database Order Helpers
// -----------------------------

function toClientKey(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Subscribe to the current Firebase user's orders stored in Websim Database.
 * Aggregates order_item_v3 into per-client orders and merges payments from order_payment_v3.
 */
export function listenForOrders(firebaseUserId, onData, onError) {
  let disposed = false;
  let items = [];
  let payments = [];

  let unsubscribeItems = () => {};
  let unsubscribePayments = () => {};

  (async () => {
    try {
      const uid = firebaseUserId;

      // Subscribe to order items for this Firebase user
      unsubscribeItems = room
        .collection('order_item_v3')
        .filter({ firebase_auth_uid: uid })
        .subscribe((list) => {
          items = list || [];
          emit();
        });

      // Subscribe to payments for this Firebase user
      unsubscribePayments = room
        .collection('order_payment_v3')
        .filter({ firebase_auth_uid: uid })
        .subscribe((list) => {
          payments = list || [];
          emit();
        });
    } catch (e) {
      console.error('Websim DB subscribe error:', e);
      onError?.(e);
    }
  })();

  function emit() {
    if (disposed) return;

    // Aggregate items per client
    const byClient = new Map();
    for (const it of items) {
      const ck = it.client_key;
      if (!byClient.has(ck)) {
        byClient.set(ck, {
          id: ck,
          name: it.client_name,
          items: {},
          paid: 0,
          created_at: null // Initialize to null
        });
      }
      const obj = byClient.get(ck);
      obj.name = it.client_name || obj.name;
      obj.items[it.product] = (obj.items[it.product] || 0) + (it.quantity || 0);

      // Keep the earliest created_at for the entire client order (from any item)
      if (it.created_at && (!obj.created_at || new Date(it.created_at) < new Date(obj.created_at))) {
        obj.created_at = it.created_at;
      }
    }

    // Merge payments
    for (const p of payments) {
      const ck = p.client_key;
      if (!byClient.has(ck)) {
        byClient.set(ck, {
          id: ck,
          name: p.client_name,
          items: {},
          paid: p.paid || 0,
          created_at: null // Initialize to null
        });
      }
      const obj = byClient.get(ck);

      obj.paid = p.paid || 0;

      // Also consider payment created_at for the client order's created_at, if it's earlier
      if (p.created_at && (!obj.created_at || new Date(p.created_at) < new Date(obj.created_at))) {
        obj.created_at = p.created_at;
      }
    }

    const orders = Array.from(byClient.values());
    onData?.(orders);
  }

  return () => {
    disposed = true;
    try { unsubscribeItems(); } catch {}
    try { unsubscribePayments(); } catch {}
  };
}

/**
 * Create or update an order item for the current Firebase user.
 * Uniqueness per user + client + product via deterministic id.
 */
export async function addOrUpdateOrder({ userId: firebaseUserId, existingOrder: _unused, name, selectedProduct, quantity }) {
  const uid = firebaseUserId;
  const client_key = toClientKey(name);
  const product = selectedProduct;

  const itemId = `${uid}:${client_key}:${product}`;

  // Check existing quantity
  const existing = await room.collection('order_item_v3').filter({ id: itemId }).getList();
  const prev = existing && existing.length > 0 ? existing[0] : null;
  const newQty = (prev?.quantity || 0) + quantity;

  await room.collection('order_item_v3').upsert({
    id: itemId,
    firebase_auth_uid: uid,
    client_key,
    client_name: name,
    product,
    quantity: newQty
  });
}

/**
 * Upsert payment total per client for the current Firebase user.
 */
export async function updatePayment(firebaseUserId, orderId /* client_key */, newPaidAmount) {
  const uid = firebaseUserId;
  const client_key = orderId;

  // We need a client_name. Try to fetch one item from this client to get display name.
  let client_name = '';
  try {
    const someItems = await room.collection('order_item_v3').filter({ firebase_auth_uid: uid, client_key }).getList();
    client_name = someItems?.[0]?.client_name || '';
  } catch {}

  const paymentId = `${uid}:${client_key}`;
  await room.collection('order_payment_v3').upsert({
    id: paymentId,
    firebase_auth_uid: uid,
    client_key,
    client_name,
    paid: newPaidAmount
  });
}

/**
 * Delete all items belonging to the client (order) and its payment record for the current Firebase user.
 */
export async function deleteOrderById(firebaseUserId, orderId /* client_key */) {
  const uid = firebaseUserId;
  const client_key = orderId;

  // Delete all item records for this client
  const items = await room.collection('order_item_v3').filter({ firebase_auth_uid: uid, client_key }).getList();
  for (const it of items) {
    try {
      await room.collection('order_item_v3').delete(it.id);
    } catch (e) {
      // silently ignore records not owned by current user (permission)
      console.warn('Delete item failed (possibly not owner):', it.id, e?.message);
    }
  }

  // Delete payment record if exists
  const paymentId = `${uid}:${client_key}`;
  try {
    await room.collection('order_payment_v3').delete(paymentId);
  } catch (e) {
    // ignore if not exists or not owner
  }
}