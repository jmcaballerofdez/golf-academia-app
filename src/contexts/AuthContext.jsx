import { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDQMYwKTt05hfSPW-Trl7NYPGyDFKA76dQ",
  authDomain: "golf-ciudad-real-50819.firebaseapp.com",
  projectId: "golf-ciudad-real-50819",
  storageBucket: "golf-ciudad-real-50819.firebasestorage.app",
  messagingSenderId: "447720199984",
  appId: "1:447720199984:web:312a8a1140d95554821af5"
};

// Reutiliza la app de Firebase si ya existe (App.jsx la crea también);
// si no, la inicializa. Evita el error "app/duplicate-app".
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [tenantId, setTenantId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        let miTenantId = 'ciudad-real';
        try {
          const snap = await getDoc(doc(db, 'Usuarios', u.uid));
          if (snap.exists() && snap.data().tenantId) {
            miTenantId = snap.data().tenantId;
          }
        } catch {
          // se queda con el fallback
        }
        setTenantId(miTenantId);
      } else {
        setTenantId(null);
      }
    });
    return unsub;
  }, []);

  const value = { tenantId };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}