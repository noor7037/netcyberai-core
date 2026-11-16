import type { ImageQuery } from '@/lib/family/blocks';

// The youngest children's photograph (C526). LKG to Class 2 under a prompt that draws first get the board, a very short
// explanation and a check (plan-shape.ts YOUNG_VISUAL_BLOCKS). When the question is about a real thing a small child
// knows (an animal, a plant, a fruit, the sky, a vehicle) or a shape (a circle, a cube), the answer also shows a real
// photograph of it after the animated board: the drawing explains, the photo shows the thing. A photo is never labelled (16 Nov 2026).
//
// Deterministic, with no AI call: the child's question and the board's title are matched against this list, and the
// search words and the caption are the list's own (never the child's words), in the child's language. A shape is shown
// by a real object of that shape. No match, or an answer that already has a photo, adds nothing.

type Thing = { match: RegExp; hi: RegExp | null; query: string; en: string; hiCaption: string };

const T = (en: string, roman: string[], hi: string[], query: string, enCaption: string, hiCaption: string): Thing => ({
  match: new RegExp(`\\b(?:${[en, ...roman].join('|')})(?:s|es)?\\b`, 'i'),
  // A Hindi word standing alone, or with a plural or oblique ending (पेड़ों, कुत्ते is listed whole); never inside a
  // longer word.
  hi: hi.length ? new RegExp(`(?<![\\u0900-\\u097F])(?:${hi.join('|')})(?:ों|ें|े)?(?![\\u0900-\\u097F])`) : null,
  query,
  en: enCaption,
  hiCaption,
});

export const YOUNG_THINGS: readonly Thing[] = [
  // Animals and birds.
  T('cow', ['gaay', 'gai'], ['गाय'], 'cow', 'Cow.', 'गाय।'),
  T('dog', ['kutta'], ['कुत्ता', 'कुत्ते'], 'dog', 'Dog.', 'कुत्ता।'),
  T('cat', ['billi'], ['बिल्ली'], 'cat', 'Cat.', 'बिल्ली।'),
  T('elephant', ['hathi', 'haathi'], ['हाथी'], 'elephant', 'Elephant.', 'हाथी।'),
  T('lion', ['sher'], ['शेर'], 'lion', 'Lion.', 'शेर।'),
  T('tiger', ['baagh', 'bagh'], ['बाघ'], 'tiger', 'Tiger.', 'बाघ।'),
  T('horse', ['ghoda'], ['घोड़ा', 'घोड़े'], 'horse', 'Horse.', 'घोड़ा।'),
  T('camel', ['oont', 'unt'], ['ऊँट', 'ऊंट'], 'camel', 'Camel.', 'ऊँट।'),
  T('monkey', ['bandar'], ['बंदर'], 'monkey', 'Monkey.', 'बंदर।'),
  T('parrot', ['tota'], ['तोता', 'तोते'], 'parrot', 'Parrot.', 'तोता।'),
  T('peacock', ['mor'], ['मोर'], 'peacock', 'Peacock.', 'मोर।'),
  T('sparrow', ['chidiya', 'gauraiya'], ['गौरैया', 'चिड़िया'], 'sparrow bird', 'Sparrow.', 'गौरैया।'),
  T('hen', ['murgi'], ['मुर्गी'], 'hen chicken', 'Hen.', 'मुर्गी।'),
  T('fish', ['machli', 'machhli'], ['मछली'], 'fish', 'Fish.', 'मछली।'),
  T('frog', ['mendhak'], ['मेंढक'], 'frog', 'Frog.', 'मेंढक।'),
  T('butterfly', ['titli'], ['तितली'], 'butterfly', 'Butterfly.', 'तितली।'),
  T('ant', ['cheenti', 'chinti'], ['चींटी'], 'ant', 'Ant.', 'चींटी।'),
  T('honeybee', ['bee', 'madhumakhi'], ['मधुमक्खी'], 'honey bee', 'Honeybee.', 'मधुमक्खी।'),
  // Plants and food.
  T('tree', ['ped', 'pedh'], ['पेड़'], 'tree', 'Tree.', 'पेड़।'),
  T('flower', ['phool'], ['फूल'], 'flower', 'Flower.', 'फूल।'),
  T('leaf', ['leaves', 'patta', 'patti'], ['पत्ता', 'पत्ती', 'पत्ते'], 'green leaf', 'Leaf.', 'पत्ता।'),
  T('lotus', ['kamal'], ['कमल'], 'lotus flower', 'Lotus.', 'कमल।'),
  T('sunflower', ['surajmukhi'], ['सूरजमुखी'], 'sunflower', 'Sunflower.', 'सूरजमुखी।'),
  T('mango', [], [], 'mango fruit', 'Mango.', 'आम।'),
  T('banana', ['kela'], ['केला', 'केले'], 'banana fruit', 'Banana.', 'केला।'),
  T('apple', ['seb'], ['सेब'], 'apple fruit', 'Apple.', 'सेब।'),
  T('coconut', ['nariyal'], ['नारियल'], 'coconut', 'Coconut.', 'नारियल।'),
  T('seed', ['beej'], ['बीज'], 'seeds', 'Seeds.', 'बीज।'),
  // The sky, water and land.
  T('sun', ['suraj', 'sooraj'], ['सूरज', 'सूर्य'], 'sun sky', 'The Sun in the sky.', 'आसमान में सूरज।'),
  T('moon', ['chand', 'chaand'], ['चाँद', 'चांद', 'चंद्रमा'], 'full moon', 'The Moon.', 'चाँद।'),
  T('rainbow', ['indradhanush'], ['इंद्रधनुष'], 'rainbow', 'Rainbow.', 'इंद्रधनुष।'),
  T('cloud', ['badal', 'baadal'], ['बादल'], 'clouds sky', 'Clouds.', 'बादल।'),
  T('river', ['nadi'], ['नदी'], 'river', 'River.', 'नदी।'),
  T('mountain', ['pahad', 'parvat'], ['पहाड़', 'पर्वत'], 'mountain', 'Mountain.', 'पहाड़।'),
  T('sea', ['ocean', 'samudra', 'samundar'], ['समुद्र'], 'sea beach', 'The sea.', 'समुद्र।'),
  // Things around the child.
  T('bus', [], [], 'bus', 'Bus.', 'बस।'),
  T('train', ['rail'], ['रेलगाड़ी', 'ट्रेन'], 'train', 'Train.', 'रेलगाड़ी।'),
  T('aeroplane', ['airplane', 'plane', 'hawai jahaz'], ['हवाई जहाज़', 'हवाई जहाज'], 'airplane', 'Aeroplane.', 'हवाई जहाज़।'),
  T('boat', ['naav'], ['नाव'], 'boat', 'Boat.', 'नाव।'),
  T('bicycle', ['saikil'], ['साइकिल'], 'bicycle', 'Bicycle.', 'साइकिल।'),
  T('kite', ['patang'], ['पतंग'], 'kite flying', 'Kite.', 'पतंग।'),
  T('umbrella', ['chhata', 'chhatri'], ['छाता'], 'umbrella', 'Umbrella.', 'छाता।'),
  T('clock', ['ghadi'], ['घड़ी'], 'clock', 'Clock.', 'घड़ी।'),
  // Shapes: shown by a real object of that shape.
  T('circle', ['gol'], ['वृत्त', 'गोल'], 'wheel', 'A wheel is round like a circle.', 'पहिया वृत्त जैसा गोल है।'),
  T('triangle', ['tribhuj'], ['त्रिभुज'], 'triangle road sign', 'A thing shaped like a triangle.', 'त्रिभुज के आकार की चीज़।'),
  T('square', ['varg'], ['वर्ग'], 'chessboard', 'A chessboard is made of squares.', 'शतरंज की बिसात वर्गों से बनी है।'),
  T('rectangle', ['aayat'], ['आयत'], 'door', 'A door is shaped like a rectangle.', 'दरवाज़ा आयत के आकार का है।'),
  T('cube', [], [], 'dice', 'A dice is shaped like a cube.', 'पासा घन के आकार का है।'),
  T('sphere', ['ball'], ['गोला', 'गेंद'], 'football ball', 'A ball is shaped like a sphere.', 'गेंद गोले के आकार की है।'),
  T('cylinder', ['belan'], ['बेलन'], 'tin can', 'A tin is shaped like a cylinder.', 'डिब्बा बेलन के आकार का है।'),
  T('cone', ['shanku'], ['शंकु'], 'traffic cone', 'A traffic cone is shaped like a cone.', 'यह शंकु के आकार का है।'),
];

// The thing the question (then the board's title) names first, or null.
export function youngThing(texts: readonly string[]): Thing | null {
  for (const text of texts) {
    if (!text) continue;
    let best: { thing: Thing; at: number } | null = null;
    for (const thing of YOUNG_THINGS) {
      const at = Math.min(thing.match.exec(text)?.index ?? Infinity, thing.hi?.exec(text)?.index ?? Infinity);
      if (at !== Infinity && (!best || at < best.at)) best = { thing, at };
    }
    if (best) return best.thing;
  }
  return null;
}

// The photo the youngest child's answer asks for: an image block with the list's search words and caption, or null.
export function youngPhotoQuery(texts: readonly string[], lang: string): ImageQuery | null {
  const thing = youngThing(texts);
  return thing ? { type: 'image', query: thing.query, caption: lang === 'hi' ? thing.hiCaption : thing.en } : null;
}
