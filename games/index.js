// 게임 등록. 기본/심화를 함께 내보내는 모듈은 배열을 export 합니다.
// 새 게임을 추가하려면 여기에 등록하고 public/meta.js, public/renderers.js에도 추가하세요.
const list = [
  require('./blackwhite'),
  require('./gyulhap'),
  require('./indian'),
  require('./janggi12'),
  require('./mysterysign'),
  require('./davinci'),
  require('./secretdice'),
  require('./yahtzee'),
  require('./memorypoker'),
].flat();
module.exports = Object.fromEntries(list.map(g => [g.id, g]));
