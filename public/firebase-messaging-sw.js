/* Firebase Messaging Service Worker
 * Recebe push notifications quando o app está em background/fechado.
 * O Firebase SDK popula `messaging.onBackgroundMessage` automaticamente.
 *
 * IMPORTANTE: Os valores de firebaseConfig aqui NÃO são secrets —
 * são as mesmas chaves públicas do cliente. Precisam ser hardcoded
 * porque o SW não tem acesso a import.meta.env.
 */
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBis5CDvxPvcyWAepUWtPPKApvz7ezxgeE',
  authDomain:        'basecottolengoescala.firebaseapp.com',
  projectId:         'basecottolengoescala',
  storageBucket:     'basecottolengoescala.firebasestorage.app',
  messagingSenderId: '635582901856',
  appId:             '1:635582901856:web:08a1565fb0ff9ae25a9d05',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message:', payload);
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'Cottolengo Escala', {
    body: body ?? '',
    icon: icon ?? '/Cottolengo_Escala_Mobile/icon-192.png',
    badge: '/Cottolengo_Escala_Mobile/icon-192.png',
    data: payload.data,
  });
});
