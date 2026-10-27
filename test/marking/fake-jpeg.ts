// A made-up JPEG for AI marking's tests (C350): SOI, a comment carrying `label`, a frame header of the given size, EOI.
// It is no picture at all, but it has everything the server reads of one; the tests' stand-in model reads the label
// back from the comment to know which page it was sent.
export function fakeJpeg(label: string, width = 1400, height = 2000): Uint8Array {
  const com = Buffer.from(label, 'utf8');
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xfe, (com.length + 2) >> 8, (com.length + 2) & 0xff]),
      com,
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
      Buffer.from([0xff, 0xd9]),
    ])
  );
}

// The label of a picture made by fakeJpeg; null for anything else.
export function labelOf(bytes: Uint8Array): string | null {
  for (let i = 2; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xfe) {
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      return Buffer.from(bytes.slice(i + 4, i + 2 + length)).toString('utf8');
    }
  }
  return null;
}
