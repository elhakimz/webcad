// Shim for @bufbuild/protobuf/writ (v1.x subpath) on top of v2.x.
// Provides base64Encode/base64Decode used by @connectrpc/connect.

export function base64Encode(bytes: Uint8Array): string {
  if (typeof btoa !== "undefined") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // Node.js fallback
  return Buffer.from(bytes).toString("base64");
}

export function base64Decode(input: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(input, "base64"));
}
