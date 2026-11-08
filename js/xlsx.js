/* ============================================================================
 * XLSXMini — minimal true .xlsx (Excel) writer, no dependencies.
 * Builds an Open-XML workbook (stored zip) from an array of rows.
 *   XLSXMini.build(sheetName, rows) → Blob (.xlsx)
 * rows = [[cell, cell, ...], ...]; strings → text cells, numbers → numeric.
 * ==========================================================================*/
window.XLSXMini = (function () {
  'use strict';

  // ---------- crc32 ----------
  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
    return CRC_TABLE;
  }
  function crc32(buf) {
    const t = crcTable();
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  // ---------- tiny stored-zip writer ----------
  function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }
  function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]; }

  function zip(files) { // files: [{ name, data: Uint8Array }]
    const chunks = [];
    const central = [];
    let offset = 0;
    const te = new TextEncoder();

    for (const file of files) {
      const nameBytes = te.encode(file.name);
      const crc = crc32(file.data);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(file.data.length), ...u32(file.data.length),
        ...u16(nameBytes.length), ...u16(0), ...nameBytes,
      ]);
      chunks.push(local, file.data);
      central.push(new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(file.data.length), ...u32(file.data.length),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
        ...nameBytes,
      ]));
      offset += local.length + file.data.length;
    }
    let centralSize = 0;
    for (const c of central) centralSize += c.length;
    const eocd = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0),
    ]);
    return new Blob([...chunks, ...central, eocd], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // ---------- sheet XML ----------
  function colRef(n) { // 1-based → A, B, ... P
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  function escXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[c]));
  }

  function sheetXml(rows) {
    let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    rows.forEach((row, ri) => {
      out += '<row r="' + (ri + 1) + '">';
      row.forEach((cell, ci) => {
        const ref = colRef(ci + 1) + (ri + 1);
        if (cell === null || cell === undefined || cell === '') return; // empty
        if (typeof cell === 'number' && isFinite(cell)) {
          out += '<c r="' + ref + '"><v>' + cell + '</v></c>';
        } else {
          // keep leading zeros: phone numbers are passed as strings by the caller
          out += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escXml(cell) + '</t></is></c>';
        }
      });
      out += '</row>';
    });
    out += '</sheetData></worksheet>';
    return out;
  }

  function build(sheetName, rows) {
    const te = new TextEncoder();
    const name = (sheetName || 'Sheet1').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
    const files = [
      { name: '[Content_Types].xml', data: te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>') },
      { name: 'xl/workbook.xml', data: te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + escXml(name) + '" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', data: te.encode(sheetXml(rows)) },
    ];
    return zip(files);
  }

  return { build };
})();
