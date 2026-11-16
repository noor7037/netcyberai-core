import type { MessageKey } from '@/lib/i18n';
import { WORD_MENU_KEYS } from './word-menu-words';
import { INTERACTIVE_KEYS } from './interactive-words';

// The words Understand needs on the phone (M1-5, C251), picked on the server.
export const UNDERSTAND_KEYS: MessageKey[] = [
  ...WORD_MENU_KEYS,
  'fam.label.aiMade', 'fam.label.checked', 'fam.ai.notice.aiMade', 'fam.ai.notice.checked', 'fam.ai.notice.link', 'fam.block.example', 'fam.block.terms', 'fam.block.worked', 'fam.block.answer', 'fam.block.keyPoints',
  'fam.block.english', 'fam.block.pattern', 'fam.block.sayIt', 'fam.block.readAloud', 'fam.block.deviceVoice', 'fam.block.sources', 'fam.block.check',
  'fam.block.practice', 'fam.check.hint', 'fam.check.hintLabel', 'fam.check.right', 'fam.check.notYet', 'fam.check.notThis', 'fam.check.correct', 'fam.check.explainAgain', 'fam.block.mindMap', 
  // The Elaboration Framework (16 Nov 2026): the five steps' names, the levels, listen and the try-it feedback.
  'fam.elab.step.definition', 'fam.elab.step.levels', 'fam.elab.step.real_life', 'fam.elab.step.try_it', 'fam.elab.step.future', 'fam.elab.level.basic', 'fam.elab.level.intermediate', 'fam.elab.level.advanced', 'fam.elab.yourLevel', 'fam.elab.listen', 'fam.elab.stop', 'fam.elab.board', 'fam.elab.steps', 'fam.elab.pick', 'fam.elab.right', 'fam.elab.wrong', 'fam.elab.again', 'fam.elab.picture', 'fam.elab.hint', 'fam.elab.showAnswer', 'fam.elab.checks', 'fam.elab.view3d',
  // W10-6: the scene, the chart and the steps' replay.
  'fam.block.sceneTap', 'fam.block.chartCaption', 'fam.block.chartUnit', 'fam.block.chartTable', 'fam.block.replay',
  // W16-A2: the drawing board, the citation chip and the Class 8 Science simulations.
  'fam.board.prev', 'fam.board.next', 'fam.board.all', 'fam.board.step', 'fam.board.picture', 'fam.cite.chapter', 'fam.cite.chapterUnit', 'fam.cite.general',
  'fam.sim.pressure_depth.depth', 'fam.sim.pressure_depth.readout', 'fam.sim.pressure_depth.formula', 'fam.sim.pressure_depth.note', 'fam.sim.pressure_depth.picture',
  'fam.sim.friction_surface.surface', 'fam.sim.friction_surface.speed', 'fam.sim.friction_surface.dry', 'fam.sim.friction_surface.wet', 'fam.sim.friction_surface.ice', 'fam.sim.friction_surface.readout', 'fam.sim.friction_surface.formula', 'fam.sim.friction_surface.note', 'fam.sim.friction_surface.picture',
  'fam.sim.sound_wave.frequency', 'fam.sim.sound_wave.amplitude', 'fam.sim.sound_wave.readoutPitch', 'fam.sim.sound_wave.readoutLoud', 'fam.sim.sound_wave.note', 'fam.sim.sound_wave.picture',
  // W18-P3: the timeline's reveal.
  'fam.timeline.showAll',
  // W18-P2: the circuit, the motor, the electromagnet and the magnet's field lines.
  'fam.sim.circuit.arrangement', 'fam.sim.circuit.series', 'fam.sim.circuit.parallel', 'fam.sim.circuit.voltage', 'fam.sim.circuit.resistance', 'fam.sim.circuit.readoutSeries', 'fam.sim.circuit.readoutParallel', 'fam.sim.circuit.formula', 'fam.sim.circuit.bright', 'fam.sim.circuit.note', 'fam.sim.circuit.picture', 'fam.sim.dc_motor.current', 'fam.sim.dc_motor.field', 'fam.sim.dc_motor.forward', 'fam.sim.dc_motor.reverse', 'fam.sim.dc_motor.ltr', 'fam.sim.dc_motor.rtl', 'fam.sim.dc_motor.up', 'fam.sim.dc_motor.down', 'fam.sim.dc_motor.anticlockwise', 'fam.sim.dc_motor.clockwise', 'fam.sim.dc_motor.readout', 'fam.sim.dc_motor.formula', 'fam.sim.dc_motor.note', 'fam.sim.dc_motor.picture', 'fam.sim.electromagnet.turns', 'fam.sim.electromagnet.current', 'fam.sim.electromagnet.strength', 'fam.sim.electromagnet.readout', 'fam.sim.electromagnet.formula', 'fam.sim.electromagnet.clips', 'fam.sim.electromagnet.note', 'fam.sim.electromagnet.picture', 'fam.sim.magnet_field.arrangement', 'fam.sim.magnet_field.one', 'fam.sim.magnet_field.unlike', 'fam.sim.magnet_field.like', 'fam.sim.magnet_field.readoutOne', 'fam.sim.magnet_field.readoutUnlike', 'fam.sim.magnet_field.readoutLike', 'fam.sim.magnet_field.formula', 'fam.sim.magnet_field.note', 'fam.sim.magnet_field.picture', 'fam.sim.magnet_field.pictureOne', 'fam.sim.magnet_field.pictureUnlike', 'fam.sim.magnet_field.pictureLike',
  'fam.understand.loading', 'fam.understand.missing', 'fam.understand.cut', 'fam.understand.part.explanation', 'fam.understand.part.check', 'fam.understand.part.practice', 'fam.understand.and', 'fam.understand.followUps', 'fam.understand.directAnswer', 'fam.understand.show3d', 'fam.followUp.simpler', 'fam.followUp.another_example',
  // W23-C: a ready-built lab inside an answer.
  'fam.lab.title', 'fam.lab.open', 'fam.lab.close', 'fam.lab.done', 'fam.lab.frame',
  // W19-D: the 3D model of what the answer explains.
  'fam.mdl.parts', 'fam.mdl.hint', 'fam.mdl.hint2d', 'fam.mdl.ask', 'fam.mdl.aria', 'fam.mdl.saver', 'fam.mdl.credit', 'fam.model.see3d', 'fam.model.back2d', 'fam.model.noGl', 'fam.model.loading', 'fam.model.failed',
  'fam.followUp.differently', 'fam.followUp.practise_more', 'fam.err.network', 'fam.plan.comesBack',
  ...INTERACTIVE_KEYS,
  // M2-5: the honest player under a topic's response.
  'fam.video.title', 'fam.video.note', 'fam.video.play', 'fam.video.length', 'fam.video.by', 'fam.video.frame', 'fam.video.see', 'fam.video.answer', 'fam.video.fallback', 'fam.video.failed',
];
