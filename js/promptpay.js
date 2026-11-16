/**
 * PETTY SHOP - Offline PromptPay EMVCo Payload & QR Code Generator
 * สร้าง QR พร้อมเพย์มาตรฐาน EMVCo ของประเทศไทย และวาด SVG QR code ได้ 100% ออฟไลน์
 */

class PromptPayQR {
  /**
   * คำนวณ CRC16-CCITT (0xFFFF, Poly 0x1021)
   */
  static crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
      x ^= x >> 4;
      crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  /**
   * จัดรูปแบบ TLV (Tag-Length-Value)
   */
  static formatTLV(tag, value) {
    const valStr = String(value);
    const lenStr = String(valStr.length).padStart(2, "0");
    return `${tag}${lenStr}${valStr}`;
  }

  /**
   * สร้างเพย์โหลด PromptPay EMVCo
   * @param {string} target - เบอร์มือถือ 10 หลัก หรือ บัตรประชาชน/เลขผู้เสียภาษี 13 หลัก
   * @param {number|null} amount - ยอดเงิน (บาท)
   */
  static generatePayload(target, amount = null) {
    // ล้างตัวอักษรพิเศษ เหลือแต่ตัวเลข
    const cleanTarget = String(target || "").replace(/[^0-9]/g, "");

    // ตรวจสอบว่าเป็นมือถือหรือบัตรประชาชน
    let targetType = "01"; // 01 = Mobile, 02 = CitizenID/TaxID
    let formattedTarget = cleanTarget;

    if (cleanTarget.length === 10 && cleanTarget.startsWith("0")) {
      // แปลง 08x เป็น 00668x
      formattedTarget = "0066" + cleanTarget.substring(1);
      targetType = "01";
    } else if (cleanTarget.length === 13) {
      targetType = "02";
      formattedTarget = cleanTarget;
    } else {
      // Fallback เป็น mobile
      if (cleanTarget.startsWith("0")) {
        formattedTarget = "0066" + cleanTarget.substring(1);
      }
    }

    // AID ของ PromptPay: A000000677010111
    const aid = "A000000677010111";
    const subMerchant = this.formatTLV("00", aid) + this.formatTLV(targetType, formattedTarget);
    const tag29 = this.formatTLV("29", subMerchant);

    // Dynamic QR (12) หรือ Static QR (11)
    const isDynamic = amount !== null && amount > 0;
    const tag01 = this.formatTLV("01", isDynamic ? "12" : "11");

    let payload = "";
    payload += this.formatTLV("00", "01"); // Payload Format Indicator
    payload += tag01;                      // Point of Initiation
    payload += tag29;                      // Merchant Account Info
    payload += this.formatTLV("53", "764"); // Currency THB (764)

    if (isDynamic) {
      const formattedAmount = Number(amount).toFixed(2);
      payload += this.formatTLV("54", formattedAmount);
    }

    payload += this.formatTLV("58", "TH"); // Country Code

    // เพิ่ม tag 63 สำหรับ CRC
    const rawWithTag63 = payload + "6304";
    const checksum = this.crc16(rawWithTag63);

    return rawWithTag63 + checksum;
  }
}

/**
 * Self-contained Pure JS QR Code Matrix Generator (Model 2, Byte Mode, Ecc L/M)
 * อัลกอริทึมมาตรฐานที่สร้างโมดูล QR Code โดยไม่ต้องพึ่งไลบรารีภายนอก
 */
class SimpleQRCode {
  constructor(text, errorCorrection = 'M') {
    this.text = text;
    this.ecLevel = errorCorrection; // 'L', 'M', 'Q', 'H'
    this.modules = [];
    this.moduleCount = 0;
    this.make();
  }

  make() {
    // เลือกเวอร์ชันที่จุข้อมูล text ได้พอดี
    const length = new TextEncoder().encode(this.text).length;
    // Capacity table for byte mode (EC level M)
    const capacities = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];
    let version = 1;
    while (version < capacities.length && capacities[version] < length) {
      version++;
    }
    if (version >= capacities.length) version = 10; // fallback

