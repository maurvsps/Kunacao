// Error helpers and Firebase config diagnostics

import { firebaseConfig } from './firebase-config.js';

export function mapAuthError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ese email ya está registrado. Inicia sesión o usa "¿Olvidaste tu contraseña?"';
    case 'auth/invalid-email':
      return 'El email no es válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/network-request-failed':
      return 'Error de red. Verifica tu conexión a internet.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Intenta de nuevo más tarde.';
    case 'auth/operation-not-allowed':
      return 'El método de autenticación no está habilitado en Firebase.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Credenciales inválidas. Revisa tu email y contraseña.';
    case 'auth/user-not-found':
      return 'No existe una cuenta con ese email.';
    case 'auth/wrong-password':
      return 'Contraseña incorrecta.';
    default:
      return 'Ocurrió un error. ' + (code ? `(${code})` : 'Intenta nuevamente.');
  }
}

export function firebaseConfigLooksPlaceholder() {
  return (
    !firebaseConfig?.apiKey ||
    String(firebaseConfig.apiKey).includes('XXXXXXXXXXXXXXXX') ||
    String(firebaseConfig.projectId).includes('your-project-id')
  );
}

