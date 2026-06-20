import { EcvPulseLoader } from "@/components/ecv-loader";

export default function AdaptarLoading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#f0eee9]">
      <EcvPulseLoader size={48} />
    </div>
  );
}
