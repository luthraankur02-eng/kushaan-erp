import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB__bkI_aQAyXEzr3TbLQ1Heq--kCw9DDs",
  authDomain: "kushaan-packers-erp.firebaseapp.com",
  projectId: "kushaan-packers-erp",
  storageBucket: "kushaan-packers-erp.firebasestorage.app",
  messagingSenderId: "383607510070",
  appId: "1:383607510070:web:9541a1ae0b9dd29c0ab497",
  measurementId: "G-8LGXN1GFJK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);