    this.version = version;
    this.moduleCount = version * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () => Array(this.moduleCount).fill(null));

    // Place Finder Patterns
    this.placeFinderPattern(0, 0);
    this.placeFinderPattern(this.moduleCount - 7, 0);
    this.placeFinderPattern(0, this.moduleCount - 7);

    // Place Timing Patterns
    for (let i = 8; i < this.moduleCount - 8; i++) {
      const bit = (i % 2 === 0);
      if (this.modules[6][i] === null) this.modules[6][i] = bit;
      if (this.modules[i][6] === null) this.modules[i][6] = bit;
    }

    // Place Alignment patterns for version >= 2
    if (version >= 2) {
      const alignPos = this.getAlignmentPositions(version);
      for (let r of alignPos) {
        for (let c of alignPos) {
          if (this.modules[r][c] === null) {
            this.placeAlignmentPattern(r, c);
          }
        }
      }
    }

    // Reserve Format Info
    for (let i = 0; i < 9; i++) {
      if (this.modules[8][i] === null) this.modules[8][i] = false;
      if (this.modules[i][8] === null) this.modules[i][8] = false;
    }
    for (let i = 0; i < 8; i++) {
      if (this.modules[8][this.moduleCount - 1 - i] === null) this.modules[8][this.moduleCount - 1 - i] = false;
      if (this.modules[this.moduleCount - 1 - i][8] === null) this.modules[this.moduleCount - 1 - i][8] = false;
    }
    this.modules[this.moduleCount - 8][8] = true; // Dark module

    // Data Codewords & Reed-Solomon EC
    const dataBytes = this.createDataBytes();

    // Place Data
    this.placeData(dataBytes);

    // Mask Pattern 0: (row + col) % 2 === 0
    this.applyMask(0);

    // Place Format Info (Mask 0, EC level M = 00)
    this.placeFormatInfo(0);
  }

  getAlignmentPositions(version) {
    if (version === 1) return [];
    if (version === 2) return [6, 18];
    if (version === 3) return [6, 22];
    if (version === 4) return [6, 26];
    if (version === 5) return [6, 30];
    if (version === 6) return [6, 34];
    return [6, this.moduleCount - 7];
  }

  placeFinderPattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= this.moduleCount || nc < 0 || nc >= this.moduleCount) continue;
        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          this.modules[nr][nc] = true;
        } else {
          this.modules[nr][nc] = false;
        }
      }
    }
  }

  placeAlignmentPattern(row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          this.modules[row + r][col + c] = true;
        } else {
          this.modules[row + r][col + c] = false;
        }
      }
    }
  }

  createDataBytes() {
    // Byte mode header: 0100 + char count (8-bit for v1-9) + data
    const bytes = new TextEncoder().encode(this.text);
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(0b0100, 4); // Byte mode indicator
    pushBits(bytes.length, this.version < 10 ? 8 : 16);
    for (let b of bytes) pushBits(b, 8);

    // Terminator
    const totalDataBits = this.getDataCapacityBits(this.version);
    const termLen = Math.min(4, totalDataBits - bits.length);
    pushBits(0, termLen);

    // Pad to byte
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad bytes
    const padBytes = [0xEC, 0x11];
    let padIdx = 0;
    while (bits.length < totalDataBits) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    // Convert bits to bytes
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byteVal = 0;
      for (let j = 0; j < 8; j++) byteVal = (byteVal << 1) | bits[i + j];
      dataCodewords.push(byteVal);
    }

    // Calculate Reed-Solomon EC bytes
    const ecCount = this.getECCodewordsCount(this.version);
    const ecCodewords = this.calculateReedSolomon(dataCodewords, ecCount);

    return [...dataCodewords, ...ecCodewords];
  }

  getDataCapacityBits(version) {
    // Total data bits for EC level M
    const capacities = [0, 128, 224, 352, 512, 688, 864, 992, 1232, 1456, 1728];
    return capacities[version] || 1000;
  }

  getECCodewordsCount(version) {
    // EC level M count
    const counts = [0, 10, 16, 26, 18 * 2, 24 * 2, 16 * 4, 18 * 4, 22 * 4, 22 * 5, 26 * 5];
    return counts[version] || 20;
  }

  calculateReedSolomon(data, ecCount) {
    // Galois field math
    const exp = new Uint8Array(512);
    const log = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      exp[i + 255] = x;
      log[x] = i;
      x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
    }

    // Generator polynomial
    let gen = [1];
    for (let i = 0; i < ecCount; i++) {
      const nextGen = new Uint8Array(gen.length + 1);
      for (let j = 0; j < gen.length; j++) {
        nextGen[j] ^= gen[j];
        const factor = exp[(log[gen[j]] + exp[i]) % 255];
        nextGen[j + 1] ^= factor;
      }
      gen = Array.from(nextGen);
    }

    // Division
    const remainder = new Uint8Array(ecCount);
    for (let byte of data) {
      const lead = byte ^ remainder[0];
      for (let i = 0; i < ecCount - 1; i++) remainder[i] = remainder[i + 1];
      remainder[ecCount - 1] = 0;
      if (lead !== 0) {
        const factor = log[lead];
        for (let i = 0; i < ecCount; i++) {
          remainder[i] ^= exp[(log[gen[i + 1]] + factor) % 255];
        }
      }
    }
    return Array.from(remainder);
  }

  placeData(dataBytes) {
    let byteIdx = 0;
    let bitIdx = 7;
    let up = true;

    for (let right = this.moduleCount - 1; right > 0; right -= 2) {
      if (right === 6) right--; // Skip vertical timing pattern
      for (let vert = 0; vert < this.moduleCount; vert++) {
        const row = up ? this.moduleCount - 1 - vert : vert;
        for (let col = right; col >= right - 1; col--) {
          if (this.modules[row][col] === null) {
            let bit = false;
            if (byteIdx < dataBytes.length) {
              bit = ((dataBytes[byteIdx] >> bitIdx) & 1) === 1;
              bitIdx--;
              if (bitIdx < 0) {
                bitIdx = 7;
                byteIdx++;
              }
            }
            this.modules[row][col] = bit;
          }
        }
      }
      up = !up;
    }
  }

  applyMask(pattern) {
    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        // Skip function modules
        if (this.isFunctionModule(r, c)) continue;
        const mask = (r + c) % 2 === 0;
        if (mask) this.modules[r][c] = !this.modules[r][c];
      }
    }
  }

  isFunctionModule(r, c) {
    // Finder patterns & separators
    if (r < 9 && c < 9) return true;
    if (r < 9 && c >= this.moduleCount - 8) return true;
    if (r >= this.moduleCount - 8 && c < 9) return true;
    // Timing patterns
    if (r === 6 || c === 6) return true;
    // Dark module
    if (r === this.moduleCount - 8 && c === 8) return true;
    return false;
  }

  placeFormatInfo(mask) {
    // EC M (00) + Mask 0 (000) => 0b00000 => with BCH code: 0x5412 ^ 0x4A65 = 0x1E77
    const formatBits = 0x1E77;
    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >> i) & 1) === 1;
      // Top left
      if (i < 6) this.modules[8][i] = bit;
      else if (i < 8) this.modules[8][i + 1] = bit;
      else if (i === 8) this.modules[7][8] = bit;
      else this.modules[14 - i][8] = bit;

      // Bottom left & Top right
      if (i < 8) {
        this.modules[this.moduleCount - 1 - i][8] = bit;
      } else {
        this.modules[8][this.moduleCount - 15 + i] = bit;
      }
    }
  }

  toSVG(size = 240, margin = 4, fgColor = "#1B4931", bgColor = "#FFFFFF") {
    const totalSize = this.moduleCount + margin * 2;
    const moduleSize = size / totalSize;
    let rects = "";

    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        if (this.modules[r][c]) {
          const x = (c + margin) * moduleSize;
          const y = (r + margin) * moduleSize;
          rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(moduleSize + 0.1).toFixed(2)}" height="${(moduleSize + 0.1).toFixed(2)}" fill="${fgColor}"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="${bgColor}" rx="12"/>
      ${rects}
    </svg>`;
  }
}

/**
 * Render PromptPay QR into an HTMLElement
 */
function renderPromptPayQR(containerElement, target, amount = null, size = 260) {
  if (!containerElement) return;
  const payload = PromptPayQR.generatePayload(target, amount);
  const qr = new SimpleQRCode(payload, 'M');
  const svg = qr.toSVG(size, 4, "#1E4D38", "#FFFFFF");
  containerElement.innerHTML = svg;
  return payload;
}
