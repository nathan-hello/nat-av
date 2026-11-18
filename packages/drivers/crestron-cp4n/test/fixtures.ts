import type { SshEndpoint } from "../ssh.js";

export const processor: SshEndpoint = {
  host: "cp4n-201.example",
  sshPort: 22,
  username: "test-user",
  password: "test-password",
  sshFingerprint: `SHA256:${"a".repeat(43)}`,
};
