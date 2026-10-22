import type { MessageKey } from '@/lib/i18n';

// The words the interactive blocks need on the phone (M2-8, C282), picked on the server with Understand's.
export const INTERACTIVE_KEYS: MessageKey[] = [
  'fam.block.graph.picture', 'fam.block.graph.slider', 'fam.block.graph.point', 'fam.block.graph.noValue',
  'fam.block.numberLine.picture', 'fam.block.numberLine.mark', 'fam.block.numberLine.interval', 'fam.block.numberLine.included', 'fam.block.numberLine.excluded',
  'fam.block.fraction.picture', 'fam.block.fraction.slider', 'fam.block.fraction.larger', 'fam.block.fraction.equal', 'fam.block.fraction.why',
  'fam.block.geo.anglePicture', 'fam.block.geo.slider', 'fam.block.geo.angle', 'fam.block.geo.kind.acute', 'fam.block.geo.kind.right', 'fam.block.geo.kind.obtuse',
  'fam.block.geo.kind.straight', 'fam.block.geo.kind.reflex', 'fam.block.geo.trianglePicture', 'fam.block.geo.sides', 'fam.block.geo.angles',
  'fam.block.geo.circlePicture', 'fam.block.geo.circle', 'fam.block.geo.chord',
  'fam.block.sim.play', 'fam.block.sim.pause', 'fam.block.sim.still', 'fam.block.sim.noAir',
  'fam.block.sim.pendulum.length', 'fam.block.sim.pendulum.picture', 'fam.block.sim.pendulum.period', 'fam.block.sim.pendulum.formula',
  'fam.block.sim.projectile.speed', 'fam.block.sim.projectile.angle', 'fam.block.sim.projectile.picture', 'fam.block.sim.projectile.range',
  'fam.block.sim.projectile.peak', 'fam.block.sim.projectile.time', 'fam.block.sim.projectile.formula',
  'fam.block.sim.ohms_law.voltage', 'fam.block.sim.ohms_law.resistance', 'fam.block.sim.ohms_law.picture', 'fam.block.sim.ohms_law.current', 'fam.block.sim.ohms_law.formula',
  'fam.block.sim.refraction.n1', 'fam.block.sim.refraction.n2', 'fam.block.sim.refraction.incidence', 'fam.block.sim.refraction.picture',
  'fam.block.sim.refraction.refracted', 'fam.block.sim.refraction.tir', 'fam.block.sim.refraction.critical', 'fam.block.sim.refraction.noCritical',
  'fam.block.sim.refraction.formula',
];
