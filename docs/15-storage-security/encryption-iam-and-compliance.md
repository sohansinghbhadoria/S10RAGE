---
id: encryption-iam-and-compliance
title: 15. Storage Security & Compliance
sidebar_label: 15. Storage Security
sidebar_position: 15
---

# 15. Storage Security & Compliance

Storage security safeguards persistent data across its entire lifecycle: while in transit over network fabrics, while sitting dormant on physical media (at rest), during permission authorization, and through secure sanitization.

---

## 1. Cryptographic Protection: At Rest vs. In Transit

```
[ Application / Client ]
           │
           │  TLS 1.3 / mTLS / IPsec / SMB Encryption
           ▼  (Protects against eavesdropping & man-in-the-middle attacks)
[ Storage Node / Kernel ]
           │
           │  LUKS / dm-crypt / Hardware SED (AES-XTS-256)
           ▼  (Protects against physical theft of drives or decommission leaks)
[ Physical NAND / Platters ]
```

### Encryption at Rest Approaches
1. **Application-Level Encryption (Envelope Encryption)**:
   - Data is encrypted in memory by the application before hitting the kernel or storage network.
   - Uses a Data Encryption Key (DEK) encrypted by a Key Encryption Key (KEK) managed in a Key Management Service (AWS KMS, HashiCorp Vault).
2. **OS Block-Level Encryption (Linux LUKS / `dm-crypt`)**:
   - Transparently encrypts all sectors on a block device using AES-256 in XTS mode.
3. **Hardware Self-Encrypting Drives (SED / TCG Opal)**:
   - Encryption logic and cryptographic engines are built directly into the storage controller ASIC.

---

## 2. Linux Permissions, POSIX ACLs & IAM

### POSIX Permissions vs. Extended Access Control Lists (ACLs)
Standard Linux permissions (`rwxr-xr-x`) only distinguish between User, Group, and Other.
When multiple teams or processes require distinct access privileges on the same file, use **POSIX ACLs**:

```bash
# View active extended ACLs
getfacl /srv/finance_records/

# Grant read/write access to user 'auditor' without altering the primary group
setfacl -m u:auditor:rw- /srv/finance_records/
```

### Cloud Storage IAM & Bucket Policies
For object storage, enforce the **Principle of Least Privilege**:
- **S3 Block Public Access**: Enabled by default to eliminate accidental data leaks.
- **Pre-Signed URLs**: Time-limited cryptographic signatures allowing unauthenticated clients to upload or download an object within a strictly bounded expiration window (e.g., 5 minutes).

---

## 3. Data Sanitization & Cryptographic Shredding

Simply running `rm -f /path/to/file` does **not** erase data: it merely unlinks the directory entry and marks the inode blocks as unallocated in the filesystem bitmap. The physical bits remain intact on disk until overwritten.

### Sanitization Standards
- **NIST SP 800-88 (Guidelines for Media Sanitization)**: Industry standard defining three levels:
  1. *Clear*: Logical overwrite with pseudo-random bits.
  2. *Purge*: ATA Secure Erase or NVMe Format command (signals the controller to reset all cell voltages).
  3. *Destroy*: Physical degaussing, shredding, or incineration.
- **Crypto-Shredding**:
  If all data is encrypted with a unique key, deliberately destroying or purging the encryption key renders the ciphertext permanently irrecoverable without expensive disk-wiping cycles. Essential for compliance with GDPR "Right to be Forgotten".
