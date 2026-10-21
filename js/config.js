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

export const firebaseConfig = null;

// Example:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "my-auction.firebaseapp.com",
//   databaseURL: "https://my-auction-default-rtdb.asia-southeast1.firebasedatabase.app",
//   projectId: "my-auction",
//   appId: "1:1234567890:web:abcdef",
// };
