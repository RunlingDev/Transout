// 头像工具：邮箱 → Cravatar/Gravatar URL（内置 MD5，无第三方依赖）

// 按 RFC 1321 实现的 MD5（K 表由 sin 生成，避免硬编码错误）
function md5(input) {
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]
  const K = []
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  // UTF-8 编码为字节数组
  const str = unescape(encodeURIComponent(input))
  const bytes = []
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLen / 2 ** (8 * i)) % 256)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < bytes.length; off += 64) {
    const M = []
    for (let i = 0; i < 16; i++) {
      M[i] = bytes[off + i * 4]
        | (bytes[off + i * 4 + 1] << 8)
        | (bytes[off + i * 4 + 2] << 16)
        | (bytes[off + i * 4 + 3] << 24)
    }
    let A = a0; let B = b0; let C = c0; let D = d0
    for (let i = 0; i < 64; i++) {
      let F; let g
      if (i < 16) { F = (B & C) | (~B & D); g = i } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 } else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + M[g]) | 0
      A = D; D = C; C = B
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0
  }

  const hex = (n) => {
    let s = ''
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    return s
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

// 邮箱头像 URL：无邮箱或无头像时由 d=retro 兜底生成几何头像
export function avatarUrl(email, size = 80) {
  const hash = md5((email || '').trim().toLowerCase() || 'transout')
  return `https://cravatar.cn/avatar/${hash}?s=${size}&d=retro`
}
