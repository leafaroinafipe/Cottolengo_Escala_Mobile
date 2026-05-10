import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/* Garante que o template de password reset / verificação saia em pt-BR
 * em vez do inglês default — reduz risco de o e-mail ser tratado como
 * phishing pelas funcionárias e por filtros de spam corporativos. */
auth.languageCode = 'pt';

/* Firestore com cache local persistente (IndexedDB).
 * Crítico em PWA mobile: enfermeira abre o app sem sinal e ainda enxerga
 * a escala que viu por último.
 * O try/catch torna a chamada idempotente (HMR do Vite re-executa o módulo). */
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  console.warn('[firebase] initializeFirestore falhou (provavelmente HMR), usando instância existente:', err?.code ?? err?.message);
  firestore = getFirestore(app);
}
export const db = firestore;
