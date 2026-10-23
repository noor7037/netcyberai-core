// Shown the moment a tab or a link is tapped (C230-Y), while the server builds the next screen: Next.js prefetches it
// with the tabs, so the tap answers at once instead of the old screen staying still. Shapes only, no words to read.
export default function FamilyLoading() {
  return (
    <div aria-busy="true" data-family-loading className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-6">
      <div className="fam-skeleton h-28 rounded-[2rem]" />
      <div className="fam-skeleton h-40 rounded-[1.5rem]" />
      <div className="fam-skeleton h-24 rounded-[1.5rem]" />
    </div>
  );
}
