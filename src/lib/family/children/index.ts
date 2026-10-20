/**
 * Family Children Profiles & Progress Tracking
 * (docs/family-app/02_PRODUCT.md §3 & 03_ARCHITECTURE.md §5)
 */

import type {
  FamilyChild,
  ChildProfileInput,
  TopicProgress,
  TopicProgressStatus,
  ParentDailyCard,
} from '@/lib/contracts/family-types';
import { getTopicById } from '@/lib/family/syllabus/catalog';

const CHILDREN_STORE = new Map<string, FamilyChild[]>();
const PROGRESS_STORE = new Map<string, Map<string, TopicProgress>>(); // childId -> (topicId -> progress)

// Seed initial children for instant review
const DEMO_ACCOUNT_ID = 'fam-acc-demo-101';
const SEED_CHILDREN: FamilyChild[] = [
  {
    childId: 'child-aarav-9',
    accountId: DEMO_ACCOUNT_ID,
    firstName: 'Aarav Sharma',
    grade: 9,
    board: 'CBSE',
    medium: 'hi',
    state: 'Delhi',
    createdAt: new Date().toISOString(),
  },
  {
    childId: 'child-diya-6',
    accountId: DEMO_ACCOUNT_ID,
    firstName: 'Diya Sharma',
    grade: 6,
    board: 'CBSE',
    medium: 'en',
    state: 'Delhi',
    createdAt: new Date().toISOString(),
  },
];

CHILDREN_STORE.set(DEMO_ACCOUNT_ID, SEED_CHILDREN);

export function getChildrenForAccount(accountId: string): FamilyChild[] {
  return CHILDREN_STORE.get(accountId) || [];
}

export function getChildById(childId: string): FamilyChild | undefined {
  for (const list of Array.from(CHILDREN_STORE.values())) {
    const found = list.find((c) => c.childId === childId);
    if (found) return found;
  }
  return undefined;
}

export function addChildProfile(accountId: string, input: ChildProfileInput): FamilyChild {
  const list = CHILDREN_STORE.get(accountId) || [];
  const newChild: FamilyChild = {
    childId: `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    accountId,
    firstName: input.firstName.trim(),
    grade: input.grade,
    board: input.board || 'CBSE',
    medium: input.medium || 'hi',
    state: input.state || 'Delhi',
    createdAt: new Date().toISOString(),
  };
  list.push(newChild);
  CHILDREN_STORE.set(accountId, list);
  return newChild;
}

export function getTopicProgress(childId: string, topicId: string): TopicProgress {
  let childMap = PROGRESS_STORE.get(childId);
  if (!childMap) {
    childMap = new Map<string, TopicProgress>();
    PROGRESS_STORE.set(childId, childMap);
  }

  const existing = childMap.get(topicId);
  if (existing) return existing;

  const initial: TopicProgress = {
    topicId,
    childId,
    status: 'introduced',
    checksPassed: 0,
    misconceptionsRecorded: [],
  };
  childMap.set(topicId, initial);
  return initial;
}

export function updateCheckProgress(
  childId: string,
  topicId: string,
  isCorrect: boolean,
  misconceptionTag?: string
): TopicProgress {
  const current = getTopicProgress(childId, topicId);
  if (isCorrect) {
    current.checksPassed += 1;
    current.status = current.checksPassed >= 2 ? 'mastered' : 'checked';
  } else {
    current.status = 'practised';
    if (misconceptionTag && !current.misconceptionsRecorded.includes(misconceptionTag)) {
      current.misconceptionsRecorded.push(misconceptionTag);
    }
  }
  current.lastCheckedAt = new Date().toISOString();

  let childMap = PROGRESS_STORE.get(childId);
  if (!childMap) {
    childMap = new Map();
    PROGRESS_STORE.set(childId, childMap);
  }
  childMap.set(topicId, current);
  return current;
}

/**
 * Computes the calm, reassuring 1-line parent update card
 */
export function getParentDailyCard(childId: string): ParentDailyCard {
  const child = getChildById(childId);
  const childName = child ? child.firstName : 'आपका बच्चा';
  const childMap = PROGRESS_STORE.get(childId);

  // Default calm card if no activity yet
  if (!childMap || childMap.size === 0) {
    return {
      childName,
      practisedTopic: 'गति एवं त्वरण (Motion & Acceleration)',
      masteryStatus: 'introduced',
      tonightTalkQuestion:
        'आज रात खाने पर पूछें: "जब बस अचानक गति पकड़ती है, तो पीछे की तरफ धक्का क्यों महसूस होता है?"',
      calmInsight:
        'आरव ने आज भौतिकी के बुनियादी सिद्धांतों को समझना शुरू किया है। किसी परीक्षा का तनाव नहीं, बस सीखने का आनंद।',
    };
  }

  const firstProgress = Array.from(childMap.values())[0];
  const topic = getTopicById(firstProgress.topicId);
  const topicTitle = topic ? topic.topicTitleHi : firstProgress.topicId;

  return {
    childName,
    practisedTopic: topicTitle,
    masteryStatus: firstProgress.status,
    tonightTalkQuestion:
      'आज रात पूछें: "यदि कार की गति स्थिर हो, तो क्या उसका त्वरण शून्य होगा?"',
    calmInsight:
      firstProgress.status === 'checked' || firstProgress.status === 'mastered'
        ? `${childName} ने आज जाँच प्रश्न का सही उत्तर दिया और त्वरण की अवधारणा को समझ लिया है।`
        : `${childName} ने आज अवधारणा का अभ्यास किया और समझने की दिशा में एक कदम आगे बढ़ाया।`,
  };
}
