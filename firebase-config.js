import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDbg6O6VUUBfh0BMVbSaJe1WOmSZwoOBhg",
  authDomain: "stop-e29f9.firebaseapp.com",
  projectId: "stop-e29f9",
  storageBucket: "stop-e29f9.firebasestorage.app",
  messagingSenderId: "640082897243",
  appId: "1:640082897243:web:2a0e913941b84227bd527e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
