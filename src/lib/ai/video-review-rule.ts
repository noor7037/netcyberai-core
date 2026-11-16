// The rule for hiding a reviewed video, kept free of server code so the phone's bundle can import it
// (the same rule as content.video_hidden in the database).
// A video below 4 for child safety or below 3 for accuracy is never shown.
export const VIDEO_REVIEW_MIN = { childSafety: 4, accuracy: 3 } as const;
export const videoReviewHides = (r: { child_safety: number; accuracy: number }): boolean => r.child_safety < VIDEO_REVIEW_MIN.childSafety || r.accuracy < VIDEO_REVIEW_MIN.accuracy;
