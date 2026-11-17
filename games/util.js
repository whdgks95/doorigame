function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const coin = () => (Math.random() < 0.5 ? 0 : 1);
const isInt = n => Number.isInteger(n);
const rint = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
module.exports = { shuffle, coin, isInt, rint, pick };
