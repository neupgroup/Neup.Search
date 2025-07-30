// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  "projectId": "neupsearch",
  "appId": "1:202359195232:web:23484722362ff10b576505",
  "storageBucket": "neupsearch.firebasestorage.app",
  "apiKey": "AIzaSyCFGo-LqHRa5Xeg45VrFAgN3VMh3tmjRSQ",
  "authDomain": "neupsearch.firebaseapp.com",
  "messagingSenderId": "202359195232"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };
