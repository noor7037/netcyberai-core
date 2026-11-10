// "Say it": the word or selection read with the Family voice (the phone's own, or the Android app's), in the text's own
// language. It stops whatever else is being read first, and tells the answer readers to reset their buttons.
export async function sayWord(text: string, lang: 'en' | 'hi'): Promise<void> {
  window.dispatchEvent(new CustomEvent('fam:answer-speaking', { detail: 'word-menu' }));
  const { speakLine } = await import('../voice/lineVoice');
  await speakLine('phone', { kind: 'chapter', chapterKey: '', blockId: '', sentence: 0 }, { text, lang, rate: 0.85 });
}
