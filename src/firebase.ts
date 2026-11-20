import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

interface AppletFirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

const optionalAppletModules = import.meta.glob<{ default?: AppletFirebaseConfig }>(
  '../firebase-applet-config.json',
  { eager: true },
);
const bundledAppletConfig: AppletFirebaseConfig =
  Object.values(optionalAppletModules)[0]?.default ?? {};

const envProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const envApiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const hasCustomEnvConfig = Boolean(envApiKey && envProjectId);

const projectId = hasCustomEnvConfig ? envProjectId : (bundledAppletConfig.projectId || '').trim();
const apiKey = hasCustomEnvConfig ? envApiKey : (bundledAppletConfig.apiKey || '').trim();

if (!projectId || !apiKey) {
  throw new Error(
    'Firebase configuration missing. Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in your .env file.',
  );
}

const firebaseConfig = hasCustomEnvConfig
  ? {
      apiKey,
      authDomain:
        (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() ||
        `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket:
        (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() ||
        `${projectId}.firebasestorage.app`,
      messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
      appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
    }
  : {
      apiKey,
      authDomain: bundledAppletConfig.authDomain || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: bundledAppletConfig.storageBucket || `${projectId}.firebasestorage.app`,
      messagingSenderId: bundledAppletConfig.messagingSenderId || '',
      appId: bundledAppletConfig.appId || '',
    };

const rawDatabaseId = hasCustomEnvConfig
  ? (import.meta.env.VITE_FIREBASE_DATABASE_ID || '').trim()
  : (bundledAppletConfig.firestoreDatabaseId || '').trim();
const databaseId = rawDatabaseId && rawDatabaseId !== '(default)' ? rawDatabaseId : '';

const app = initializeApp(firebaseConfig);
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
