/**
 * Helpers de push notification usando Firebase Cloud Messaging (FCM).
 *
 * Fluxo:
 * 1. requestNotificationPermission() — pede permissão + obtém token FCM
 * 2. Salva o token no doc do funcionário em Firestore
 * 3. A Cloud Function lê o token e envia push quando status muda
 */
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, getMsg } from '../firebase';

/* Chave VAPID pública — gere no Console Firebase > Cloud Messaging > Web config
 * e cole aqui ou use variável de ambiente VITE_FIREBASE_VAPID_KEY */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Solicita permissão de notificação + obtém token FCM.
 * Salva o token no array `fcmTokens` do doc do funcionário.
 *
 * @param {string} nurseId — ID do funcionário no Firestore
 * @returns {string|null} — token FCM ou null se negado/não suportado
 */
export async function requestNotificationPermission(nurseId) {
  try {
    const messaging = await getMsg();
    if (!messaging) {
      console.warn('[notifications] FCM não suportado neste navegador');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[notifications] Permissão negada');
      return null;
    }

    /* Registra o service worker manualmente para garantir o path correto */
    const sw = await navigator.serviceWorker.register(
      '/Cottolengo_Escala_Mobile/firebase-messaging-sw.js',
      { scope: '/Cottolengo_Escala_Mobile/' }
    );

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (!token) {
      console.warn('[notifications] Não obteve token FCM');
      return null;
    }

    /* Salva o token no doc do funcionário (array para suportar múltiplos dispositivos) */
    await updateDoc(doc(db, 'funcionarios', nurseId), {
      fcmTokens: arrayUnion(token),
    });

    console.log('[notifications] Token salvo:', token.slice(0, 20) + '…');
    return token;
  } catch (err) {
    console.error('[notifications] Erro:', err);
    return null;
  }
}

/**
 * Listener para notificações recebidas com o app em foreground.
 * Exibe como toast ou alerta no app.
 *
 * @param {function} callback — recebe { title, body }
 * @returns {function} unsubscribe
 */
export async function onForegroundMessage(callback) {
  const messaging = await getMsg();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log('[notifications] Foreground:', payload);
    const { title, body } = payload.notification ?? {};
    callback({ title: title ?? 'Cottolengo Escala', body: body ?? '' });
  });
}
