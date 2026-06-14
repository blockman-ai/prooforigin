# Restore Vault on a New Device

Use this when you saved a **Recovery Kit** and **12-word recovery phrase** from your vault before losing access to the old device.

## What restore does

Restore recovers your **vault identity** on this device:

- Your original `vault_id` from the kit
- A new PIN you choose during restore
- A fresh local device registration on first unlock

## What restore does not do yet

- **Documents from your previous device are not migrated automatically.**
- Encrypted documents stay tied to the old device until cross-device migration ships.
- After restore, your secure document slot starts **empty** on this device.

## Before you start

Recovery import requires a **clean restore target**:

- No existing vault genesis on this browser profile
- No leftover vault PIN or wrapped key storage

If you already have vault storage here, open **Private Vault** instead of running restore again.

## Restore flow

1. On the vault page, choose **Restore From Recovery Kit**, or open **Restore from Recovery Kit** directly.
2. Upload your saved **recovery kit JSON file**. Phrase alone is not enough.
3. Enter your **12-word recovery phrase** to verify the kit.
4. Choose a **new PIN** for this device and confirm it.
5. Tap **Open Vault**, unlock with your new PIN, and register this device on first unlock.

## After restore

- Re-enroll **passkey** on this device if you want passkey unlock again.
- Export a fresh recovery kit after any major vault changes if your policy requires it.
- Use **Add Document** to store a new encrypted document in the empty slot.

## Limitations

- ProofOrigin cannot restore access without your kit **and** phrase.
- Support cannot reset your PIN, phrase, or vault keys.
- Never paste your phrase or kit contents into chat, email, or third-party sites.
