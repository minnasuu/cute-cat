/**
 * 与 frontend/src/data/themes.ts 中 appearanceTemplates 顺序一致（共 17 种外形）
 * 官方猫 template 按下标 i 取用 APPEARANCE_PALETTE[i]
 */
module.exports = [
  // 0 狸花加白
  { body: '#B0A08A', bodyDark: '#5C4A3A', belly: '#FFFFFF', earInner: '#F4B8B8', eyes: '#B2D989', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E', apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7', desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2', paw: '#FFFFFF', tail: '#B0A08A', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 1 蓝猫
  { body: '#8E9AAF', bodyDark: '#6B7A8D', belly: '#B8C4D4', earInner: '#C4A6A6', eyes: '#D4944C', nose: '#B87D75', blush: '#C9A6A6', stroke: '#4A5568', apron: '#5B8DB8', apronLight: '#D0DFE9', apronLine: '#5B8DB8', desk: '#E8D5B8', deskDark: '#C4A87A', deskLeg: '#D4BF9A', paw: '#B8C4D4', tail: '#6B7A8D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 2 踏雪黑猫
  { body: '#3D3D3D', bodyDark: '#2A2A2A', belly: '#3D3D3D', earInner: '#E8909A', eyes: '#000', nose: '#542615', blush: '#F28686', stroke: '#1A1A1A', apron: '#7EB8DA', apronLight: '#D6EAF5', apronLine: '#7EB8DA', desk: '#C8D8E8', deskDark: '#8BA4BD', deskLeg: '#A6BCCF', paw: '#fff', tail: '#3D3D3D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 3 橘猫
  { body: '#F7AC5E', bodyDark: '#D3753E', belly: '', earInner: '#F28686', eyes: '#542615', nose: '#542615', blush: '#F28686', stroke: '#542615', apron: '#BDBDBD', apronLight: '#FEFFFE', apronLine: '#BDBDBD', desk: '#D7CCC8', deskDark: '#A1887F', deskLeg: '#BCAAA4', paw: '', tail: '#F7AC5E', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 4 橘色加白猫
  { body: '#ffb070', bodyDark: '#D3753E', belly: '#ffedd5', earInner: '#F28686', eyes: '#542615', nose: '#542615', blush: '#F28686', stroke: '#542615', apron: '#BDBDBD', apronLight: '#FEFFFE', apronLine: '#BDBDBD', desk: '#D7CCC8', deskDark: '#A1887F', deskLeg: '#BCAAA4', paw: '#ffedd5', tail: '#ffb070', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 5 三花猫
  { body: '#FAFAFA', bodyDark: '', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#542615', nose: '#E8998D', blush: '#FFB5C5', stroke: '#5D4037', apron: '#FFB74D', apronLight: '#FFF3E0', apronLine: '#FFB74D', desk: '#FFE0B2', deskDark: '#FFB74D', deskLeg: '#FFCC80', paw: ['#5C4A3A', '#FAFAFA', '#F7AC5E', '#FAFAFA'], tail: '#5C4A3A', faceDark: '', month: '', head: '#FAFAFA', bodyDarkBottom: '#F7AC5E', leg: ['#F7AC5E', '#FAFAFA', '#5C4A3A', '#F7AC5E'], headTopLeft: '#F7AC5E', headTopRight: '#5C4A3A' },
  // 6 暹罗猫
  { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#4E342E', eyes: '#4FC3F7', nose: '#333', blush: '#FFCCBC', stroke: '#4E342E', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#D1C4E9', deskDark: '#9575CD', deskLeg: '#B39DDB', paw: '#4E342E', tail: '#4E342E', faceDark: '#4E342E', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 7 金色暹罗猫
  { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#F7AC5E', eyes: '#A1E0FF', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#B3E5FC', deskDark: '#4FC3F7', deskLeg: '#81D4FA', paw: '#F7AC5E', tail: '#F7AC5E', faceDark: '#F7AC5E', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 8 黑猫
  { body: '#111', bodyDark: '', belly: '#111', earInner: '#333', eyes: '#D4944C', nose: '#DDD', blush: '#FFCCBC', stroke: '#1A1A1A', desk: '#C8D8E8', apron: '#FFB74D', apronLight: '#FFF3E0', apronLine: '#FFB74D', deskDark: '#8BA4BD', deskLeg: '#A6BCCF', paw: '', tail: '#111', faceDark: '', month: '#999', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 9 白猫
  { body: '#FFF', bodyDark: '#FFF', belly: '#FFF', earInner: '#FFF', eyes: '#5D4037', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#FFF9C4', deskDark: '#FDD835', deskLeg: '#FFF176', paw: '#FFF', tail: '#FFF', faceDark: '', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 10 奶牛猫
  { body: '#FFF', bodyDark: '', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#000', nose: '#E8998D', blush: '#FFB5C5', stroke: '#5D4037', apron: '#FFB74D', apronLight: '#FFF3E0', apronLine: '#FFB74D', desk: '#F8BBD0', deskDark: '#EC407A', deskLeg: '#F48FB1', paw: ['#333', '#FAFAFA', '#333', '#333'], tail: '#333', faceDark: '', month: '', head: '#FFF', bodyDarkBottom: '#333', leg: ['#FAFAFA', '#333', '#333', '#FAFAFA'], headTopLeft: '#333', headTopRight: '#333' },
  // 11 美短
  { body: '#F5F5F5', bodyDark: '#D5D5D5', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#542615', nose: '#542615', blush: '#FFB5C5', stroke: '#333333', apron: '#E8A0BF', apronLight: '#FCE4EC', apronLine: '#E8A0BF', desk: '#E8C8D8', deskDark: '#C4919E', deskLeg: '#D4A8B5', paw: '#FFFFFF', tail: '#F5F5F5', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 12 波斯猫
  { body: '#E8DCD0', bodyDark: '#C8B8A8', belly: '#F5EDE4', earInner: '#F0B8B8', eyes: '#48A8D8', nose: '#D09888', blush: '#F0C0B0', stroke: '#6A5A4A', apron: '#A8C8E0', apronLight: '#E0EEF8', apronLine: '#90B8D0', desk: '#D8D0C0', deskDark: '#B0A890', deskLeg: '#C8C0A8', paw: '#F5EDE4', tail: '#C8B8A8', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 13 灰猫
  { body: '#6B6B78', bodyDark: '#4A4A58', belly: '#9898A8', earInner: '#D8A8B0', eyes: '#70C860', nose: '#907878', blush: '#D0A8B0', stroke: '#38384A', apron: '#7878B0', apronLight: '#D0D0E8', apronLine: '#6868A0', desk: '#B8B8D0', deskDark: '#8888A0', deskLeg: '#A0A0B8', paw: '#9898A8', tail: '#4A4A58', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 14 缅因猫
  { body: '#F0E0C0', bodyDark: '#D8C8A0', belly: '#FAF0E0', earInner: '#F4B8B8', eyes: '#60B8E8', nose: '#E0A090', blush: '#F4C8B0', stroke: '#8A7A5A', apron: '#F0C878', apronLight: '#FFF5E0', apronLine: '#E0B868', desk: '#F0E0C0', deskDark: '#C8B890', deskLeg: '#D8D0A8', paw: '#FAF0E0', tail: '#D8C8A0', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 15 加菲猫
  { body: '#D4A76A', bodyDark: '#B8863A', belly: '#F5E6CC', earInner: '#F4B8B8', eyes: '#E8A020', nose: '#D4836A', blush: '#F0C0A0', stroke: '#6B4226', apron: '#E8C07A', apronLight: '#FFF3D6', apronLine: '#D4A76A', desk: '#F0D8A8', deskDark: '#C8A868', deskLeg: '#D8C090', paw: '#F5E6CC', tail: '#B8863A', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  // 16 俄罗斯蓝猫
  { body: '#B8B0A0', bodyDark: '#908878', belly: '#D8D0C8', earInner: '#E0A8A8', eyes: '#40A070', nose: '#A08878', blush: '#D0B0A0', stroke: '#585048', apron: '#A0B8A0', apronLight: '#D8E8D8', apronLine: '#88A888', desk: '#C8C0B0', deskDark: '#A09888', deskLeg: '#B8B0A0', paw: '#D8D0C8', tail: '#908878', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
];
