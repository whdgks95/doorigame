// 미스터리 사인 공식 생성기
// 공식 '틀(family)' 40여 개에 무작위 숫자를 넣어 수천 가지 공식을 만듭니다.
// 각 공식은 { key, family, desc, f(a, b) } 형태입니다. (a = 앞 숫자, b = 뒤 숫자)
const { rint, pick } = require('./util');

const digits = n => String(Math.abs(n)).split('').map(Number);
const dsum = n => digits(n).reduce((x, y) => x + y, 0);
const dprod = n => digits(n).reduce((x, y) => x * y, 1);
const rev = n => Number(String(n).split('').reverse().join(''));
const LOOPS = [1, 0, 0, 0, 0, 0, 1, 0, 2, 1];
const loops = n => digits(n).reduce((x, d) => x + LOOPS[d], 0);
const isPrime = n => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const divCount = n => { let c = 0; for (let k = 1; k * k <= n; k++) if (n % k === 0) c += k * k === n ? 1 : 2; return c; };
const lo = Math.min, hi = Math.max;
const between = (a, b, f) => { let c = 0; for (let k = lo(a, b) + 1; k < hi(a, b); k++) if (f(k)) c++; return c; };
const pop = n => n.toString(2).split('').filter(x => x === '1').length;
const sgn = (x, word = '') => (x === 0 ? '' : x > 0 ? ` + ${x}${word}` : ` − ${-x}${word}`);
const coef = (p, word) => (p === 1 ? word : `${p}×${word}`);

