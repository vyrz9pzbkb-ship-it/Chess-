// Minimal PGN reader: headers + mainline SAN moves (comments, variations and NAGs dropped).
const fs = require('fs');
function parsePgnFile(file) {
  const txt = fs.readFileSync(file, 'latin1').replace(/\r/g, '');
  const out = [];
  for (const chunk of txt.split(/\n(?=\[Event )/)) {
    const headers = {};
    chunk.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { headers[k] = v.trim(); });
    let body = chunk.replace(/\[[^\]]*\]/g, ' ');
    body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    while (/\([^()]*\)/.test(body)) body = body.replace(/\([^()]*\)/g, ' ');
    body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ');
    const sans = body.split(/\s+/).filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)).map(t => t.replace(/[!?]+$/, ''));
    if (sans.length) out.push({ headers, sans });
  }
  return out;
}
module.exports = { parsePgnFile };
