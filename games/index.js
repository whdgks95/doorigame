// 새 게임을 추가하려면 여기에 등록하고 public/meta.js, public/renderers.js에도 추가하세요.
const list = [
  require('./blackwhite'),
  require('./gyulhap'),
  require('./indian'),
  require('./janggi12'),
  require('./mysterysign'),
  require('./davinci'),
  require('./secretdice'),
];
module.exports = Object.fromEntries(list.map(g => [g.id, g]));
