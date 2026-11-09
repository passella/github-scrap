const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function computeCrc32(uint8Array) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < uint8Array.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ uint8Array[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export async function deflateRaw(uint8Array) {
  if (typeof CompressionStream === 'undefined') {
    return null;
  }
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(uint8Array);
    writer.close();
    const response = new Response(cs.readable);
    const compressedBuffer = await response.arrayBuffer();
    const compressedBytes = new Uint8Array(compressedBuffer);
    if (compressedBytes.length < uint8Array.length) {
      return compressedBytes;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDosDateTime(date = new Date()) {
  const year = date.getFullYear();
  const dosYear = year < 1980 ? 0 : year - 1980;
  const dosDate = ((dosYear & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  const dosTime = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >>> 1) & 0x1F);
  return { dosDate, dosTime };
}

export class ZipBuilder {
  constructor() {
    this.entries = [];
  }

  async addFile(path, dataUint8) {
    const filenameBytes = new TextEncoder().encode(path);
    const uncompressedSize = dataUint8.length;
    const crc = computeCrc32(dataUint8);

    let compressedData = null;
    let method = 0;

    if (uncompressedSize > 16) {
      compressedData = await deflateRaw(dataUint8);
    }

    if (compressedData && compressedData.length < uncompressedSize) {
      method = 8;
    } else {
      compressedData = dataUint8;
      method = 0;
    }

    this.entries.push({
      path,
      filenameBytes,
      data: compressedData,
      crc,
      method,
      compressedSize: compressedData.length,
      uncompressedSize,
    });
  }

  buildUint8Array() {
    const { dosDate, dosTime } = getDosDateTime();
    let totalLocalHeadersSize = 0;
    let totalCentralDirectorySize = 0;

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      totalLocalHeadersSize += 30 + entry.filenameBytes.length + entry.compressedSize;
      totalCentralDirectorySize += 46 + entry.filenameBytes.length;
    }

    const endOfCentralDirSize = 22;
    const totalArchiveSize = totalLocalHeadersSize + totalCentralDirectorySize + endOfCentralDirSize;

    const buffer = new ArrayBuffer(totalArchiveSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    let offset = 0;
    const localOffsets = new Uint32Array(this.entries.length);

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      localOffsets[i] = offset;

      view.setUint32(offset, 0x04034b50, true);
      view.setUint16(offset + 4, 20, true);
      view.setUint16(offset + 6, 0x0800, true);
      view.setUint16(offset + 8, entry.method, true);
      view.setUint16(offset + 10, dosTime, true);
      view.setUint16(offset + 12, dosDate, true);
      view.setUint32(offset + 14, entry.crc, true);
      view.setUint32(offset + 18, entry.compressedSize, true);
      view.setUint32(offset + 22, entry.uncompressedSize, true);
      view.setUint16(offset + 26, entry.filenameBytes.length, true);
      view.setUint16(offset + 28, 0, true);

      uint8.set(entry.filenameBytes, offset + 30);
      offset += 30 + entry.filenameBytes.length;

      uint8.set(entry.data, offset);
      offset += entry.compressedSize;
    }

    const centralDirectoryStartOffset = offset;

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      const localHeaderOffset = localOffsets[i];

      view.setUint32(offset, 0x02014b50, true);
      view.setUint16(offset + 4, 20, true);
      view.setUint16(offset + 6, 20, true);
      view.setUint16(offset + 8, 0x0800, true);
      view.setUint16(offset + 10, entry.method, true);
      view.setUint16(offset + 12, dosTime, true);
      view.setUint16(offset + 14, dosDate, true);
      view.setUint32(offset + 16, entry.crc, true);
      view.setUint32(offset + 20, entry.compressedSize, true);
      view.setUint32(offset + 24, entry.uncompressedSize, true);
      view.setUint16(offset + 28, entry.filenameBytes.length, true);
      view.setUint16(offset + 30, 0, true);
      view.setUint16(offset + 32, 0, true);
      view.setUint16(offset + 34, 0, true);
      view.setUint16(offset + 36, 0, true);
      view.setUint32(offset + 38, 0, true);
      view.setUint32(offset + 42, localHeaderOffset, true);

      uint8.set(entry.filenameBytes, offset + 46);
      offset += 46 + entry.filenameBytes.length;
    }

    const centralDirectoryEndOffset = offset;
    const centralDirectoryLength = centralDirectoryEndOffset - centralDirectoryStartOffset;

    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, this.entries.length, true);
    view.setUint16(offset + 10, this.entries.length, true);
    view.setUint32(offset + 12, centralDirectoryLength, true);
    view.setUint32(offset + 16, centralDirectoryStartOffset, true);
    view.setUint16(offset + 20, 0, true);

    return new Uint8Array(buffer);
  }

  buildBlob() {
    const uint8 = this.buildUint8Array();
    return new Blob([uint8], { type: 'application/zip' });
  }
}

export class ZipEncoder {
  static async encode(entries = []) {
    const builder = new ZipBuilder();
    for (let i = 0; i < entries.length; i += 1) {
      const item = entries[i];
      if (!item || !item.path) continue;
      let bytes = item.data !== undefined ? item.data : item.content;
      if (typeof bytes === 'string') {
        bytes = new TextEncoder().encode(bytes);
      } else if (bytes instanceof ArrayBuffer) {
        bytes = new Uint8Array(bytes);
      } else if (ArrayBuffer.isView(bytes)) {
        bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      } else if (!bytes) {
        bytes = new Uint8Array(0);
      }
      await builder.addFile(item.path, bytes);
    }
    return builder.buildUint8Array();
  }
}