// 각 틀: () => [설명, 함수]
const FAMILIES = {
  linear: () => { const p = rint(1, 9), q = rint(1, 9), r = rint(-10, 20); return [`${coef(p, '앞')} + ${coef(q, '뒤')}${sgn(r)}`, (a, b) => p * a + q * b + r]; },
  linMinus: () => { const p = rint(2, 9), q = rint(1, 5); return [`${coef(p, '앞')} − ${coef(q, '뒤')}`, (a, b) => p * a - q * b]; },
  prodPlus: () => { const p = rint(0, 5), q = rint(0, 5); return [`앞×뒤${sgn(p, '×앞')}${sgn(q, '×뒤')}`, (a, b) => a * b + p * a + q * b]; },
  prodMinus: () => { const p = rint(1, 30); return [`앞×뒤 − ${p}`, (a, b) => a * b - p]; },
  shiftProd: () => { const p = rint(1, 6), q = rint(0, 6); return [`(앞 + ${p}) × (뒤 + ${q})`, (a, b) => (a + p) * (b + q)]; },
  sqPlus: () => { const p = rint(1, 5); return [`앞² + ${coef(p, '뒤')}`, (a, b) => a * a + p * b]; },
  sqSum: () => { const p = rint(-5, 10); return [`앞² + 뒤²${sgn(p)}`, (a, b) => a * a + b * b + p]; },
  sqDiff: () => [`앞² − 뒤²`, (a, b) => a * a - b * b],
  absDiff: () => { const p = rint(1, 9), q = rint(-5, 15); return [`|앞 − 뒤| × ${p}${sgn(q)}`, (a, b) => Math.abs(a - b) * p + q]; },
  maxMin: () => { const p = rint(1, 6); let q = rint(1, 6); if (q === p) q = p + 1; return [`큰 수×${p} + 작은 수×${q}`, (a, b) => hi(a, b) * p + lo(a, b) * q]; },
  maxMinus: () => { const p = rint(2, 5); return [`큰 수×${p} − 작은 수`, (a, b) => hi(a, b) * p - lo(a, b)]; },
  modSum: () => { const p = rint(2, 9), q = rint(2, 9); return [`(앞을 ${p}로 나눈 나머지) + (뒤를 ${q}로 나눈 나머지)`, (a, b) => (a % p) + (b % q)]; },
  sumMod: () => { const p = rint(3, 13); return [`(앞 + 뒤)를 ${p}로 나눈 나머지`, (a, b) => (a + b) % p]; },
  prodMod: () => { const p = rint(3, 13); return [`(앞 × 뒤)를 ${p}로 나눈 나머지`, (a, b) => (a * b) % p]; },
  abMod: () => [`앞을 뒤로 나눈 나머지`, (a, b) => a % b],
  abDiv: () => { const p = rint(0, 9); return [`앞을 뒤로 나눈 몫${sgn(p)}`, (a, b) => Math.floor(a / b) + p]; },
  divDiv: () => { const p = rint(2, 5), q = rint(2, 5); return [`(앞 ÷ ${p}의 몫) + (뒤 ÷ ${q}의 몫)`, (a, b) => Math.floor(a / p) + Math.floor(b / q)]; },
  bigModSmall: () => { const p = rint(1, 4); return [`큰 수를 작은 수로 나눈 나머지 × ${p}`, (a, b) => (hi(a, b) % lo(a, b)) * p]; },
  dsumLin: () => { const p = rint(1, 5), q = rint(1, 5); return [`(앞의 자릿수 합)×${p} + (뒤의 자릿수 합)×${q}`, (a, b) => dsum(a) * p + dsum(b) * q]; },
  dprodSum: () => { const p = rint(0, 9); return [`앞의 각 자리 곱 + 뒤의 각 자리 곱${sgn(p)}`, (a, b) => dprod(a) + dprod(b) + p]; },
  dsumOfSum: () => { const p = rint(1, 5); return [`(앞 + 뒤)의 자릿수 합 × ${p}`, (a, b) => dsum(a + b) * p]; },
  dsumOfProd: () => [`(앞 × 뒤)의 자릿수 합`, (a, b) => dsum(a * b)],
  loops: () => { const p = rint(1, 3), q = rint(0, 9); return [`두 수의 동그라미 개수×${p}${sgn(q)} (0·6·9는 1개, 8은 2개)`, (a, b) => (loops(a) + loops(b)) * p + q]; },
  primesBetween: () => { const p = rint(0, 9); return [`두 수 사이 소수의 개수${sgn(p)}`, (a, b) => between(a, b, isPrime) + p]; },
  multBetween: () => { const p = rint(2, 9); return [`두 수 사이 ${p}의 배수 개수`, (a, b) => between(a, b, k => k % p === 0)]; },
  concat: () => { const p = rint(-20, 20); return [`앞과 뒤를 이어 붙인 수${sgn(p)}`, (a, b) => Number(`${a}${b}`) + p]; },
  concatRev: () => { const p = rint(0, 20); return [`뒤와 앞을 이어 붙인 수${sgn(p)}`, (a, b) => Number(`${b}${a}`) + p]; },
  revSum: () => [`앞을 거꾸로 쓴 수 + 뒤를 거꾸로 쓴 수`, (a, b) => rev(a) + rev(b)],
  revLin: () => { const p = rint(2, 5); return [`(앞을 거꾸로 쓴 수)×${p} + 뒤`, (a, b) => rev(a) * p + b]; },
  gcdLin: () => { const p = rint(1, 9), q = rint(0, 9); return [`최대공약수×${p}${sgn(q)}`, (a, b) => gcd(a, b) * p + q]; },
  lcmPlus: () => { const p = rint(0, 9); return [`최소공배수${sgn(p)}`, (a, b) => (a * b) / gcd(a, b) + p]; },
  divCnt: () => { const p = rint(1, 4), q = rint(1, 4); return [`(앞의 약수 개수)×${p} + (뒤의 약수 개수)×${q}`, (a, b) => divCount(a) * p + divCount(b) * q]; },
  digitLen: () => { const p = rint(2, 9), q = rint(0, 9); return [`두 수의 자릿수 개수 합 × ${p}${sgn(q)}`, (a, b) => (digits(a).length + digits(b).length) * p + q]; },
  oddDigits: () => { const p = rint(1, 5), q = rint(0, 9); return [`두 수에 있는 홀수 숫자 개수 × ${p}${sgn(q)}`, (a, b) => [...digits(a), ...digits(b)].filter(d => d % 2).length * p + q]; },
  digitCount: () => { const d = rint(0, 9), p = rint(1, 9), q = rint(0, 9); return [`두 수에 있는 숫자 ${d}의 개수 × ${p}${sgn(q)}`, (a, b) => [...digits(a), ...digits(b)].filter(x => x === d).length * p + q]; },
  maxDigit: () => { const p = rint(1, 9), q = rint(0, 9); return [`두 수의 숫자 중 가장 큰 숫자 × ${p}${sgn(q)}`, (a, b) => Math.max(...digits(a), ...digits(b)) * p + q]; },
  onesProd: () => { const p = rint(0, 20); return [`앞의 일의 자리 × 뒤의 일의 자리${sgn(p)}`, (a, b) => (a % 10) * (b % 10) + p]; },
  onesLin: () => { const p = rint(1, 9), q = rint(1, 9); return [`(앞의 일의 자리)×${p} + (뒤의 일의 자리)×${q}`, (a, b) => (a % 10) * p + (b % 10) * q]; },
  popcount: () => { const p = rint(1, 3), q = rint(0, 9); return [`두 수를 2진수로 썼을 때 1의 개수 × ${p}${sgn(q)}`, (a, b) => (pop(a) + pop(b)) * p + q]; },
  triangle: () => { const p = rint(1, 3); return [`1부터 앞까지의 합 + ${coef(p, '뒤')}`, (a, b) => (a * (a + 1)) / 2 + p * b]; },
  rangeSum: () => [`작은 수부터 큰 수까지 모든 정수의 합`, (a, b) => ((lo(a, b) + hi(a, b)) * (Math.abs(a - b) + 1)) / 2],
  avgFloor: () => { const p = rint(1, 9); return [`두 수의 평균(내림) × ${p}`, (a, b) => Math.floor((a + b) / 2) * p]; },
  oddEvenSwap: () => { const p = rint(2, 5); return [`앞이 짝수면 앞×${p} + 뒤, 홀수면 앞 + 뒤×${p}`, (a, b) => (a % 2 === 0 ? a * p + b : a + b * p)]; },
  cmpRule: () => { const p = rint(1, 9); return [`앞이 뒤보다 크면 앞 − 뒤, 아니면 앞 + 뒤 + ${p}`, (a, b) => (a > b ? a - b : a + b + p)]; },
};

