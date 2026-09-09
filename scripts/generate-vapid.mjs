/** Print a fresh VAPID keypair for .env / Railway variables. */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("\nVAPID keypair generated. Add these to .env (and to Railway):\n");
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:you@example.com"`);
console.log(
  "\nKeep the private key secret. Changing the keypair invalidates every stored\n" +
    "subscription — each device has to press Enable notifications again.\n",
);
