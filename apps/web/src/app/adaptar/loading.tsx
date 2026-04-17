export default function AdaptarLoading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#F2F2F2]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
    </div>
  );
}