const FAMILY_NAMES = Object.keys(FAMILIES);
const SAMPLES = (() => { const s = []; for (let k = 0; k < 24; k++) s.push([rint(1, 999), rint(1, 999)]); for (let k = 0; k < 12; k++) s.push([rint(1, 30), rint(1, 30)]); return s; })();

// 출력이 정수이고, 너무 크지 않고, 값이 다양하게 나오는 공식만 사용
function valid(f) {
  const outs = new Set();
  for (const [a, b] of SAMPLES) {
    const z = f(a, b);
    if (!Number.isSafeInteger(z) || Math.abs(z) > 5e7) return false;
    outs.add(z);
  }
  return outs.size >= 4;
}

const recent = []; // 최근 출제된 공식 (서버 전체 기준)
function generate(excludeFamilies = []) {
  for (let tries = 0; tries < 200; tries++) {
    const family = pick(FAMILY_NAMES.filter(n => !excludeFamilies.includes(n)));
    const [desc, f] = FAMILIES[family]();
    const key = family + ':' + desc;
    if (recent.includes(key) || !valid(f)) continue;
    recent.push(key); if (recent.length > 400) recent.shift();
    return { key, family, desc, f };
  }
  const family = pick(FAMILY_NAMES); const [desc, f] = FAMILIES[family]();
  return { key: family + ':' + desc, family, desc, f };
}

// 대략적인 공식 개수 (틀별 숫자 조합 수의 합)
function estimateCount() {
  let total = 0;
  for (const name of FAMILY_NAMES) {
    const seen = new Set();
    for (let k = 0; k < 3000; k++) seen.add(FAMILIES[name]()[0]);
    total += seen.size;
  }
  return total;
}

module.exports = { generate, FAMILIES, FAMILY_NAMES, estimateCount, valid };
