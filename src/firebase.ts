import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, initializeFirestore } from 'firebase/firestore';

interface AppletFirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

function cleanEnv(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

const optionalAppletModules = import.meta.glob<{ default?: AppletFirebaseConfig }>(
  '../firebase-applet-config.json',
  { eager: true },
);
const bundledAppletConfig: AppletFirebaseConfig =
  Object.values(optionalAppletModules)[0]?.default ?? {};

const envProjectId = cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID);
const envApiKey = cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY);
const hasCustomEnvConfig = Boolean(envApiKey && envProjectId);

const projectId = hasCustomEnvConfig ? envProjectId : cleanEnv(bundledAppletConfig.projectId);
const apiKey = hasCustomEnvConfig ? envApiKey : cleanEnv(bundledAppletConfig.apiKey);

if (!projectId || !apiKey) {
  throw new Error(
    'Firebase configuration missing. Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in your .env file.',
  );
}

const firebaseConfig = hasCustomEnvConfig
  ? {
      apiKey,
      authDomain:
        cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket:
        cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ||
        `${projectId}.firebasestorage.app`,
      messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
    }
  : {
      apiKey,
      authDomain: cleanEnv(bundledAppletConfig.authDomain) || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket:
        cleanEnv(bundledAppletConfig.storageBucket) || `${projectId}.firebasestorage.app`,
      messagingSenderId: cleanEnv(bundledAppletConfig.messagingSenderId),
      appId: cleanEnv(bundledAppletConfig.appId),
    };

const rawDatabaseId = hasCustomEnvConfig
  ? cleanEnv(import.meta.env.VITE_FIREBASE_DATABASE_ID)
  : cleanEnv(bundledAppletConfig.firestoreDatabaseId);
const databaseId = rawDatabaseId && rawDatabaseId !== '(default)' ? rawDatabaseId : '';

const app = initializeApp(firebaseConfig);

function createFirestoreClient() {
  try {
    return databaseId
      ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, databaseId)
      : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
}

export const db = createFirestoreClient();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
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

  const lower = rawMessage.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient')) {
    throw new Error(
      'Permission denied: your account does not have permission for this action.',
    );
  }
  if (lower.includes('not-found') || lower.includes('no document to update')) {
    throw new Error('The target record could not be found. Please refresh and try again.');
  }
  if (lower.includes('unavailable') || lower.includes('offline') || lower.includes('network')) {
    throw new Error(
      'Database connection unavailable. Please check your internet connection and try again.',
    );
  }
  throw new Error(rawMessage || 'Database operation failed.');
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
