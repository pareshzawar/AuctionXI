// AuctionXI configuration.
//
// Leave `firebaseConfig` as null to run in DEMO MODE: everything is stored in
// this browser only (open the admin and captain views in different tabs of the
// same browser to try a full auction).
//
// For a real auction where captains bid from their own phones, create a free
// Firebase project (Spark plan, no credit card) and paste its web config here.
// Step-by-step guide: docs/SETUP.md
//
// The Firebase web config is NOT a secret - it is safe to commit. Security comes
// from database.rules.json, which you publish in the Firebase console.

// Forking AuctionXI for your own tournaments? Replace this with your own project's config,
// or set it to null for demo mode.
export const firebaseConfig = {
  apiKey: "AIzaSyAtigXPtofDeYLk6n0aRyjaRsAUetctN4Q",
  authDomain: "auctionxi-1a2b.firebaseapp.com",
  databaseURL: "https://auctionxi-1a2b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "auctionxi-1a2b",
  storageBucket: "auctionxi-1a2b.firebasestorage.app",
  messagingSenderId: "508983348632",
  appId: "1:508983348632:web:0399e99b81a9d37af76fed",
};
